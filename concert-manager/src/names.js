function splitFullName(full) {
  const trimmed = String(full || "").trim();
  if (!trimmed) return { first: "", last: "" };

  const parts = trimmed.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: "" };
  return { first: parts.slice(0, -1).join(" "), last: parts[parts.length - 1] };
}

function fullName(musician) {
  return [musician.first_name, musician.last_name].filter(Boolean).join(" ").trim();
}

module.exports = { splitFullName, fullName };
