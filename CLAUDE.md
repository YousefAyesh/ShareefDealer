# Working on this website

This is the website for a used car dealership. The person asking you for
changes is the owner. He is not a developer, he is often on his phone, and
he is usually standing on the lot. Answer him the way you would answer a
colleague who is busy — do the thing, then tell him in one or two sentences
what changed and that it is live in about a minute.

**Never ask him to run a command, open a file, or read code.** If you need
something from him, ask for it in plain words: a price, a mileage, a photo.

---

## How the site works

There is no database and no admin panel. The entire inventory is files:

```
inventory/2019-jeep-cherokee-latitude-kw123456.json   ← one file per car
public/inventory/2019-jeep-cherokee-latitude-kw123456/
    01.webp  02.webp  03.webp                          ← that car's photos
```

The filename is the URL. That car is at `/inventory/2019-jeep-cherokee-latitude-kw123456`.

Push to `main` and the site rebuilds and goes live on its own, usually in
under a minute. **Always commit and push** — a change that is not pushed did
not happen, and he has no way to see it.

---

## The four things he will ask for

### 1. "Add this car"

He will give you a description and photos. Photos arrive one of two ways —
see **Getting photos** below.

**Step 1 — work out the slug.** `<year>-<make>-<model>-<trim>-<last6ofVIN>`,
all lowercase, spaces and dots become hyphens. No VIN? Use the stock number.
Still nothing? Use the mileage, e.g. `...-84k`.

```
2019 Jeep Cherokee Latitude, VIN 1C4PJMCB6KD123456
  → 2019-jeep-cherokee-latitude-d123456
```

**Step 2 — look up the VIN if he gave you one.** This fills in most of the
car for free and is more accurate than guessing:

```bash
curl -s "https://vpic.nhtsa.dot.gov/api/vehicles/decodevin/<VIN>?format=json"
```

Take body style, drivetrain, transmission, engine, fuel type and doors from
it. **Ignore anything it returns as empty, "Not Applicable", or `0`.** Never
let it override a number he gave you himself — he is looking at the car.

**Shorten what it gives you to match the words already used on the site.**
The government database returns things like
`Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]` and
`4WD/4-Wheel Drive/4x4`. Pasted in raw, each one becomes its own separate
entry in the filter dropdowns, so a shopper filtering for SUVs would not see
this car. Use the vocabulary already in `inventory/`:

| It returns | Write |
|---|---|
| `Sport Utility Vehicle [SUV]/Multipurpose Vehicle [MPV]` | `SUV` |
| `Pickup` / `Crew Cab Pickup` | `Truck` |
| `Sedan/Saloon` | `Sedan` |
| `4WD/4-Wheel Drive/4x4` | `4WD` |
| `FWD/Front-Wheel Drive` | `FWD` |
| `Automatic (variable gear ratios)` | `Automatic` |

If it returns several trims separated by commas (`Latitude, Longitude,
North`) it does not know which one this is. Use what the owner told you.

**Step 3 — write `inventory/<slug>.json`.** Format is below.

**Step 4 — add the photos** (see **Getting photos**).

**Step 5 — check, commit, push:**

```bash
npm run check:inventory && git add -A && git commit -m "Add 2019 Jeep Cherokee Latitude" && git push
```

### 2. "This one sold"

Set `"status": "sold"` in that car's file. Do **not** delete the file — the
page keeps working for anyone who saved the link or is looking at an old
Facebook post, and it shows a SOLD banner with similar cars underneath.

Delete the file and its photo folder only when he explicitly asks, or when a
car has been sold for a couple of months.

### 3. "Change the price" / "drop it to X"

Edit `price` in that car's file. If it went **down**, also set
`"priceReduced": true` — that puts a "Price Reduced" badge on the listing.
Set it back to `false` if the price ever goes up.

### 4. "Change the wording on X"

Site text lives in `src/app/`. The dealership's name, address, phone and
hours are all in **`src/lib/dealer.ts`** — that one file feeds the header,
footer, contact page, map links and the data Google reads. Change it there,
never in individual pages.

---

## Getting photos

**You cannot save a photo he sends you in the chat.** You can see it, but the
file itself never reaches the computer you are working on, so there is
nothing to copy into the repo. This is a real limitation, not something to
work around by guessing.

**If he attached photos to the message**, tell him plainly:

> I can see the photos but I can't pull them into the repo from here. Upload
> them to the `uploads/` folder on GitHub — github.com in your phone browser,
> Add file → Upload files — and tell me when they're in. Then I'll do the rest.

Then, once they are there:

