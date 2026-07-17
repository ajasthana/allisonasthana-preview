const nodemailer = require("nodemailer");

function buildTransport() {
  if (!process.env.SMTP_HOST) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: process.env.SMTP_USER
      ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      : undefined,
  });
}

const transport = buildTransport();

function offerEmailHtml({ musician, concert, repertoire, rehearsals, offer, acceptUrl, declineUrl }) {
  const repertoireRows = repertoire
    .map(
      (piece) =>
        `<li>${escapeHtml(piece.composer || "")} — <strong>${escapeHtml(piece.title)}</strong>${
          piece.movement ? ` (${escapeHtml(piece.movement)})` : ""
        }</li>`
    )
    .join("");

  const rehearsalRows = rehearsals
    .map(
      (r) =>
        `<li>${escapeHtml(r.date || "")} ${escapeHtml(r.start_time || "")}${
          r.end_time ? `–${escapeHtml(r.end_time)}` : ""
        } — ${escapeHtml(r.location || "TBD")}</li>`
    )
    .join("");

  return `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #222;">
      <h2 style="margin-bottom: 4px;">${escapeHtml(concert.title)}</h2>
      <p style="color: #555; margin-top: 0;">${escapeHtml(concert.venue || "")}${
        concert.date ? ` &middot; ${escapeHtml(concert.date)}` : ""
      }</p>

      <p>Hi ${escapeHtml(musician.name)},</p>
      <p>You're being offered a spot on this concert${
        offer.role_part ? ` as <strong>${escapeHtml(offer.role_part)}</strong>` : ""
      }${offer.fee ? `, fee: <strong>${escapeHtml(offer.fee)}</strong>` : ""}.</p>

      ${repertoireRows ? `<h3>Repertoire</h3><ul>${repertoireRows}</ul>` : ""}
      ${rehearsalRows ? `<h3>Rehearsals</h3><ul>${rehearsalRows}</ul>` : ""}

      <div style="margin: 28px 0;">
        <a href="${acceptUrl}" style="background:#2e7d32;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;margin-right:12px;">Accept</a>
        <a href="${declineUrl}" style="background:#b3261e;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;">Decline</a>
      </div>

      <p style="color:#777;font-size:13px;">This link is unique to you — no login required.</p>
    </div>
  `;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

async function sendOfferEmail({ musician, concert, repertoire, rehearsals, offer, baseUrl }) {
  const acceptUrl = `${baseUrl}/offers/${offer.token}/respond?decision=accept`;
  const declineUrl = `${baseUrl}/offers/${offer.token}/respond?decision=decline`;
  const html = offerEmailHtml({ musician, concert, repertoire, rehearsals, offer, acceptUrl, declineUrl });
  const subject = `Concert offer: ${concert.title}`;

  if (!transport) {
    console.warn(
      `[mailer] SMTP not configured — offer email NOT sent. Would have emailed ${musician.email}: ${subject}`
    );
    console.warn(`[mailer] Accept: ${acceptUrl}\n[mailer] Decline: ${declineUrl}`);
    return { simulated: true, acceptUrl, declineUrl };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: musician.email,
    subject,
    html,
  });

  return { simulated: false };
}

module.exports = { sendOfferEmail };
