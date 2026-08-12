# BHPH Dealership Website — Design Spec

**Date:** 2026-08-12
**Status:** Approved for planning

## 1. Purpose

A public inventory website for an independent Buy Here Pay Here (BHPH) used car dealership. The site's single job is to **get shoppers onto the lot**. It lists vehicles, keeps them current automatically from the dealer's existing Frazer DMS, and captures a lead when a shopper wants to check availability.

The dealer's workflow must require no desktop work: he photographs a car on the lot with the Frazer Sidekick mobile app and enters its price in Frazer, and the vehicle appears on the website without anyone touching the site.

### Explicitly out of scope for v1

Decided by the client, not omissions:

- Online credit application
- Customer payment portal (paying notes online)
- Trade-in valuation
- Spanish language support
- Service department / scheduling

These are excluded to keep v1 shippable. The data model should not actively obstruct adding them later, but no work is done for them now.

## 2. Success criteria

1. A vehicle photographed and priced in Frazer appears on the public site within 30 minutes, with no manual step.
2. A vehicle sold in Frazer stops being presented as available within 30 minutes.
3. A malformed or empty feed never blanks the live site.
4. Vehicle detail pages are indexable and carry valid `Vehicle`/`Offer` structured data.
5. Leads submitted on the site are durably stored and delivered to the dealer.
6. The site is usable and fast on a phone on cellular data.

## 3. Stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| Hosting | Vercel |
| Database | Postgres (Vercel Postgres or Neon) |
| Image storage | Vercel Blob or Cloudflare R2 |
| Scheduling | Vercel Cron → protected ingest route |
| Testing | Vitest (unit/golden-file), Playwright (E2E) |

## 4. Frazer integration

### 4.1 Background

Frazer is an on-premise Windows DMS widely used by independent and BHPH dealers. Frazer Sidekick is its companion mobile app: photos taken in Sidekick sync automatically into Frazer DMS. Sidekick is a **client of Frazer, not a separate backend** — it exposes no public API and is not an integration target. It matters only because it completes the dealer-side workflow.

### 4.2 Transports

Three possible ways data leaves Frazer:

| ID | Transport | Notes |
|---|---|---|
| A | XML/CSV inventory feed URL, polled by us | No approval needed. **Ship on this.** |
| B | Frazer Partner Program: Frazer pushes `.csv`/`.txt` + photos to our FTP/SFTP | Official path, most complete photo delivery. Requires Frazer approval. |
| C | Manual CSV upload via admin | Break-glass fallback only. |

**Decision:** build a transport-agnostic adapter layer. Ship on (A). Apply to the Frazer Partner Program on day one in parallel; when approved, add a second adapter implementation and change nothing else.

**Known constraint:** Vercel cannot host an SFTP server. If (B) is approved and requires SFTP push, a small drop target is needed (low-cost VPS or Cloudflare R2 + worker) that receives the file and calls our ingest webhook. This is a known future cost, not a blocker for v1.

### 4.3 Pipeline

```
Frazer (on-prem)
  ├─ (A) XML feed URL  → polled every 15 min
  ├─ (B) SFTP drop     → webhook
  └─ (C) manual upload
              │
              ▼
   [ Adapter → canonical Vehicle ]
   [ VIN decode + normalize ]
   [ Safety guards ]
   [ Reconcile: upsert / mark sold ]
   [ Photo pipeline → blob storage ]
              │
          Postgres → Next.js ISR revalidate
```

### 4.4 Normalization

- Every VIN is decoded via the **NHTSA vPIC API** (free) to fill canonical year, make, model, trim, body style, and drivetrain. This is what makes filters reliable — without it, dealer-entered data yields "CHEVY" and "Chevrolet" as separate makes.
- vPIC enrichment is **non-blocking**. If the API is unavailable, the run proceeds using raw feed values.
- Text fields are normalized (title-casing of ALL-CAPS input, whitespace collapse).
- A blank or zero price renders as **"Call for Price"**, never `$0`.

### 4.5 Safety guards

**Poison-pill protection (highest priority rule).** A sync run **aborts and preserves last-good data** if:

