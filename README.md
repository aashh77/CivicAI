# CivicAI: Enterprise Architecture Specification
### AI-Powered Multi-Portal Community Issue Reporting & Resolution Platform

CivicAI is a production-ready, full-stack civic infrastructure management framework designed to optimize municipal workflow orchestration. The platform bridges the communication gap between citizens and local authorities by replacing traditional, unstructured reporting forms with a synchronous, self-triaging AI engineering pipeline. 

By unifying multimodal computer vision, semantic routing, predictive service-level agreements (SLAs), and automated background workers, CivicAI transforms raw civic complaints into validated, structurally isolated, and time-bound operational tickets.

Live Demo: https://civic-ai-beige.vercel.app/

---

## 1. Core Problem Statement & Challenge

### The Civic Operational Gap
Local municipalities frequently battle a compounding backlog of public infrastructure failures—ranging from structural roadway degradation (potholes) and critical fluid utility breaches (water leakages) to systemic electrical outages and municipal waste grid management issues. Current civic communication loops suffer from extreme structural fragmentation:
* **Asynchronous Reporting Channels:** Citizens rely on a disconnected mix of phone hotlines, unstructured social media callouts, or manual in-person submittals.
* **Lack of Data Integrity:** Municipalities waste extensive field hours filtering out duplicate entries, spam, out-of-bounds geolocations, or intentionally deceptive reporting.
* **The "Black Box" Problem:** Once an issue enters a municipal queue, citizens are decoupled from the remediation lifecycle, resulting in low civic trust, lack of operational transparency, and zero structural accountability.

### The CivicAI Paradigm
CivicAI functions as an automated, auditable, and self-monitoring engine that empowers citizens while optimizing city workforce distribution. The system guarantees that every public submittal is contextually cross-examined, accurately categorized via natural language scoring, geolocated using layered cross-verification matrices, assigned a firm algorithmic deadline, and tracked transparently from initial data ingestion to field resolution.

---

## 2. Multi-Portal System Architecture

The platform isolates operational concerns by executing a decoupled, single-origin multi-portal frontend driven by an enterprise Node.js/Express REST API and a Google Cloud Firestore native database.

```
                    ┌──────────────────────────────────────┐
                    │       CivicAI Express Core API       │
                    └──────────────────┬───────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│  Admin Console   │          │  Citizen Portal  │          │ Authority Portal │
│     (/admin)     │          │     (/user)      │          │   (/authority)   │
├──────────────────┤          ├──────────────────┤          ├──────────────────┤
│ Central Control  │          │ Ingestion, Maps, │          │ Scoped Worklists │
│  & Orchestration │          │ & Gamification   │          │  & Proof Vectors │
└──────────────────┘          └──────────────────┘          └──────────────────┘
```

### ┌─ `/admin` ── Admin Console
* **System-Wide Telemetry:** Provides administrators with real-time analytical visibility into aggregate municipal performance, active department backlogs, and critical SLA breach velocities.
* **Identity & Access Management (IAM):** Handles granular provisioning, credential rotation, and secure scoping for all municipal department authority accounts.
* **Hot-Swappable Configuration Engine:** Employs real-time Firestore document listeners to allow administrators to instantly alter active application routes, visible tabs, and functional feature gates across the user and authority portals without redeploying code.

### ┌─ `/user` ── Citizen Portal
* **Structured Data Ingestion:** Guides users through a strictly validated reporting layout requiring a high-resolution photo, contextual title, detailed narrative text, and a typed physical address.
* **Interactive Mapping Vector:** Consumes a synchronized public feed to render a live, color-coded geospatial layout of local infrastructure health, sorting active tickets by status and priority tier.
* **Civic Gamification & Ledger:** Computes user engagement via an atomic transaction engine, distributing XP points, public leaderboard standings, and dynamic progression titles (e.g., *First Responder* to *Civic Champion*) to incentivize high-fidelity data contribution.

