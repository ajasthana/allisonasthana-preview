function slugify(text) {
  const base = String(text || "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "concert";
}

function uniqueConcertSlug(db, title, excludeId) {
  const base = slugify(title);
  let slug = base;
  let suffix = 2;

  while (true) {
    const existing = excludeId
      ? db.prepare("SELECT id FROM concerts WHERE slug = ? AND id != ?").get(slug, excludeId)
      : db.prepare("SELECT id FROM concerts WHERE slug = ?").get(slug);
    if (!existing) return slug;
    slug = `${base}-${suffix}`;
    suffix += 1;
  }
}

module.exports = { slugify, uniqueConcertSlug };
