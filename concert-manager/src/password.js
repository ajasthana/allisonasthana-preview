const crypto = require("crypto");

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, stored) {
  const [salt, derivedHex] = (stored || "").split(":");
  if (!salt || !derivedHex) return false;

  const derived = Buffer.from(derivedHex, "hex");
  const candidate = crypto.scryptSync(password, salt, derived.length);
  return derived.length === candidate.length && crypto.timingSafeEqual(derived, candidate);
}

module.exports = { hashPassword, verifyPassword };