### ┌─ `/authority` ── Authority Portal
* **Cryptographically Isolated Worklists:** Enforces a rigid department-scoped security boundary. Logged-in department workers (e.g., *Roads* or *Sanitation*) are structurally blocked from viewing or interacting with tickets belonging to other municipal entities.
* **State Machine Remediation Pipeline:** Transitions tickets from `assigned` to `in_progress`, concluding with a mandatory proof-of-work completion vector that requires a resolution photo before a ticket can enter a closed state.

---

## 3. Repository File Structure

```
civic-platform/
├── backend/                     Node.js + Express API and static file server
│   ├── server.js                App entrypoint - mounts API routes + 3 static portals + escalation scheduler
│   ├── config/
│   │   ├── firebase.js          Firestore initialization (using unified service account key)
│   │   └── constants.js         Collections, roles, status enums, departments, tabs, points
│   ├── middleware/
│   │   ├── auth.js              JWT verification + role-based access control
│   │   └── upload.js            Multer in-memory image upload handling
│   ├── services/
│   │   ├── vision.service.js        Gemini-based multi-modal image verification + criticality rating
│   │   ├── categorization.service.js Keyword-scored title + description + AI reason -> category -> department
│   │   ├── prediction.service.js    Backlog-driven + criticality -> predicted resolution window
│   │   ├── geocode.service.js       OpenStreetMap Nominatim forward/reverse geocoding
│   │   ├── gamification.service.js  Points + badge calculation
│   │   └── escalation.worker.js     SLA breach sweep + auto-escalation batch job
│   ├── utils/
│   │   ├── exif.js              EXIF GPS extraction from uploaded photos
│   │   ├── imageProcess.js      Sharp-based compression to keep images under Firestore's 1MB doc cap
│   │   └── seed.js              First-run bootstrap (admin + departments + pre-seeded auth logins)
│   └── routes/
│       ├── auth.routes.js       Register/login (citizens), /me
│       ├── issues.routes.js     Core AI pipeline: report, list, verify, status, resolve
│       ├── admin.routes.js      Stats, user/authority management, departments
│       ├── authority.routes.js  Department-scoped summary
│       ├── user.routes.js       Leaderboard, own profile
│       └── config.routes.js     Admin-customizable tab visibility config
│
├── frontend/                    Plain HTML / CSS / vanilla JS (no build step)
│   ├── shared/
│   │   ├── css/base.css         Shared design system used by all 3 portals
│   │   └── js/api.js            Shared fetch wrapper, auth/session helpers
│   ├── admin/                   Admin console (login.html, index.html, js/app.js)
│   ├── user/                    Citizen portal with live map (login.html, register.html, index.html, js/app.js)
│   └── authority/               Authority portal (login.html, index.html, js/app.js)
│
├── firestore/firestore.rules    Reference security rules (Bypassed securely via Admin SDK server-side operations)
├── .gitignore
└── README.md
```

---

## 4. The Synchronous AI & Data Ingestion Pipeline

The definitive architectural innovation of CivicAI is its synchronous processing engine. When a citizen submits a ticket, the transaction is intercepted by a multi-stage validation and enhancement chain before committing to permanent storage.

```
[User Report Submittal]
       │
       ▼
[Stage 1: Gemini Multimodal Cross-Examination] ──► (Rejects Spam / Unsafe Content)
       │
       ▼
[Stage 2: Context-Aware Semantic Categorization] ──► (Maps to Best-Fit Department)
       │
       ▼
[Stage 3: Backlog-Driven SLA Prediction] ──► (Calculates Hard Deadline Timestamp)
       │
       ▼
[Stage 4: Layered Geospatial Cross-Verification] ──► (Validates EXIF GPS vs. Address)
       │
       ▼
[Stage 5: Binary Optimization & Document Commit] ──► (Stores Compressed Entry to Firestore)
```

