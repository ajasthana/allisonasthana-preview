const express = require("express");
const crypto = require("crypto");
const multer = require("multer");
const db = require("../db");
const { requireAuth } = require("../auth");
const { sendOfferEmail, sendConcertUpdateEmail } = require("../mailer");
const { verifyPassword } = require("../password");
const { parseRosterFile, templateCsv } = require("../roster-import");
const { fullName } = require("../names");
const { parseFee, formatCurrency } = require("../payroll");
const { buildCalendar } = require("../calendar");

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    if (/\.csv$/i.test(file.originalname)) {
      cb(null, true);
    } else {
      cb(new Error("Please upload a .csv file (export your spreadsheet as CSV first)."));
    }
  },
});

router.get("/login", (req, res) => {
  res.render("login", { error: null });
});

router.post("/login", (req, res) => {
  const { password } = req.body;
  const hash = process.env.ADMIN_PASSWORD_HASH;

  if (!hash) {
    return res.render("login", {
      error: "ADMIN_PASSWORD_HASH is not set. Run `npm run hash-password -- \"your-password\"` and add it to .env.",
    });
  }

  const ok = password && verifyPassword(password, hash);
  if (!ok) {
    return res.render("login", { error: "Incorrect password." });
  }

  req.session.isAdmin = true;
  res.redirect("/");
});

router.post("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/login"));
});

router.get("/", requireAuth, (req, res) => {
  const concerts = db.prepare("SELECT * FROM concerts ORDER BY date IS NULL, date DESC").all();
  const counts = db
    .prepare(
      `SELECT concert_id,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
              SUM(CASE WHEN status = 'accepted' THEN 1 ELSE 0 END) AS accepted,
              SUM(CASE WHEN status = 'declined' THEN 1 ELSE 0 END) AS declined
       FROM offers GROUP BY concert_id`
    )
    .all()
    .reduce((acc, row) => ({ ...acc, [row.concert_id]: row }), {});

  const acceptedFees = db.prepare("SELECT concert_id, fee FROM offers WHERE status = 'accepted'").all();
  const payrollByConcert = {};
  let totalPayroll = 0;
  acceptedFees.forEach((row) => {
    const amount = parseFee(row.fee);
    payrollByConcert[row.concert_id] = (payrollByConcert[row.concert_id] || 0) + amount;
    totalPayroll += amount;
  });
  Object.keys(payrollByConcert).forEach((id) => {
    payrollByConcert[id] = formatCurrency(payrollByConcert[id]);
  });

  const calendar = buildCalendar(db, req.query.month);

  const todayIso = new Date().toISOString().slice(0, 10);
  const upcomingConcerts = db
    .prepare("SELECT id, title, date, venue FROM concerts WHERE date >= ? ORDER BY date LIMIT 5")
    .all(todayIso);
  const upcomingRehearsals = db
    .prepare(
      `SELECT rehearsals.date, rehearsals.location, concerts.title, concerts.id AS concert_id
       FROM rehearsals JOIN concerts ON concerts.id = rehearsals.concert_id
       WHERE rehearsals.date >= ? ORDER BY rehearsals.date LIMIT 5`
    )
    .all(todayIso);
  const upcoming = [
    ...upcomingConcerts.map((c) => ({ type: "concert", date: c.date, label: c.title, sub: c.venue, concertId: c.id })),
    ...upcomingRehearsals.map((r) => ({
      type: "rehearsal",
      date: r.date,
      label: r.title,
      sub: r.location,
      concertId: r.concert_id,
    })),
  ]
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 6);

  res.render("dashboard", {
    concerts,
    counts,
    payrollByConcert,
    totalPayroll: formatCurrency(totalPayroll),
    calendar,
    upcoming,
  });
});

// --- Musicians -------------------------------------------------------

function confirmedConcertsByMusician() {
  const rows = db
    .prepare(
      `SELECT offers.musician_id, concerts.title
       FROM offers JOIN concerts ON concerts.id = offers.concert_id
       WHERE offers.status = 'accepted'
       ORDER BY concerts.date IS NULL, concerts.date`
    )
    .all();
  const map = {};
  rows.forEach((row) => {
    if (!map[row.musician_id]) map[row.musician_id] = [];
    map[row.musician_id].push(row.title);
  });
  return map;
}

router.get("/musicians", requireAuth, (req, res) => {
  const musicians = db.prepare("SELECT * FROM musicians ORDER BY last_name, first_name").all();
  res.render("musicians", { musicians, error: null, importResult: null, confirmed: confirmedConcertsByMusician() });
});

