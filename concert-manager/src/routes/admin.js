const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { requireAuth } = require("../auth");
const { sendOfferEmail } = require("../mailer");
const { verifyPassword } = require("../password");

const router = express.Router();

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

  res.render("dashboard", { concerts, counts });
});

// --- Musicians -------------------------------------------------------

router.get("/musicians", requireAuth, (req, res) => {
  const musicians = db.prepare("SELECT * FROM musicians ORDER BY name").all();
  res.render("musicians", { musicians, error: null });
});

router.post("/musicians", requireAuth, (req, res) => {
  const { name, email, phone, instrument, notes } = req.body;
  if (!name || !email) {
    const musicians = db.prepare("SELECT * FROM musicians ORDER BY name").all();
    return res.render("musicians", { musicians, error: "Name and email are required." });
  }
  db.prepare(
    "INSERT INTO musicians (name, email, phone, instrument, notes) VALUES (?, ?, ?, ?, ?)"
  ).run(name, email, phone || null, instrument || null, notes || null);
  res.redirect("/musicians");
});

router.post("/musicians/:id/delete", requireAuth, (req, res) => {
  db.prepare("DELETE FROM musicians WHERE id = ?").run(req.params.id);
  res.redirect("/musicians");
});

router.get("/musicians/:id/edit", requireAuth, (req, res) => {
  const musician = db.prepare("SELECT * FROM musicians WHERE id = ?").get(req.params.id);
  if (!musician) return res.status(404).send("Musician not found");
  res.render("musician-edit", { musician, error: null });
});

