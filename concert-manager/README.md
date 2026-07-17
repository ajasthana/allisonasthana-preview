# Concert Manager

A small internal tool for running concert logistics: a musician roster, per-concert repertoire and rehearsal details, and emailed offers musicians can accept or decline with one click (no login required on their end).

This is a separate Node app from the static `allisonasthana-preview` site one directory up — it has its own server, database, and deployment.

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

## Data

SQLite database lives at `data/concert-manager.db` (created automatically on first run, gitignored).

## Deployment

Any host that runs a persistent Node process with a writable disk works (e.g. Render, Railway, Fly.io). Set the same environment variables from `.env` there. This is unrelated to however the static site one directory up is deployed.