router.post("/musicians", requireAuth, (req, res) => {
  const { first_name, last_name, email, phone, instrument, notes, musician_type } = req.body;
  if (!first_name || !last_name || !email) {
    const musicians = db.prepare("SELECT * FROM musicians ORDER BY last_name, first_name").all();
    return res.render("musicians", { musicians, error: "First name, last name, and email are required.", importResult: null, confirmed: confirmedConcertsByMusician() });
  }
  db.prepare(
    "INSERT INTO musicians (first_name, last_name, email, phone, instrument, notes, musician_type) VALUES (?, ?, ?, ?, ?, ?, ?)"
  ).run(first_name, last_name, email, phone || null, instrument || null, notes || null, musician_type === "substitute" ? "substitute" : "core");
  res.redirect("/musicians");
});

router.post("/musicians/:id/delete", requireAuth, (req, res) => {
  db.prepare("DELETE FROM musicians WHERE id = ?").run(req.params.id);
  res.redirect("/musicians");
});

router.get("/musicians/import/template", requireAuth, (req, res) => {
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", 'attachment; filename="musician-roster-template.csv"');
  res.send(templateCsv());
});

router.post("/musicians/import", requireAuth, (req, res) => {
  upload.single("file")(req, res, (uploadErr) => {
    const musicians = db.prepare("SELECT * FROM musicians ORDER BY last_name, first_name").all();

    if (uploadErr) {
      return res.render("musicians", { musicians, error: uploadErr.message, importResult: null, confirmed: confirmedConcertsByMusician() });
    }
    if (!req.file) {
      return res.render("musicians", { musicians, error: "Choose a spreadsheet file to import.", importResult: null, confirmed: confirmedConcertsByMusician() });
    }

    let rows;
    try {
      rows = parseRosterFile(req.file.buffer);
    } catch (parseErr) {
      return res.render("musicians", {
        musicians,
        error: "Could not read that file. Make sure it's a .csv export.",
        importResult: null,
        confirmed: confirmedConcertsByMusician(),
      });
    }

    const anyRecognized = rows.some((row) => row.first_name || row.last_name || row.email);
    if (rows.length && !anyRecognized) {
      return res.render("musicians", {
        musicians,
        error: "We couldn't find Name or Email columns in that file. Download the template below for the expected format.",
        importResult: null,
        confirmed: confirmedConcertsByMusician(),
      });
    }

    const insertStmt = db.prepare(
      "INSERT INTO musicians (first_name, last_name, email, phone, instrument, notes, musician_type) VALUES (?, ?, ?, ?, ?, ?, ?)"
    );
    const updateStmt = db.prepare(
      "UPDATE musicians SET first_name = ?, last_name = ?, phone = ?, instrument = ?, notes = ?, musician_type = ? WHERE id = ?"
    );
    const findByEmail = db.prepare("SELECT id FROM musicians WHERE lower(email) = lower(?)");

    let added = 0;
    let updated = 0;
    const skipped = [];

    rows.forEach((row, index) => {
      const firstName = (row.first_name || "").trim();
      const lastName = (row.last_name || "").trim();
      const email = (row.email || "").trim();
      const musicianType = row.musician_type === "substitute" ? "substitute" : "core";

      if (!firstName || !email) {
        skipped.push(`Row ${index + 2}: missing ${!firstName ? "name" : "email"}`);
        return;
      }

      const existing = findByEmail.get(email);
      if (existing) {
        updateStmt.run(firstName, lastName, row.phone || null, row.instrument || null, row.notes || null, musicianType, existing.id);
        updated += 1;
      } else {
        insertStmt.run(firstName, lastName, email, row.phone || null, row.instrument || null, row.notes || null, musicianType);
        added += 1;
      }
    });

    const refreshedMusicians = db.prepare("SELECT * FROM musicians ORDER BY last_name, first_name").all();
    res.render("musicians", {
      musicians: refreshedMusicians,
      error: null,
      importResult: { added, updated, skipped, total: rows.length },
      confirmed: confirmedConcertsByMusician(),
    });
  });
});

router.get("/musicians/:id/edit", requireAuth, (req, res) => {
  const musician = db.prepare("SELECT * FROM musicians WHERE id = ?").get(req.params.id);
  if (!musician) return res.status(404).send("Musician not found");
  res.render("musician-edit", { musician, error: null });
});

