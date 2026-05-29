# Twillo Y2K Web Portal

Personal Twilio account management portal - SMS, voice, and number management from any browser.

## Documentation

All project documentation lives in the Obsidian vault at:
```
/Users/yosinuri/Documents/Obsidian/Twillo Y2K Web Portal/
```

Key docs:
- `Spec.md` — Requirements and feature specification
- `Architecture.md` — Tech stack, API surface, database schema, data flow diagrams
- `Changelog.md` — Version history and shipped features
- `Journal.md` — Session notes and development log

## Quick Start

### 1. Set up environment

```bash
cp .env.example .env
# Edit .env with your Twilio and Supabase credentials
```

### 2. Set up Supabase

Run the schema in your Supabase project's SQL Editor:
```bash
cat supabase/schema.sql
# Copy contents, paste into Supabase SQL Editor, run
```

### 3. Install and run locally

```bash
npm install
npm run dev
```

Visit http://localhost:3000

### 4. Deploy to Vercel

```bash
vercel login
vercel
```

After deploy, create a TwiML App in Twilio console pointing to:
```
https://your-production-url.vercel.app/webhooks/voice-outbound
```

Save the TWIML_APP_SID to your Vercel env vars and redeploy.

## Tech Stack

- **Backend**: Node.js + Express (Vercel serverless)
- **Frontend**: Vanilla HTML + CSS + JS (no build step)
- **Database/Auth**: Supabase (Postgres + Google SSO)
- **Telephony**: Twilio (REST API + Voice SDK + TwiML)
- **Hosting**: Vercel

## Development

- `npm run dev` — Start local dev server
- `npm start` — Start server (same as dev)

## License

MIT
