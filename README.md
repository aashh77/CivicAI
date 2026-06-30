# CivicConnect — AI-Powered Community Issue Reporting & Resolution Platform

CivicConnect lets citizens photograph and report local civic problems
(potholes, water leakage, broken streetlights, waste, etc.), uses **Google's
Gemini API** to read the photo against the citizen's own title/description,
verify it, flag spam/unrelated/unsafe submissions, categorize it, and predict
both its **criticality** and a **resolution-time SLA**. The photo's GPS EXIF
metadata is cross-checked against the address the citizen typed (via
**OpenStreetMap Nominatim**) to flag location mismatches, the issue is routed
to the right municipal department, an **escalation worker** automatically
flags tickets that breach their SLA, and citizens earn points/badges for
reporting and verifying issues — all tracked in **Firestore** and visualized
live on a map.

The system ships as **three separate web portals served by one Node.js/Express
backend**:

| Portal | Path | Who it's for |
|---|---|---|
| **Admin Console** | `/admin` | Platform admins: full analytics, all issues, manage authority accounts, customize what the other two portals show |
| **Citizen Portal** | `/user` | Residents: report issues, track their reports on a live map, leaderboard, points |
| **Authority Portal** | `/authority` | Department staff (pre-seeded logins): see only issues assigned to their department, resolve them |

---

## 1. What changed in this version

- **Cloud Vision → Gemini API.** `vision.service.js` now calls
  `gemini-2.5-flash` via `@google/genai` with a structured JSON response
  schema, sending the photo *plus* the citizen's title/description so the
  model can verify the photo actually supports the claim — not just label
  objects in isolation. It returns `isVerified`, `isSpamOrUnrelated`,
  `requiresModeration`, `reason`, and a `criticality` rating (`low` /
  `medium` / `high`).
- **Criticality-aware categorization.** `categorization.service.js` now
  scores the combined title + description + Gemini's reasoning text against
  the department keyword dictionary, instead of relying on raw Vision labels.
- **SLA prediction.** `prediction.service.js` looks at the target
  department's live open-ticket backlog and the issue's criticality to
  estimate a turnaround window (e.g. "24–48 Hours" or "5 Days Estimated"),
  which is converted into a hard `slaDeadline` timestamp stored on the issue.
- **Automatic escalation.** `escalation.worker.js` sweeps Firestore for any
  `assigned`/`in_progress` issue whose `slaDeadline` has passed and
  `escalationLevel` is still `0`, batch-bumps it to `escalationLevel: 1` and
  `criticality: 'high'`, and appends an audit note. `server.js` runs this
  sweep once on boot and then every 60 minutes via `setInterval`.
- **Iterative address fallback.** If the citizen's exact address text can't
  be geocoded, `issues.routes.js` now progressively broadens the query
  (stripping the most specific comma-separated segment at a time) until it
  finds a resolvable area, rather than failing outright.
- **Seeded authority accounts.** `seed.js` now provisions one predictable
  login per department (`roads@city.gov`, `water@city.gov`, `light@city.gov`,
  `sanitation@city.gov`, `publicworks@city.gov`, all password `pass`) plus two
  test citizen accounts, alongside the existing bootstrap admin — so the
  whole multi-role demo works immediately with zero manual account setup.
- **Map markers are live.** The citizen portal's "Nearby Issues" map now
  correctly plots every geolocated issue (verified, unverified, or
  no-metadata) as a marker, color-coded by status, sourced from
  `GET /api/issues/public/feed`.

---

## 2. Architecture Overview

```
backend/
├── server.js                 Express entrypoint: API routes + 3 static portals + escalation scheduler
├── config/
│   ├── firebase.js           Firestore client init
│   └── constants.js          Collections, roles, status/criticality enums, departments, tabs, points
├── middleware/
│   ├── auth.js                JWT verification + role-based access control
│   └── upload.js               Multer in-memory image upload handling
├── services/
│   ├── vision.service.js          Gemini-based image verification + criticality rating
│   ├── categorization.service.js  Keyword-scored title+description+AI-reason -> category -> department
│   ├── prediction.service.js      Backlog + criticality -> predicted resolution window
│   ├── geocode.service.js         OpenStreetMap Nominatim forward/reverse geocoding
│   ├── gamification.service.js    Points + badge calculation
│   └── escalation.worker.js       SLA breach sweep + auto-escalation batch job
├── utils/
│   ├── exif.js                EXIF GPS extraction from uploaded photos
│   ├── imageProcess.js        Sharp-based compression to keep images inside Firestore's 1MB doc cap
│   └── seed.js                 First-run bootstrap: admin + departments + seeded authority/citizen logins
└── routes/
    ├── auth.routes.js          Register/login (citizens), /me
    ├── issues.routes.js        Core AI pipeline: report, list, verify, status, resolve
    ├── admin.routes.js         Stats, user/authority management, departments
    ├── authority.routes.js     Department-scoped summary
    ├── user.routes.js          Leaderboard, own profile
    └── config.routes.js        Admin-customizable tab visibility config

frontend/                     Plain HTML / CSS / vanilla JS, no build step
├── shared/                    Shared design system + API client used by all 3 portals
├── admin/                     Admin console
├── user/                      Citizen portal (now with a live issue map)
└── authority/                 Authority portal
```

### Request flow when a citizen reports an issue