- the feed is unreachable after 3 retries with backoff, or
- the feed parses to zero vehicles, or
- the feed contains more than 40% fewer vehicles than the previous successful run.

An aborted run alerts the maintainer and changes nothing in the database. The failure mode this prevents — a malformed overnight feed silently emptying the site — is the most damaging thing that can happen to this integration.

### 4.6 Reconciliation

- Change detection via `source_hash` on the normalized record; unchanged vehicles are skipped.
- A VIN present in the DB but absent from the feed is treated as **sold**: `status = sold`, `sold_at` set. It is **not deleted**.
- Sold vehicle pages stay live for **30 days** with a SOLD banner and a similar-vehicles module, then 301-redirect to the relevant category page. This preserves accumulated search ranking.
- A previously-sold VIN reappearing in the feed is restored to `available` (relisting is normal).
- Price decreases between runs set a "Price Reduced" flag for display.

### 4.7 Photo pipeline

- Frazer-hosted images are **never hotlinked**.
- Each source image is content-hashed. Unseen hashes are downloaded, **EXIF-orientation corrected** (Sidekick photos are phone photos and are frequently rotated incorrectly), resized to three variants (thumb / card / full), converted to WebP, and uploaded to blob storage.
- Hash-keying means unchanged photos are never reprocessed.
- Photo **sequence from Frazer is preserved**. Position 0 is the hero image and the card thumbnail everywhere. This gives the dealer merchandising control directly from Sidekick.
- A photo download failure preserves existing photos and retries on the next run. Galleries are never blanked.
- **Minimum-photo guard:** a vehicle with zero photos is excluded from all listing and category pages, and its VDP returns 404 until at least one photo exists. The vehicle is still ingested and stored, so it appears automatically once the dealer adds photos in Sidekick. Rationale: cars without photos do not sell, and blank tiles make the whole lot look dead.

## 5. Site structure

Mobile-first throughout. BHPH shoppers are predominantly on phones, and **tap-to-call is the primary conversion action**, ahead of any form.

| Page | Route | Purpose |
|---|---|---|
| Home | `/` | Search entry, newest arrivals, quick filters, hours/map/phone |
| Inventory (SRP) | `/inventory` | Filter, sort, paginate |
| Vehicle detail (VDP) | `/inventory/[slug]` | Gallery, price, specs, CTAs, similar vehicles |
| Financing | `/financing` | BHPH explainer, what to bring. No application. |
| Visit us | `/visit` | Map, hours, directions, tap-to-call |
| About | `/about` | Trust signals, years in business, reviews |
| Category pages | `/inventory/[facet]` | Programmatic SEO landing pages |

### 5.1 Filters are URL state

Filter and sort state lives in the query string (`/inventory?make=chevrolet&price_max=10000`), not React state. This makes results shareable, back-button-correct, and indexable.

### 5.2 Structured data

Every VDP emits Schema.org `Vehicle` + `Offer` JSON-LD. Site-wide `AutoDealer` markup with consistent name/address/phone. This is the highest-leverage SEO item in the spec: it is how an independent lot appears in Google with price, mileage, and image attached.

### 5.3 Programmatic landing pages

Generated from inventory facets: by make (`/inventory/chevrolet`), by price band (`/inventory/under-10000`), by body style (`/inventory/trucks`). These target the long-tail queries BHPH buyers actually type. Pages with zero matching vehicles are not generated and return 404.

### 5.4 Lead capture

A "Check availability / Get a quote" form on each VDP:

- writes to Postgres **and** emails/texts the dealer (email-only delivery is unverifiable and leads get lost),
- sends the shopper an immediate auto-reply,
- captures source page and UTM parameters,
- is spam-protected (honeypot + rate limiting).

### 5.5 Payment display (conditional)

BHPH shoppers shop by down payment and weekly payment, not sticker price. **If** the Frazer feed carries down-payment and weekly-payment fields, the VDP and vehicle cards lead with "$X down, $Y/week". If it does not, only price is shown. Payment figures are never computed or estimated by the site — quoting a payment the dealer cannot honor is a compliance problem, not just a data problem.

