const express = require("express");
const db = require("../db");
const { sendResponseNoteNotification } = require("../mailer");

const router = express.Router();

function loadOfferBundle(token) {
  const offer = db.prepare("SELECT * FROM offers WHERE token = ?").get(token);
  if (!offer) return null;

  const concert = db.prepare("SELECT * FROM concerts WHERE id = ?").get(offer.concert_id);
  const musician = db.prepare("SELECT * FROM musicians WHERE id = ?").get(offer.musician_id);
  const repertoire = db
    .prepare("SELECT * FROM repertoire WHERE concert_id = ? ORDER BY sort_order, id")
    .all(offer.concert_id);
  const rehearsals = db
    .prepare("SELECT * FROM rehearsals WHERE concert_id = ? ORDER BY date, start_time")
    .all(offer.concert_id);

  return { offer, concert, musician, repertoire, rehearsals };
}

// Musician's persistent view of this offer / concert details.
router.get("/:token", (req, res) => {
  const bundle = loadOfferBundle(req.params.token);
  if (!bundle) return res.status(404).render("offer-not-found");
  res.render("offer", { ...bundle, confirmDecision: null });
});

// Confirmation step before an accept/decline is applied.
router.get("/:token/respond", (req, res) => {
  const bundle = loadOfferBundle(req.params.token);
  if (!bundle) return res.status(404).render("offer-not-found");

  const decision = req.query.decision === "decline" ? "decline" : "accept";
  if (bundle.offer.status !== "pending") {
    return res.render("offer", { ...bundle, confirmDecision: null });
  }

  res.render("offer", { ...bundle, confirmDecision: decision });
});

router.post("/:token/respond", async (req, res) => {
  const bundle = loadOfferBundle(req.params.token);
  if (!bundle) return res.status(404).render("offer-not-found");

  const decision = req.body.decision === "decline" ? "declined" : "accepted";
  const note = (req.body.note || "").trim() || null;

  if (bundle.offer.status === "pending") {
    db.prepare(
      "UPDATE offers SET status = ?, responded_at = datetime('now'), response_note = ? WHERE id = ?"
    ).run(decision, note, bundle.offer.id);

    if (note) {
      const ensemble = db.prepare("SELECT * FROM ensemble_profile WHERE id = 1").get();
      const baseUrl = process.env.BASE_URL || `${req.protocol}://${req.get("host")}`;
      await sendResponseNoteNotification({
        musician: bundle.musician,
        concert: bundle.concert,
        offer: bundle.offer,
        decision,
        note,
        ensemble,
        baseUrl,
      });
    }
  }

  res.redirect(`/offers/${req.params.token}`);
});

module.exports = router;
