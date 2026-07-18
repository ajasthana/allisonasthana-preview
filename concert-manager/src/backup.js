const fs = require("fs");
const path = require("path");
const { backup } = require("node:sqlite");
const db = require("./db");

const dbPath = process.env.DB_PATH || path.join(__dirname, "..", "data", "concert-manager.db");
const backupsDir = path.join(path.dirname(dbPath), "backups");
const RETAIN_COUNT = 14;

function timestampedName() {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `concert-manager-${stamp}.db`;
}

async function runBackup() {
  fs.mkdirSync(backupsDir, { recursive: true });
  const dest = path.join(backupsDir, timestampedName());

  try {
    await backup(db, dest);
    console.log(`Backup written to ${dest}`);
  } catch (err) {
    console.error("Backup failed:", err);
    return;
  }

  try {
    const files = fs
      .readdirSync(backupsDir)
      .filter((name) => name.endsWith(".db"))
      .sort();
    const stale = files.slice(0, Math.max(0, files.length - RETAIN_COUNT));
    for (const name of stale) {
      fs.unlinkSync(path.join(backupsDir, name));
    }
  } catch (err) {
    console.error("Backup pruning failed:", err);
  }
}

module.exports = { runBackup };