### 5.6 Required disclosures

Built into shared templates from the start, not retrofitted:

- Price disclaimer: "plus tax, title, license and dealer fees."
- "Vehicles subject to prior sale."
- If payments are displayed, accompanying financing terms disclosure.

## 6. Data model

```
Vehicle
  id, vin?, stock_number, source_key, slug
  year, make, model, trim, body_style, drivetrain, transmission,
  engine, fuel_type, doors, exterior_color, interior_color, mileage
  price?, down_payment?, weekly_payment?
  description, features[]
  status: available | sold | hidden
  price_reduced: bool
  source_hash, vin_decoded (jsonb)
  first_seen_at, last_seen_at, sold_at, created_at, updated_at

VehiclePhoto
  id, vehicle_id, position, content_hash
  url_thumb, url_card, url_full, width, height, alt
  UNIQUE (vehicle_id, content_hash)

SyncRun
  id, source, status: success | aborted | failed
  started_at, finished_at
  vehicles_seen, created, updated, marked_sold, photos_processed
  abort_reason, raw_snapshot_ref, errors (jsonb)

Lead
  id, vehicle_id?, name, phone, email, message
  source_page, utm (jsonb), ip, user_agent
  status: new | contacted | closed
  created_at

AdminUser
  id, email, password_hash, created_at
```

### 6.1 Identity

VIN is the natural key **when present**. Frazer permits blank and duplicate VINs (wholesale and in-transit units), so identity resolves as: use VIN if present and unique in the feed, otherwise fall back to stock number. The resolved key is stored in `source_key` and the choice is recorded, so identity behavior is auditable.

### 6.2 Observability

`SyncRun` exists so that "why isn't my car on the site?" is an answerable question. Each run records counts, errors, and a reference to the raw feed snapshot, enabling local replay of a bad sync rather than guesswork.

## 7. Admin surface

Deliberately minimal. Frazer remains the source of truth; this is a window, not a second system.

| Screen | Purpose |
|---|---|
| `/admin/sync` | Recent runs, counts, errors, manual "sync now" |
| `/admin/leads` | Lead list with status |
| Vehicle hide/unhide | Manual override for a single vehicle |

Single-user authentication. No role system.

## 8. Failure handling

| Failure | Response |
|---|---|
| Feed unreachable | 3 retries with backoff → keep last-good → alert after repeated failures |
| Feed empty or >40% shrink | Abort run, keep last-good, alert immediately |
| Feed parse error | Abort run, keep last-good, alert |
| Single bad vehicle row | Skip row, record in `SyncRun.errors`, complete the run |
| Photo download failure | Keep existing photos, retry next run |
| vPIC unavailable | Proceed without enrichment |
| Blob storage failure | Fail the photo, keep vehicle data, retry next run |

**Governing principle: degrade, never blank.** Alerts route to the maintainer, not the dealer.

## 9. Testing

In priority order:

1. **Golden-file adapter tests.** Anonymized real Frazer feed samples in, expected canonical `Vehicle` out. Highest-value suite — feed format drift is the most likely cause of silent breakage.
2. **Reconciler unit tests.** New vehicle, price change, sold, relisted-after-sold, duplicate VIN, blank VIN, unchanged (skip).
3. **Safety guard tests.** Empty feed aborts. 50%-shrink feed aborts. Under-threshold shrink proceeds.
4. **Photo pipeline tests.** EXIF rotation correction, hash dedupe, download failure preserves existing photos.
5. **E2E (Playwright).** Browse → filter → VDP → submit lead.
6. **Lighthouse budget in CI.** Performance and SEO thresholds enforced on home, SRP, and VDP.

## 10. Open items

Resolved during implementation, none blocking planning:

1. Whether the live Frazer feed carries down-payment and weekly-payment fields (determines §5.5).
2. Frazer Partner Program application outcome (determines whether transport B is added).
3. Dealer identity assets: business name, logo, address, hours, phone, existing domain.
4. Typical inventory size, which informs pagination strategy.
5. Lead delivery preference: email, SMS, or both.