### Stage 1: Gemini Multimodal Cross-Examination
Rather than processing text and images in isolation, `vision.service.js` dispatches the raw image binary alongside the user’s text claims to the `gemini-2.5-flash` engine via `@google/genai`. Enforcing a strict, application-level JSON response schema, the model conducts deep semantic cross-examination to answer foundational validation vectors:
* Does the image structurally support the text description?
* Is the asset an un-actionable duplicate, internet spam, or a generic download?
* Does the content require immediate safety moderation?

If the model flags `requiresModeration` or `isSpamOrUnrelated`, the transaction undergoes an early-return short-circuit, dropping the payload and returning an `HTTP 422 Unprocessable Entity` response before touching database disk storage.

### Stage 2: Context-Aware Semantic Categorization
Once validated, the payload enters `categorization.service.js`. The module processes the collective string matrix—combining the title, user description, and the free-text reasoning returned by the Gemini validation step. It calculates text matches against a hierarchical, department-specific keyword dictionary, cleanly categorizing the entry and routing it to the appropriate structural domain (e.g., *Roads, Water, Electrical, Sanitation, Public Works*).

### Stage 3: Backlog-Driven SLA Prediction
To guarantee operational reliability, `prediction.service.js` queries Firestore to extract the target department’s active, unresolved workload. This concurrency index is mathematically evaluated against the issue's AI-determined criticality tier (`low`, `medium`, `high`). The system generates a highly accurate, estimated turnaround window (e.g., *24-48 Hours*, *7 Days*), which is immediately converted into a hard `slaDeadline` UNIX timestamp and stamped into the parent issue record.

### Stage 4: Layered Geospatial Cross-Verification
The system mitigates location fraud and reporting errors through a multi-pass geolocational validation matrix:
1. **Metadata Extraction:** `exif.js` parses the incoming binary for native GPS coordinates.
2. **Geocoding:** The user's typed address is converted to coordinates via an iterative OpenStreetMap Nominatim forward-geocoding engine (`geocode.service.js`). If an exact location lookup fails, the router enters a progressive fallback routine—systematically stripping the most specific comma-delimited address fragments to resolve a broad regional area rather than failing the transaction.
3. **Haversine Verification:** If EXIF data is present, the server computes the Haversine distance between the embedded metadata coordinates and the resolved address coordinates. If the delta exceeds a configurable kilometer threshold (`GEO_VERIFICATION_TOLERANCE_KM`), the issue is flagged as `unverified`. If no EXIF metadata exists, it falls back gracefully to the geocoded address array and tags the ticket as `no_metadata`.

### Stage 5: Binary Optimization & Document Commit
To eliminate the complex setup, network overhead, and cold-start latencies associated with external cloud object storage buckets, CivicAI optimizes image delivery natively. The raw image buffer is intercepted by `imageProcess.js` (powered by `sharp`), downscaled, compressed, and stripped of metadata. The optimized binary is directly embedded as an inline Base64 data string within the Firestore document. The server guarantees that all processed records sit safely below the 1 MiB Firestore document ceiling, ensuring ultra-fast document reads and single-transaction data retrieval.

---

## 5. Asynchronous Automated Operations

### The SLA Escalation Engine (`escalation.worker.js`)
Accountability is maintained via an independent, decoupled background worker process. Driven by a persistent background interval loop running on system boot and every 60 minutes thereafter, the worker initiates an atomic sweep across the database layer. 

The worker targets any ticket with an active state (`assigned` or `in_progress`) where the computed `slaDeadline` timestamp is less than the current system time ($t_{\text{deadline}} < t_{\text{now}}$) and the `escalationLevel` is `0`. The matching subset is automatically bumped via batched writes to `escalationLevel: 1`, its priority is locked to `high`, and an indelible administrative audit note is appended to the system log array.

---

## 6. Architectural Grade Foundations & Security Matrix