router.post("/musicians/:id/edit", requireAuth, (req, res) => {
  const musician = db.prepare("SELECT * FROM musicians WHERE id = ?").get(req.params.id);
  if (!musician) return res.status(404).send("Musician not found");

  const { first_name, last_name, email, phone, instrument, notes, musician_type } = req.body;
  if (!first_name || !last_name || !email) {
    return res.render("musician-edit", {
      musician: { ...musician, ...req.body },
      error: "First name, last name, and email are required.",
    });
  }

  db.prepare(
    "UPDATE musicians SET first_name = ?, last_name = ?, email = ?, phone = ?, instrument = ?, notes = ?, musician_type = ? WHERE id = ?"
  ).run(
    first_name,
    last_name,
    email,
    phone || null,
    instrument || null,
    notes || null,
    musician_type === "substitute" ? "substitute" : "core",
    req.params.id
  );
  res.redirect("/musicians");
});

// --- Ensemble profile ----------------------------------------------------

router.get("/ensemble-profile", requireAuth, (req, res) => {
  const profile = db.prepare("SELECT * FROM ensemble_profile WHERE id = 1").get();
  res.render("ensemble-profile", { profile, saved: false });
});

router.post("/ensemble-profile", requireAuth, (req, res) => {
  const { name, email, website } = req.body;
  db.prepare("UPDATE ensemble_profile SET name = ?, email = ?, website = ? WHERE id = 1").run(
    name || "",
    email || "",
    website || ""
  );
  const profile = db.prepare("SELECT * FROM ensemble_profile WHERE id = 1").get();
  res.render("ensemble-profile", { profile, saved: true });
});

// --- Concerts ----------------------------------------------------------

async function notifyConcertUpdate(concertId, req) {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(concertId);
  if (!concert) return 0;

  const repertoire = db.prepare("SELECT * FROM repertoire WHERE concert_id = ? ORDER BY sort_order, id").all(concertId);
  const rehearsals = db.prepare("SELECT * FROM rehearsals WHERE concert_id = ? ORDER BY date, start_time").all(concertId);
  const ensemble = db.prepare("SELECT * FROM ensemble_profile WHERE id = 1").get();
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

  const acceptedOffers = db
    .prepare(
      `SELECT offers.*, musicians.first_name, musicians.last_name, musicians.email AS musician_email
       FROM offers JOIN musicians ON musicians.id = offers.musician_id
       WHERE offers.concert_id = ? AND offers.status = 'accepted'`
    )
    .all(concertId);

  for (const offer of acceptedOffers) {
    const musician = { first_name: offer.first_name, last_name: offer.last_name, email: offer.musician_email };
    await sendConcertUpdateEmail({ musician, concert, repertoire, rehearsals, offer, ensemble, baseUrl });
  }

  return acceptedOffers.length;
}

function withNotifyRedirect(concertId, count, res) {
  res.redirect(`/concerts/${concertId}${count ? `?notified=${count}` : ""}`);
}