```bash
node scripts/photos.mjs <slug> uploads
find uploads -type f ! -name 'README.md' ! -name '.gitkeep' -delete
```

**If he gives you a public link** to the photos instead, download them first:

```bash
mkdir -p uploads && curl -sL -o uploads/01.jpg "<url>"
```

Either way, `scripts/photos.mjs` does the rest: it rotates them the right way
up, crops them all to the same size, converts to WebP, and **strips the GPS
coordinates that phones bake into photos** — which matters, because a car
photographed on his driveway would otherwise publish his home address.

**Photo order matters.** `01.webp` is the picture that shows on the listing
card and in search results. Make it the best three-quarter front shot. If he
says "use the blue one first", reorder by renaming the files.

**Always clear `uploads/` when you are done** so the originals never get
committed — they are 10× the size and would bloat the repo permanently.

---

## The vehicle file format

Only `year`, `make` and `model` are required. Leave anything out that you do
not know — an absent field is handled properly everywhere; a guessed one is a
lie on a car listing.

```json
{
  "stockNumber": "RS-1041",
  "vin": "3GCUKSEC5KG482910",
  "year": 2019,
  "make": "Chevrolet",
  "model": "Silverado 1500",
  "trim": "LT",
  "bodyStyle": "Truck",
  "drivetrain": "4WD",
  "transmission": "Automatic",
  "engine": "5.3L V8",
  "fuelType": "Gasoline",
  "doors": 4,
  "exteriorColor": "Summit White",
  "interiorColor": "Jet Black",
  "mileage": 88400,
  "price": 18995,
  "description": "Crew cab, 4WD, tow package. Clean title, runs strong.",
  "features": ["Backup Camera", "Bluetooth", "Tow Package"],
  "status": "available",
  "priceReduced": false,
  "listedAt": "2026-08-29"
}
```

### Rules that matter

**Money is in whole dollars.** `"price": 18995` means $18,995. Not cents, no
`$`, no commas. Getting this wrong publishes a hundredfold pricing error, so
`npm run check:inventory` rejects anything over $1,000,000 on the assumption
it is cents by mistake.

**This is a cash-only dealership. A listing shows the price, full stop.**
There is no `downPayment`, no `weeklyPayment`, no APR, no term. Those fields
were removed from the format, and `npm run check:inventory` now *rejects* any
file that carries one rather than quietly ignoring it. Do not add them back,
and do not write payment language into a `description` either ("low weekly
payment", "call for down payment options"). He does not finance, so any such
figure is both untrue and an advertised credit term.

**Never invent specs.** No mileage is better than an approximate mileage. The
same goes for features — list what he told you and what the VIN decode
confirms, nothing else.

**`status`** is `available`, `sold`, or `hidden`. Use `hidden` for a car that
is not ready to show yet.

**`listedAt`** is the date it went on the site, `YYYY-MM-DD`. It drives the
"Newest Arrivals" order.

**A car with no photos will not appear on the site.** That is deliberate.
`npm run check:inventory` will tell you which cars are waiting on photos.

---

## Before you push, always

```bash
npm run check:inventory
```

If he changed anything outside `inventory/`, run the full check:

```bash
npx tsc --noEmit && npm run lint && npm test
```

---

## Things not to do

- **Do not add a contact form, live chat, or anything that collects a name or
  email.** He wants calls and texts. The privacy policy states plainly that
  the site collects nothing, and adding a form makes that statement false —
  which in several states carries a real penalty.
- **Do not add analytics or tracking pixels** for the same reason. If he asks
  for analytics, say yes, and update `src/app/privacy/page.tsx` in the same
  commit.
- **Do not advertise financing, credit terms, APR, or "no credit check".**
  This dealership sells for cash and does not finance. Advertising credit
  terms triggers federal disclosure requirements (Regulation Z, 12 CFR
  1026.24) the site does not meet. The site says "cash only" on the home
  page, every listing, the inventory list, About and Terms — if that ever
  changes, all six have to change together.
- **Do not put a real photo of a car on a listing that is not that exact car.**
- **Do not commit anything from `uploads/`.**
- **Do not edit `src/lib/vehicle-filter.ts` or `src/lib/search-params.ts`** to
  make one car behave differently. Those are shared and well tested; if a car
  is not showing up, the cause is almost always its own file or missing photos.

---

## If something breaks

The site keeps serving even if one car file is malformed — that car is
skipped rather than taking the lot down. `npm run check:inventory` names the
file and the problem in plain language.

If a change made it worse, the fastest fix is to undo it:

```bash
git revert HEAD && git push
```

Then tell him what happened. He would much rather hear "I broke it and put it
back" than find it himself.
