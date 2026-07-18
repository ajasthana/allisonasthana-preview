const { splitFullName } = require("./names");

const HEADER_ALIASES = {
  full_name: ["name", "musicianname", "fullname", "musician"],
  first_name: ["firstname", "first"],
  last_name: ["lastname", "last", "surname"],
  email: ["email", "emailaddress"],
  phone: ["phone", "phonenumber", "cell", "cellphone", "mobile"],
  instrument: ["instrument", "section", "instrumentsection"],
  notes: ["notes", "note", "comments", "comment"],
  musician_type: ["type", "musiciantype", "coresub", "status"],
};

function normalizeKey(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function fieldForHeader(header) {
  const normalized = normalizeKey(header);
  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    if (aliases.includes(normalized)) return field;
  }
  return null;
}

// Minimal CSV parser: handles quoted fields (with "" as an escaped quote),
// commas inside quotes, and CRLF/LF line endings.
function parseCsv(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // strip UTF-8 BOM

  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }

    if (char === '"') {
      inQuotes = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\r") {
      // skip, \n handles the line break
    } else if (char === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function parseRosterFile(buffer) {
  const rows = parseCsv(buffer.toString("utf8"));
  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const mapped = { full_name: "", first_name: "", last_name: "", email: "", phone: "", instrument: "", notes: "", musician_type: "" };
    headers.forEach((header, index) => {
      const field = fieldForHeader(header);
      if (field) mapped[field] = (cells[index] || "").trim();
    });

    // Back-compat: a single "Name" column gets split into first/last if
    // no dedicated First/Last Name columns were provided.
    if (mapped.full_name && !mapped.first_name && !mapped.last_name) {
      const { first, last } = splitFullName(mapped.full_name);
      mapped.first_name = first;
      mapped.last_name = last;
    }

    const normalizedType = mapped.musician_type.toLowerCase();
    mapped.musician_type = normalizedType.includes("sub") ? "substitute" : "core";

    return mapped;
  });
}

function templateCsv() {
  return "First Name,Last Name,Email,Phone,Instrument,Type,Notes\nJane,Smith,jane@example.com,555-123-4567,Violin,Core,Sub list\n";
}

module.exports = { parseRosterFile, templateCsv };