| Layer | Implementation Strategy | Operational Purpose |
|---|---|---|
| **Identity & Authentication** | JSON Web Tokens (JWT) + `bcryptjs` | Ensures stateless, cryptographically secure session handling with strict role verification across all routes. |
| **Data Partitioning** | Subcollection Isolation | Community verification votes are partitioned into independent document subcollections, mitigating parent document bloating and inherently preventing duplicate user votes. |
| **System Hardening** | `express-rate-limit` + Input Sanitization | Protects compute boundaries and downstream third-party APIs (Gemini, Nominatim) from intentional denial-of-service vectors. |
| **Query Efficiency** | In-Memory Arrays & Stream Piping | Complex data sorting, public leaderboards, and map aggregation matrices are compiled in-memory, maximizing throughput and eliminating direct structural dependencies on complex Firestore composite index creation. |

---

## 7. Enterprise Google Stack Utilization

* **Google Cloud Project Infrastructure:** Serves as the global administrative umbrella for CivicAI. Unifies identity access control, environment security variables, network firewall rules, API scoping, and internal cloud billing profiles.
* **Firebase Authentication (Initial Phase):** Deployed during initial architectural prototyping phases to instantly bootstrap structural user tables, validate social single-sign-on (SSO) frameworks, and evaluate basic OAuth token verification loops.
* **Google Cloud Vision API (Initial Phase):** Utilized within foundational platform revisions as the legacy image parsing engine to handle isolated object labeling and basic textual OCR extraction before system scaling.
* **Google Maps API (Initial Phase):** Integrated inside legacy development iterations to handle early geographical forward/reverse geocoding lookups and basic interactive map visualization layers.
* **Google Cloud Firestore (Native Mode):** Acts as the high-availability, fully managed NoSQL document database layer. Leverages real-time snapshot orchestration to synchronize global configurations, user profiles, transactional gamification tables, and active issue feeds seamlessly.
* **Google Gemini API (`gemini-2.5-flash`):** Serves as the central cognitive processing layer of the platform's advanced AI pipeline. Executes multi-modal reasoning matrices, structural JSON schema parsing, context moderation, and automated criticality indexing.

---

## 8. Future Strategic Scaling Horizons

* **Predictive Infrastructure Topology:** Training machine learning regression models on localized historical issue distributions to transition the platform from reactive remediation to automated, predictive municipal maintenance forecasting.
* **IoT Smart-City Integration:** Binding ambient urban IoT frameworks—including automated telemetry from water pressure flow valves, acoustic street sensors, and digital waste bin fill sensors—directly to the ingestion router to auto-generate issues prior to citizen detection.
* **Accessible Voice-to-Ticket Portals:** Integrating cloud-native speech-to-text models and automated telephonic IVR routes to allow elderly, non-technical, or visually impaired citizens to register valid issues via native voice dialogue.
* **Automated Third-Party Vendor Dispatches:** Building automated B2B procurement and routing workflows that algorithmically dispatch overdue or specialized issues to external private contractors based on geographic proximity, active bidding tables, and live capacity indexes.
* **Offline-First PWA Synchronization:** Packaging the Frontend Citizen Portal with service workers and local storage state sync to enable rural reporting in network-dead zones, automatically firing the ingestion pipeline the moment cellular signal is recovered.


## Default Test Accounts & Credentials

**Global Password for All Accounts: pass**

1. Central Administrator
Use this account to access the overarching administrative control panel.
Email: admin@city.gov
Role: Central Admin


2. Department Authorities
Use these accounts to test the backend routing, department-specific dashboards, and issue management.
* Roads & Potholes Department
Email: roads@city.gov
Department ID: roads

* Water Supply Department
Email: water@city.gov
Department ID: water

* Streetlight & Electrical Department
Email: light@city.gov
Department ID: electrical

* Waste Management / Sanitation Department
Email: sanitation@city.gov
Department ID: sanitation

* General Public Works
Email: publicworks@city.gov
Department ID: public_works

3. Citizens
Use these accounts to log into the main user/citizen facing portal to submit issues, view tracking, or test user profiles.
* Citizen1
Email: citizen1@test.com
* Citizen2
Email: citizen2@test.com