1. Browser uploads a photo + title + description + address via
   `multipart/form-data` to `POST /api/issues`. All four fields are now
   **required** server-side.
2. **Gemini** (`vision.service.js`) receives the photo *and* the citizen's
   text claim, and returns a structured verdict: is the photo verified
   against the claim, is it spam/unrelated, does it need moderation, a free
   text `reason`, and a `criticality` tier.
3. Submissions flagged `requiresModeration` or `isSpamOrUnrelated` are
   rejected immediately (HTTP 422) before anything is written to Firestore.
4. `categorization.service.js` scores the title + description + Gemini's
   `reason` text against the department keyword dictionary to pick a
   **category** and **department**.
5. `prediction.service.js` checks the target department's current open
   ticket count and the issue's criticality to predict a turnaround window;
   `issues.routes.js` converts that into a concrete `slaDeadline` timestamp.
6. `exif.js` attempts to read **GPS EXIF data** from the photo.
   - GPS present + user address geocodes nearby → `verified`.
   - GPS present but far from the geocoded address → `unverified`.
   - No GPS at all → falls back to the geocoded user address (with iterative
     broadening if the precise address fails) and is tagged `no_metadata`
     (or `unverified` if even the broadened fallback was needed).
   - If neither the photo nor any address variant can be geolocated, the
     submission is rejected (HTTP 422) rather than stored with no location.
7. The photo is compressed (resized + re-encoded) to fit comfortably inside
   Firestore's 1 MiB document limit; oversized images are rejected.
8. The issue document — including `criticality`, `predictedTime`,
   `slaDeadline`, `escalationLevel: 0`, AI verification metadata, and
   location verification — is written to `issues/{id}` with status
   `assigned`, and the reporter is awarded points.
9. The issue becomes visible only to the matching department's authority
   account and to admin. Authority moves it to `in_progress`, then uploads a
   "repaired" photo to resolve it — bonus points awarded to the reporter.

### SLA escalation loop (background, no user action needed)

Every hour (and once at server start), `checkAndEscalateIssues()` queries for
any issue that is `assigned`/`in_progress`, whose `slaDeadline` is in the
past, and whose `escalationLevel` is still `0`. It batch-updates all matches
to `escalationLevel: 1` and `criticality: 'high'`, appending a timestamped
note to `aiVerificationReason` — so an admin scanning "All Issues" by
criticality immediately sees what's overdue.

---

## 3. Prerequisites

- Node.js 18+ and npm
- A Google Cloud project with **Cloud Firestore API** enabled (Native mode)
- A **Gemini API key** (Google AI Studio or Vertex AI) for `GEMINI_API_KEY`
- A Firestore-access Service Account JSON key

---

## 4. Setup

### 4.1 Google Cloud Console

1. Enable **Cloud Firestore API**; create a Firestore database in **Native mode**.
2. Create a Service Account with the **Cloud Datastore User** role and
   download its JSON key to `backend/config/service-account-key.json`.
3. Get a **Gemini API key** from [Google AI Studio](https://aistudio.google.com/apikey).

### 4.2 Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env`:
- `GCP_PROJECT_ID`, `GOOGLE_APPLICATION_CREDENTIALS` → as before, for Firestore
- `GEMINI_API_KEY` → your Gemini API key (used by `vision.service.js`)
- `JWT_SECRET` → a long random string
- `GEOCODE_BASE_URL` / Nominatim `User-Agent` → identify your real app/contact
- `GEO_VERIFICATION_TOLERANCE_KM` → distance tolerance for GPS-vs-address matching

```bash
npm install
npm start
```

On first boot the server will:
1. Create the bootstrap admin (from `BOOTSTRAP_ADMIN_*` env vars).
2. Seed the 5 departments.
3. **Seed one ready-to-use authority login per department, plus 2 test
   citizen accounts** (see table below) — no manual provisioning needed for a demo.
4. Run an immediate SLA sweep, then schedule it hourly.

### 4.3 Default seeded logins (development/demo only)

| Email | Role | Department | Password |
|---|---|---|---|
| `admin@city.gov` | Admin | — | `pass` |
| `roads@city.gov` | Authority | roads | `pass` |
| `water@city.gov` | Authority | water | `pass` |
| `light@city.gov` | Authority | electrical | `pass` |
| `sanitation@city.gov` | Authority | sanitation | `pass` |
| `publicworks@city.gov` | Authority | public_works | `pass` |
| `citizen1@test.com` | Citizen | — | `pass` |
| `citizen2@test.com` | Citizen | — | `pass` |

> ⚠️ These are intentionally weak, predictable credentials for local
> development and demos only. Rotate or remove `DEFAULT_AUTHORITIES` in
> `seed.js` before any real-world deployment.

---

## 5. Environment checklist before going live

- [ ] `JWT_SECRET` and all seeded default passwords changed/rotated
- [ ] `GEMINI_API_KEY` kept server-side only, never exposed to the frontend
- [ ] Nominatim `User-Agent` identifies your real app/contact (required by OSM's usage policy)
- [ ] Service account JSON key not committed to git
- [ ] `escalation.worker.js`'s hourly interval and SLA windows tuned to your real department capacity before trusting the criticality auto-bump in production

See `DOCUMENTATION.md` for the problem statement, full feature list, and
technology breakdown used for evaluation/submission purposes.
