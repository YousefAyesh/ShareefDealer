# Roadstar Auto Sales — website

A used car dealership website. The inventory is plain files in this repo:
no database, no admin panel, no monthly bill for anything but the domain.

**Adding and changing cars is done by talking to Claude.** The instructions
it follows are in [CLAUDE.md](CLAUDE.md) — that file is the manual for
running this site, and it is worth reading even if you never touch the code.

---

## How the inventory works

| What | Where |
|---|---|
| One car | `inventory/<slug>.json` |
| That car's photos | `public/inventory/<slug>/01.webp`, `02.webp`, … |
| Photos waiting to be added | `uploads/` |
| Name, address, phone, hours | `src/lib/dealer.ts` |

The filename is the web address. `inventory/2019-jeep-cherokee-latitude-d123456.json`
is served at `/inventory/2019-jeep-cherokee-latitude-d123456`.

A car with no photos does not appear on the site. That is deliberate — a
listing with no picture does not get a phone call.

---

## Running it locally

```bash
npm install
npm run dev          # http://localhost:3000
```

There is nothing to configure. No database URL, no API key.

```bash
npm run check:inventory   # validate every car file
npm test                  # full test suite
npm run build             # production build
```

`npm run photos -- <slug> uploads` resizes and installs photos for one car.

---

## Deploying

Connected to Vercel. Push to `main` and it rebuilds automatically, usually
in under a minute.

Environment variables to set in the Vercel project:

| Variable | Value | Why |
|---|---|---|
| `ALLOW_PLACEHOLDER_DEALER` | `true` | **Temporary.** Remove it once the real details are in `src/lib/dealer.ts` |
| `NEXT_PUBLIC_SITE_URL` | the live domain | **Optional on Vercel** — only needed once there is a custom domain. Without it the site uses Vercel's own production domain automatically. |

Environment variable changes do not trigger a rebuild on their own. After
adding them, redeploy from **Deployments → ⋯ → Redeploy**.

### About that second one

`src/lib/dealer.ts` currently holds a fictional business name, a 555 phone
number and an invented address. The build **refuses to deploy to production**
while those are in place, because a live dealership site showing a fake phone
number sends real buyers to a stranger.

`ALLOW_PLACEHOLDER_DEALER=true` overrides that so the site can go up before
the real details are known. **Fill in `src/lib/dealer.ts` and delete that
variable** — then the guard is protecting you again.

Everything on the site reads from that one file: header, footer, contact
page, map links, and the structured data Google uses to show hours and
directions in search results.

---

## What still needs a human

- **The real business details** — name, address, phone, hours, dealer license
  number. See `docs/client-intake-questions.md`, section 1.
- **A lawyer's eyes on the policy pages.** `/privacy`, `/terms` and
  `/accessibility` are written to describe accurately what this site does
  today — no forms, no analytics, no cookies. That stays true only as long as
  nobody adds those things. State dealer advertising rules may also require
  disclosures these pages do not attempt to guess at.

---

## If the inventory ever outgrows this

The dealership runs Frazer, which can export inventory automatically. A full
sync pipeline for it — feed parsing, photo ingestion, reconciliation, an
admin dashboard — is built and tested on the `feat/frazer-ingest-pipeline`
branch. It was removed from `main` because there is no feed connected yet and
it is not worth the complexity until there is.

Worth revisiting at roughly 60+ cars, or whenever typing each car into both
Frazer and this site stops being tolerable.