router.post("/musicians/:id/edit", requireAuth, (req, res) => {
  const musician = db.prepare("SELECT * FROM musicians WHERE id = ?").get(req.params.id);
  if (!musician) return res.status(404).send("Musician not found");

  const { name, email, phone, instrument, notes } = req.body;
  if (!name || !email) {
    return res.render("musician-edit", { musician: { ...musician, ...req.body }, error: "Name and email are required." });
  }

  db.prepare(
    "UPDATE musicians SET name = ?, email = ?, phone = ?, instrument = ?, notes = ? WHERE id = ?"
  ).run(name, email, phone || null, instrument || null, notes || null, req.params.id);
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

router.post("/concerts", requireAuth, (req, res) => {
  const { title, venue, date, call_time, concert_time, fee_default, notes } = req.body;
  const info = db
    .prepare(
      `INSERT INTO concerts (title, venue, date, call_time, concert_time, fee_default, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(title, venue || null, date || null, call_time || null, concert_time || null, fee_default || null, notes || null);
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
      `SELECT offers.*, musicians.name AS musician_name, musicians.email AS musician_email
       FROM offers JOIN musicians ON musicians.id = offers.musician_id
       WHERE offers.concert_id = ? ORDER BY offers.created_at DESC`
    )
    .all(concert.id);
  const musicians = db.prepare("SELECT * FROM musicians ORDER BY name").all();

  res.render("concert", { concert, repertoire, rehearsals, offers, musicians, sendResult: null });
});

router.post("/concerts/:id/delete", requireAuth, (req, res) => {
  db.prepare("DELETE FROM concerts WHERE id = ?").run(req.params.id);
  res.redirect("/");
});

router.get("/concerts/:id/edit", requireAuth, (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  if (!concert) return res.status(404).send("Concert not found");
  res.render("concert-edit", { concert, error: null });
});

router.post("/concerts/:id/edit", requireAuth, (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  if (!concert) return res.status(404).send("Concert not found");

  const { title, venue, date, call_time, concert_time, fee_default, notes } = req.body;
  if (!title) {
    return res.render("concert-edit", { concert: { ...concert, ...req.body }, error: "Title is required." });
  }

  db.prepare(
    `UPDATE concerts SET title = ?, venue = ?, date = ?, call_time = ?, concert_time = ?, fee_default = ?, notes = ?
     WHERE id = ?`
  ).run(title, venue || null, date || null, call_time || null, concert_time || null, fee_default || null, notes || null, req.params.id);
  res.redirect(`/concerts/${req.params.id}`);
});

// --- Repertoire ----------------------------------------------------------

router.post("/concerts/:id/repertoire", requireAuth, (req, res) => {
  const { composer, title, movement, duration, instrumentation_notes } = req.body;
  const nextOrder = db
    .prepare("SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM repertoire WHERE concert_id = ?")
    .get(req.params.id).n;
  db.prepare(
    `INSERT INTO repertoire (concert_id, sort_order, composer, title, movement, duration, instrumentation_notes)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, nextOrder, composer || null, title, movement || null, duration || null, instrumentation_notes || null);
  res.redirect(`/concerts/${req.params.id}`);
});

router.get("/concerts/:id/repertoire/:pieceId/edit", requireAuth, (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  const piece = db.prepare("SELECT * FROM repertoire WHERE id = ? AND concert_id = ?").get(req.params.pieceId, req.params.id);
  if (!concert || !piece) return res.status(404).send("Not found");
  res.render("repertoire-edit", { concert, piece, error: null });
});

router.post("/concerts/:id/repertoire/:pieceId/edit", requireAuth, (req, res) => {
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
  res.redirect(`/concerts/${req.params.id}`);
});

router.post("/concerts/:id/repertoire/:pieceId/delete", requireAuth, (req, res) => {
  db.prepare("DELETE FROM repertoire WHERE id = ? AND concert_id = ?").run(req.params.pieceId, req.params.id);
  res.redirect(`/concerts/${req.params.id}`);
});

// --- Rehearsals ----------------------------------------------------------

router.post("/concerts/:id/rehearsals", requireAuth, (req, res) => {
  const { date, start_time, end_time, location, notes } = req.body;
  db.prepare(
    `INSERT INTO rehearsals (concert_id, date, start_time, end_time, location, notes)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(req.params.id, date || null, start_time || null, end_time || null, location || null, notes || null);
  res.redirect(`/concerts/${req.params.id}`);
});

router.get("/concerts/:id/rehearsals/:rehearsalId/edit", requireAuth, (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  const rehearsal = db
    .prepare("SELECT * FROM rehearsals WHERE id = ? AND concert_id = ?")
    .get(req.params.rehearsalId, req.params.id);
  if (!concert || !rehearsal) return res.status(404).send("Not found");
  res.render("rehearsal-edit", { concert, rehearsal, error: null });
});

router.post("/concerts/:id/rehearsals/:rehearsalId/edit", requireAuth, (req, res) => {
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
  res.redirect(`/concerts/${req.params.id}`);
});

router.post("/concerts/:id/rehearsals/:rehearsalId/delete", requireAuth, (req, res) => {
  db.prepare("DELETE FROM rehearsals WHERE id = ? AND concert_id = ?").run(req.params.rehearsalId, req.params.id);
  res.redirect(`/concerts/${req.params.id}`);
});

// --- Offers ----------------------------------------------------------

router.post("/concerts/:id/offers", requireAuth, async (req, res) => {
  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(req.params.id);
  if (!concert) return res.status(404).send("Concert not found");

  const musicianIds = [].concat(req.body.musician_id || []).filter(Boolean);
  const { role_part, fee } = req.body;
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
        `INSERT INTO offers (concert_id, musician_id, role_part, fee, token, sent_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))`
      )
      .run(concert.id, musician.id, role_part || null, fee || concert.fee_default || null, token);

    const offer = db.prepare("SELECT * FROM offers WHERE id = ?").get(info.lastInsertRowid);
    const result = await sendOfferEmail({ musician, concert, repertoire, rehearsals, offer, ensemble, baseUrl });
    results.push({ musician: musician.name, ...result });
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
        `SELECT offers.*, musicians.name AS musician_name, musicians.email AS musician_email
         FROM offers JOIN musicians ON musicians.id = offers.musician_id
         WHERE offers.concert_id = ? ORDER BY offers.created_at DESC`
      )
      .all(concert.id),
    musicians: db.prepare("SELECT * FROM musicians ORDER BY name").all(),
  };

  res.render("concert", { ...refreshed, sendResult: results });
});

router.post("/offers/:id/delete", requireAuth, (req, res) => {
  const offer = db.prepare("SELECT * FROM offers WHERE id = ?").get(req.params.id);
  if (!offer) return res.status(404).send("Offer not found");
  db.prepare("DELETE FROM offers WHERE id = ?").run(req.params.id);
  res.redirect(`/concerts/${offer.concert_id}`);
});

module.exports = router;
