# Concert Manager

A small internal tool for running concert logistics: a musician roster, per-concert repertoire and rehearsal details, and emailed offers musicians can accept or decline with one click (no login required on their end).

This is a separate Node app from the static `allisonasthana-preview` site one directory up — it has its own server, database, and deployment.

Requires **Node 22.5 or newer** (uses Node's built-in `node:sqlite`). Check your version with `node -v`; on macOS, `brew install node` gets you current. There's no native/C++ build step for any dependency, so `npm install` should always be quick and shouldn't require Xcode command line tools.

## Setup

```bash
cd concert-manager
npm install
cp .env.example .env
```

Edit `.env`:

1. Set `SESSION_SECRET` to any long random string.
2. Generate your admin login password hash:
   ```bash
   npm run hash-password -- "your-chosen-password"
   ```
   Paste the output into `ADMIN_PASSWORD_HASH`.
3. Fill in SMTP credentials (`SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`) so offer emails can actually send. A Gmail account with an [app password](https://myaccount.google.com/apppasswords) works, as does any SMTP provider (SendGrid, Postmark, etc). Until this is set, offers are "sent" by logging the email content and accept/decline links to the server console instead — useful for testing the flow without real email.
4. Set `BASE_URL` to wherever the app is actually reachable (e.g. your deployed URL) so links in offer emails resolve correctly.

## Run

```bash
npm run dev
```

Visit `http://localhost:3000`, log in with your password, add musicians to the roster, create a concert, add repertoire and rehearsals, then send offers from the concert page.

## Roster

Musicians have separate first/last name fields and a Core or Substitute type. The roster table's column headings are clickable to sort; the search box, All/Core/Substitute chips, and instrument dropdown filter the list — all client-side, no page reload. Click anywhere on a row to open that musician's details. A "Confirmed concerts" column shows which concerts each musician has accepted, and Notes are visible directly in the table (truncated, full text on hover).

### Importing from a spreadsheet

Use "Import from spreadsheet" to bulk-add musicians from a CSV file. Columns can be in any order; the importer recognizes common header variations (`First Name`/`Last Name`, or a single `Name`/`Full Name` column which gets split automatically; `Email`/`E-mail`; `Phone`/`Cell`/`Mobile`; `Instrument`/`Section`; `Type` with `Core`/`Substitute`; `Notes`/`Comments`). A "Download a template" link on that page gives a starter file with the exact expected headers.

Musicians are matched by email address — re-importing the same file (or an updated one) updates existing entries instead of creating duplicates. Rows missing a name or email are skipped and listed in the import summary.

If your roster is in Excel, Numbers, or Google Sheets, export it as CSV first (File → Save As / Download → CSV) — the importer only reads `.csv` files, kept deliberately simple to avoid adding a spreadsheet-parsing dependency with known security advisories.

## Concerts

Each concert can have a sheet music link, shown on the admin page and in offer/update emails. Every offer email includes a persistent "View concert details" link in addition to Accept/Decline — musicians can bookmark it to check repertoire and rehearsal info anytime.

Edits to a concert's details, repertoire, or rehearsals are **not** emailed automatically. When you're ready to let already-**accepted** musicians know, click "Notify musicians of update" at the top of the concert page — it sends the current info to everyone who's accepted (pending/declined musicians aren't included), and shows how many were notified. Make all your edits first, then notify once.

Repeating a program on another date? Use "Duplicate for another date" on the concert page — it copies the title, venue, times, fee, sheet music link, and repertoire into a new concert and takes you to its edit page to set the new date. Rehearsals and offers are intentionally not copied, since those usually differ per date.

When sending offers, the optional "Message to musicians" field lets you add a note (e.g. a specific ask or reminder) that's included in that batch's offer emails and shown on the musician's offer page.

Each concert's URL is based on its title (e.g. `/concerts/winter-gala`) rather than a numeric ID, generated once when the concert is created. Renaming a concert later doesn't change its URL, so existing links and bookmarks keep working. Two concerts with the same title get `-2`, `-3`, etc. appended automatically.

Times (call time, downbeat, rehearsal times) are always shown in 12-hour format (e.g. 6:00 PM) wherever they're displayed, including in emails — the underlying time picker fields in edit forms are unaffected.

## Dashboard

Shows total confirmed payroll (sum of fees for accepted offers), a month calendar with concert/rehearsal dates marked (use the arrows to browse other months), and an upcoming-events list combining the next few concerts and rehearsals.

## Data

SQLite database lives at `data/concert-manager.db` (created automatically on first run, gitignored).

## Deployment

Any host that runs a persistent Node process with a writable disk works (e.g. Render, Railway, Fly.io). Set the same environment variables from `.env` there. This is unrelated to however the static site one directory up is deployed.
