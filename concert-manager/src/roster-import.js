const HEADER_ALIASES = {
  name: ["name", "musicianname", "fullname", "musician"],
  email: ["email", "emailaddress"],
  phone: ["phone", "phonenumber", "cell", "cellphone", "mobile"],
  instrument: ["instrument", "section", "instrumentsection"],
  notes: ["notes", "note", "comments", "comment"],
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
    const mapped = { name: "", email: "", phone: "", instrument: "", notes: "" };
    headers.forEach((header, index) => {
      const field = fieldForHeader(header);
      if (field) mapped[field] = (cells[index] || "").trim();
    });
    return mapped;
  });
}

function templateCsv() {
  return "Name,Email,Phone,Instrument,Notes\nJane Smith,jane@example.com,555-123-4567,Violin,Sub list\n";
}

module.exports = { parseRosterFile, templateCsv };
