const nodemailer = require("nodemailer");
const { fullName } = require("./names");

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

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => {
    const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
    return map[char];
  });
}

function concertHeaderHtml({ concert, ensemble }) {
  const ensembleName = ensemble && ensemble.name ? ensemble.name : "";
  return `
    ${ensembleName ? `<p style="text-transform:uppercase;letter-spacing:0.06em;font-size:12px;color:#c1621f;margin:0 0 4px;">${escapeHtml(ensembleName)}</p>` : ""}
    <h2 style="margin: 0 0 4px;">${escapeHtml(concert.title)}</h2>
    <p style="color: #8a7364; margin-top: 0;">${escapeHtml(concert.venue || "")}${
      concert.date ? ` &middot; ${escapeHtml(concert.date)}` : ""
    }</p>
  `;
}

function concertDetailsHtml({ concert, repertoire, rehearsals }) {
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
    ${repertoireRows ? `<h3 style="color:#c1621f;">Repertoire</h3><ul>${repertoireRows}</ul>` : ""}
    ${
      concert.sheet_music_url
        ? `<p><a href="${escapeHtml(concert.sheet_music_url)}">Sheet music &rarr;</a></p>`
        : ""
    }
    ${rehearsalRows ? `<h3 style="color:#c1621f;">Rehearsals</h3><ul>${rehearsalRows}</ul>` : ""}
  `;
}

function ensembleFooterHtml(ensemble) {
  const ensembleName = ensemble && ensemble.name ? ensemble.name : "";
  const parts = [ensemble && ensemble.email, ensemble && ensemble.website].filter(Boolean);
  if (!ensembleName && !parts.length) return "";
  return `<p style="color:#a9977f;font-size:12px;border-top:1px solid #f0ddc9;padding-top:12px;margin-top:20px;">${escapeHtml(
    ensembleName
  )}${parts.length ? " · " + parts.map(escapeHtml).join(" · ") : ""}</p>`;
}

function wrapEmail(bodyHtml) {
  return `
    <div style="font-family: Georgia, serif; max-width: 560px; margin: 0 auto; color: #3a2f27; background:#fffaf3; padding: 24px; border-radius: 12px;">
      ${bodyHtml}
    </div>
  `;
}

async function sendOfferEmail({ musician, concert, repertoire, rehearsals, offer, ensemble, baseUrl }) {
  const acceptUrl = `${baseUrl}/offers/${offer.token}/respond?decision=accept`;
  const declineUrl = `${baseUrl}/offers/${offer.token}/respond?decision=decline`;
  const detailsUrl = `${baseUrl}/offers/${offer.token}`;

  const html = wrapEmail(`
    ${concertHeaderHtml({ concert, ensemble })}
    <p>Hi ${escapeHtml(fullName(musician))},</p>
    <p>You're being offered a spot on this concert${
      offer.role_part ? ` as <strong>${escapeHtml(offer.role_part)}</strong>` : ""
    }${offer.fee ? `, fee: <strong>${escapeHtml(offer.fee)}</strong>` : ""}.</p>

    ${concertDetailsHtml({ concert, repertoire, rehearsals })}

    <div style="margin: 28px 0;">
      <a href="${acceptUrl}" style="background:#e8792f;color:#fff8f0;padding:12px 20px;border-radius:8px;text-decoration:none;margin-right:12px;">Accept</a>
      <a href="${declineUrl}" style="background:#f1ded0;color:#8a4a26;padding:12px 20px;border-radius:8px;text-decoration:none;">Decline</a>
    </div>
    <p><a href="${detailsUrl}">View concert details &rarr;</a></p>

    <p style="color:#a9977f;font-size:13px;">This link is unique to you — no login required. Bookmark it to revisit repertoire and rehearsal details anytime.</p>
    ${ensembleFooterHtml(ensemble)}
  `);

  const subject = ensemble && ensemble.name ? `Concert offer from ${ensemble.name}: ${concert.title}` : `Concert offer: ${concert.title}`;

  return deliver({ to: musician.email, subject, html, fallbackLinks: { Accept: acceptUrl, Decline: declineUrl } });
}

async function sendConcertUpdateEmail({ musician, concert, repertoire, rehearsals, offer, ensemble, baseUrl }) {
  const detailsUrl = `${baseUrl}/offers/${offer.token}`;

  const html = wrapEmail(`
    ${concertHeaderHtml({ concert, ensemble })}
    <p>Hi ${escapeHtml(fullName(musician))},</p>
    <p>Details for this concert were just updated. Here's the current information:</p>

    ${concertDetailsHtml({ concert, repertoire, rehearsals })}

    <p style="margin: 28px 0;"><a href="${detailsUrl}" style="background:#e8792f;color:#fff8f0;padding:12px 20px;border-radius:8px;text-decoration:none;">View concert details &rarr;</a></p>
    ${ensembleFooterHtml(ensemble)}
  `);

  const subject = ensemble && ensemble.name
    ? `Updated: ${concert.title} (${ensemble.name})`
    : `Updated: ${concert.title}`;

  return deliver({ to: musician.email, subject, html, fallbackLinks: { "Concert details": detailsUrl } });
}

async function deliver({ to, subject, html, fallbackLinks }) {
  if (!transport) {
    console.warn(`[mailer] SMTP not configured — email NOT sent. Would have emailed ${to}: ${subject}`);
    Object.entries(fallbackLinks).forEach(([label, url]) => console.warn(`[mailer] ${label}: ${url}`));
    return { simulated: true, ...fallbackLinks };
  }

  try {
    await transport.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html,
    });
    return { simulated: false };
  } catch (err) {
    console.error(`[mailer] Failed to send to ${to}: ${err.message}`);
    return { simulated: false, error: err.message };
  }
}

module.exports = { sendOfferEmail, sendConcertUpdateEmail };