router.post("/concerts", requireAuth, (req, res) => {
  const { title, venue, date, call_time, concert_time, fee_default, sheet_music_url, notes } = req.body;
  const info = db
    .prepare(
      `INSERT INTO concerts (title, venue, date, call_time, concert_time, fee_default, sheet_music_url, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, venue || null, date || null, call_time || null, concert_time || null, fee_default || null, sheet_music_url || null, notes || null);
  res.redirect(`/concerts/${info.lastInsertRowid}`);
});

router.get("/concerts/:id", requireAuth, (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  if (!concert) return res.status(404).send("Concert not found");

  const repertoire = db
    .prepare("SELECT * FROM repertoire WHERE concert_id = ? ORDER BY sort_order, id")
    .all(concert.id);
  const rehearsals = db
    .prepare("SELECT * FROM rehearsals WHERE concert_id = ? ORDER BY date, start_time")
    .all(concert.id);
  const offers = db
    .prepare(
      `SELECT offers.*, (musicians.first_name || ' ' || musicians.last_name) AS musician_name, musicians.email AS musician_email
       FROM offers JOIN musicians ON musicians.id = offers.musician_id
       WHERE offers.concert_id = ? ORDER BY offers.created_at DESC`
    )
    .all(concert.id);
  const musicians = db.prepare("SELECT * FROM musicians ORDER BY last_name, first_name").all();
  const notifiedCount = req.query.notified ? Number(req.query.notified) : null;

  res.render("concert", { concert, repertoire, rehearsals, offers, musicians, sendResult: null, notifiedCount });
});

router.post("/concerts/:id/delete", requireAuth, (req, res) => {
  db.prepare("DELETE FROM concerts WHERE id = ?").run(req.params.id);
  res.redirect("/");
});

router.post("/concerts/:id/duplicate", requireAuth, (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  if (!concert) return res.status(404).send("Concert not found");

  const info = db
    .prepare(
      `INSERT INTO concerts (title, venue, call_time, concert_time, fee_default, sheet_music_url, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(concert.title, concert.venue, concert.call_time, concert.concert_time, concert.fee_default, concert.sheet_music_url, concert.notes);
  const newConcertId = info.lastInsertRowid;

  const repertoire = db.prepare("SELECT * FROM repertoire WHERE concert_id = ? ORDER BY sort_order, id").all(concert.id);
  const insertPiece = db.prepare(
    `INSERT INTO repertoire (concert_id, sort_order, composer, title, movement, duration, instrumentation_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  );
  repertoire.forEach((piece) => {
    insertPiece.run(newConcertId, piece.sort_order, piece.composer, piece.title, piece.movement, piece.duration, piece.instrumentation_notes);
  });

  res.redirect(`/concerts/${newConcertId}/edit`);
});

router.get("/concerts/:id/edit", requireAuth, (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  if (!concert) return res.status(404).send("Concert not found");
  res.render("concert-edit", { concert, error: null });
});

router.post("/concerts/:id/edit", requireAuth, async (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  if (!concert) return res.status(404).send("Concert not found");

  const { title, venue, date, call_time, concert_time, fee_default, sheet_music_url, notes } = req.body;
  if (!title) {
    return res.render("concert-edit", { concert: { ...concert, ...req.body }, error: "Title is required." });
  }

  db.prepare(
    `UPDATE concerts SET title = ?, venue = ?, date = ?, call_time = ?, concert_time = ?, fee_default = ?, sheet_music_url = ?, notes = ?
     WHERE id = ?`
  ).run(title, venue || null, date || null, call_time || null, concert_time || null, fee_default || null, sheet_music_url || null, notes || null, req.params.id);
  const notified = await notifyConcertUpdate(req.params.id, req);
  withNotifyRedirect(req.params.id, notified, res);
});

// --- Repertoire ----------------------------------------------------------

router.post("/concerts/:id/repertoire", requireAuth, async (req, res) => {
  const { composer, title, movement, duration, instrumentation_notes } = req.body;
  const nextOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM repertoire WHERE concert_id = ?")
    .get(req.params.id).n;
  db.prepare(
    `INSERT INTO repertoire (concert_id, sort_order, composer, title, movement, duration, instrumentation_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, nextOrder, composer || null, title, movement || null, duration || null, instrumentation_notes || null);
  const notified = await notifyConcertUpdate(req.params.id, req);
  withNotifyRedirect(req.params.id, notified, res);
});

router.get("/concerts/:id/repertoire/:pieceId/edit", requireAuth, (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  const piece = db.prepare("SELECT * FROM repertoire WHERE id = ? AND concert_id = ?").get(req.params.pieceId, req.params.id);
  if (!concert || !piece) return res.status(404).send("Not found");
  res.render("repertoire-edit", { concert, piece, error: null });
});

router.post("/concerts/:id/repertoire/:pieceId/edit", requireAuth, async (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  const piece = db.prepare("SELECT * FROM repertoire WHERE id = ? AND concert_id = ?").get(req.params.pieceId, req.params.id);
  if (!concert || !piece) return res.status(404).send("Not found");

  const { composer, title, movement, duration, instrumentation_notes } = req.body;
  if (!title) {
    return res.render("repertoire-edit", {
      concert,
      piece: { ...piece, ...req.body },
      error: "Title is required.",
    });
  }

  db.prepare(
    `UPDATE repertoire SET composer = ?, title = ?, movement = ?, duration = ?, instrumentation_notes = ?
     WHERE id = ? AND concert_id = ?`
  ).run(composer || null, title, movement || null, duration || null, instrumentation_notes || null, req.params.pieceId, req.params.id);
  const notified = await notifyConcertUpdate(req.params.id, req);
  withNotifyRedirect(req.params.id, notified, res);
});

router.post("/concerts/:id/repertoire/:pieceId/delete", requireAuth, async (req, res) => {
  db.prepare("DELETE FROM repertoire WHERE id = ? AND concert_id = ?").run(req.params.pieceId, req.params.id);
  const notified = await notifyConcertUpdate(req.params.id, req);
  withNotifyRedirect(req.params.id, notified, res);
});

// --- Rehearsals ----------------------------------------------------------

router.post("/concerts/:id/rehearsals", requireAuth, async (req, res) => {
  const { date, start_time, end_time, location, notes } = req.body;
  db.prepare(
    `INSERT INTO rehearsals (concert_id, date, start_time, end_time, location, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, date || null, start_time || null, end_time || null, location || null, notes || null);
  const notified = await notifyConcertUpdate(req.params.id, req);
  withNotifyRedirect(req.params.id, notified, res);
});

router.get("/concerts/:id/rehearsals/:rehearsalId/edit", requireAuth, (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  const rehearsal = db
    .prepare("SELECT * FROM rehearsals WHERE id = ? AND concert_id = ?")
    .get(req.params.rehearsalId, req.params.id);
  if (!concert || !rehearsal) return res.status(404).send("Not found");
  res.render("rehearsal-edit", { concert, rehearsal, error: null });
});

router.post("/concerts/:id/rehearsals/:rehearsalId/edit", requireAuth, async (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  const rehearsal = db
    .prepare("SELECT * FROM rehearsals WHERE id = ? AND concert_id = ?")
    .get(req.params.rehearsalId, req.params.id);
  if (!concert || !rehearsal) return res.status(404).send("Not found");

  const { date, start_time, end_time, location, notes } = req.body;
  db.prepare(
    `UPDATE rehearsals SET date = ?, start_time = ?, end_time = ?, location = ?, notes = ?
     WHERE id = ? AND concert_id = ?`
  ).run(date || null, start_time || null, end_time || null, location || null, notes || null, req.params.rehearsalId, req.params.id);
  const notified = await notifyConcertUpdate(req.params.id, req);
  withNotifyRedirect(req.params.id, notified, res);
});

router.post("/concerts/:id/rehearsals/:rehearsalId/delete", requireAuth, async (req, res) => {
  db.prepare("DELETE FROM rehearsals WHERE id = ? AND concert_id = ?").run(req.params.rehearsalId, req.params.id);
  const notified = await notifyConcertUpdate(req.params.id, req);
  withNotifyRedirect(req.params.id, notified, res);
});

// --- Offers ----------------------------------------------------------

router.post("/concerts/:id/offers", requireAuth, async (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  if (!concert) return res.status(404).send("Concert not found");

  const musicianIds = [].concat(req.body.musician_id || []).filter(Boolean);
  const { role_part, fee, custom_message } = req.body;
  const repertoire = db
    .prepare("SELECT * FROM repertoire WHERE concert_id = ? ORDER BY sort_order, id")
    .all(concert.id);
  const rehearsals = db
    .prepare("SELECT * FROM rehearsals WHERE concert_id = ? ORDER BY date, start_time")
    .all(concert.id);
  const ensemble = db.prepare("SELECT * FROM ensemble_profile WHERE id = 1").get();
  const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;

  const results = [];
  for (const musicianId of musicianIds) {
    const musician = db.prepare("SELECT * FROM musicians WHERE id = ?").get(musicianId);
    if (!musician) continue;

    const token = crypto.randomBytes(24).toString("hex");
    const info = db
      .prepare(
        `INSERT INTO offers (concert_id, musician_id, role_part, fee, token, custom_message, sent_at)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(concert.id, musician.id, role_part || null, fee || concert.fee_default || null, token, custom_message || null);

    const offer = db.prepare("SELECT * FROM offers WHERE id = ?").get(info.lastInsertRowid);
    const result = await sendOfferEmail({ musician, concert, repertoire, rehearsals, offer, ensemble, baseUrl });
    results.push({ musician: fullName(musician), ...result });
  }

  if (musicianIds.length) {
    db.prepare("UPDATE concerts SET status = 'offers_sent' WHERE id = ? AND status = 'planning'").run(concert.id);
  }

  const refreshed = {
    concert: db.prepare("SELECT * FROM concerts WHERE id = ?").get(concert.id),
    repertoire,
    rehearsals,
    offers: db
      .prepare(
        `SELECT offers.*, (musicians.first_name || ' ' || musicians.last_name) AS musician_name, musicians.email AS musician_email
         FROM offers JOIN musicians ON musicians.id = offers.musician_id
         WHERE offers.concert_id = ? ORDER BY offers.created_at DESC`
      )
      .all(concert.id),
    musicians: db.prepare("SELECT * FROM musicians ORDER BY last_name, first_name").all(),
  };

  res.render("concert", { ...refreshed, sendResult: results, notifiedCount: null });
});

router.post("/offers/:id/delete", requireAuth, (req, res) => {
  const offer = db.prepare("SELECT * FROM offers WHERE id = ?").get(req.params.id);
  if (!offer) return res.status(404).send("Offer not found");
  db.prepare("DELETE FROM offers WHERE id = ?").run(req.params.id);
  res.redirect(`/concerts/${offer.concert_id}`);
});

module.exports = router;
