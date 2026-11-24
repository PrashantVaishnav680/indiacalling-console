# IndiaCalling Console — Enterprise AI Voice Calling & Lead Qualification SaaS

[![Version](https://img.shields.io/badge/version-2.7.1-blue.svg)](package.json)
[![Next.js](https://img.shields.io/badge/Next.js-16.4.6-black.svg)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-18.3.1-61dafb.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.6.3-3178c6.svg)](https://www.typescriptlang.org/)
[![MongoDB](https://img.shields.io/badge/MongoDB-Atlas%20%2F%20Mongoose%208-green.svg)](https://www.mongodb.com/)
[![Bolna AI](https://img.shields.io/badge/Voice%20AI-Bolna%20API%20v2-purple.svg)](https://www.bolna.ai/)
[![Google Gemini](https://img.shields.io/badge/AI%20Assistant-Gemini%202.5-orange.svg)](https://aistudio.google.com/)

**IndiaCalling Console** (`v2.7.1`) is a multi-tenant enterprise AI voice-calling and lead qualification SaaS platform built with **Next.js 16 (App Router, Webpack mode)**, **React 18**, **TypeScript 5**, **Tailwind CSS 3.4**, **MongoDB Atlas (Mongoose 8)**, **Bolna AI API v2**, and **Google Gemini AI**.

---

## Architecture & Strict 2-Role Zero-PII RBAC

The platform strictly enforces a **2-role RBAC security model** across middleware, route handlers, and UI navigation (`src/lib/rbac.ts`):

| Role | Portal Scope | Access & Privacy Guardrails |
| :--- | :--- | :--- |
| **`super_admin`** | Platform Control Center (`/super-admin/*`) | **Zero-PII Governance Only:** Aggregated platform telemetry, 18% GST billing ledger, service control kill-switch, organization directory, and governance audit logs. Direct organization workspace access is logged with deep-link audit trails and an omnipresent session banner. |
| **`organization`** | Dedicated Tenant Workspace (`/overview`, `/agents`, `/campaigns`, `/knowledge-base`, `/calls`, `/leads`, `/sales-handoff`, `/billing`, `/testing`, `/settings`) | Strictly scoped to `session.organizationId`. Completely isolated access to organization-owned voice agents, calling campaigns, knowledge documents, call recordings, prospect pipelines, team members, and billing wallet. |

New organizations can self-register directly via **Register Organization** (`POST /api/auth/register`).

---

## Core Capabilities & Features

### 1. AI Voice Agent Studio (`/agents`, `/agents/new`, `/agents/[id]`)
- **7-Tab Configuration Studio:**
  - **Tab 1 (Identity & Prompt):** Google Gemini AI Prompt Assistant with 4 language/script modes (*English*, *Hindi Devanagari — हिंदी*, *Hindi Romanized / Hinglish*, *Bilingual*), persona selection, and formatted clipboard copy.
  - **Tab 2 (Knowledge Base):** Real-time RAG attachment with sentence-boundary slicing (`[...additional details available via Knowledge Base]`), avoiding mid-word cutoffs, plus adaptive search bar filtering.
  - **Tab 3 (Voice & Pronunciation):** Curated voice catalog (**ElevenLabs** + **Sarvam `bulbul:v3`**) with automatic **Sarvam `saaras:v4`** transcriber routing for 11 Indian regional languages, and a **Bulk Pronunciation Dictionary** importer (supporting `.csv`, `.json`, or direct text).
  - **Tab 4 (Language & Audio Engine):** Primary and fallback language settings, speech recognition models, and temperature controls.
  - **Tab 5 (Telephony & Behavior):** Inbound/outbound call behavior, duration limits, silence hangup thresholds, and contextual 16,000 Hz vs 8,000 Hz sampling rate guidance.
  - **Tab 6 (Human Handoff & Live Call Transfer):** Zero-argument `transfer_call` integration over Bolna v2 with Indian phone number auto-formatting (`+91XXXXXXXXXX`).
  - **Tab 7 (Dynamic Extractions & Qualification):** Industry-tailored extraction schemas (*Real Estate*, *Healthcare*, *Education*, *Financial Services*, etc.) with live sample payload previews.
- **Bi-Directional Bolna v2 Sync:** Live syncing of agent configurations, version snapshots, and execution histories.
- **Organization Agent Association:** Direct agent-to-leads inspection tab (`/agents/[id]?tab=leads`) displaying all prospects touched by that agent.

### 2. Qualified Leads Pipeline (`/leads`, `/leads/[id]`)
- **Multi-Call Aggregation:** Real-time consolidation of multiple call attempts into unique prospect contacts with clear call badges (e.g. `📞 19 Calls`, `📞 5 Calls`) and latest agent attribution.
- **Effective Lead Scoring:** Dynamic qualification calculation (*Hot >75 pts*, *Warm 50–74 pts*, *Cold 10–49 pts*, *Unqualified*).
- **3 Flexible Pipeline Views:** Interactive **Cards Grid**, **Kanban Board** by pipeline stage, and sortable **Data Table**.
- **Automated Prospect Synthesis:** Automatic contact creation and score synchronization for new inbound or outbound call recipients so no interaction is ever orphaned.
- **Call Scheduling Modal:** Separate Date and Time (IST) pickers with quick presets (*In 30 mins*, *In 1 hour*, *Tomorrow 10:00 AM*, *Tomorrow 4:00 PM*) and automated AI voice auto-dialing.

### 3. Outbound Campaigns & Batch Execution (`/campaigns`, `/campaigns/new`)
- **CSV / Excel Lead Import:** File upload parser with column mapping, deduplication, and invalid number filtering.
- **Telephony Assignment:** Selection of dedicated or shared Bolna phone numbers.
- **Batch Dispatch:** Rate-limited outbound dispatch via Bolna v2 Batch API with execution tracking and status callbacks.

### 4. Intelligent Knowledge Base (`/knowledge-base`)
- **Multimodal Document Upload:** PDF, TXT, DOCX, and CSV ingestion with character chunking and vector indexing.
- **Deep Content Search:** Full-text body search showing highlighted `Content match:` snippets.
- **Tenant Isolation:** Fully isolated RAG document collections scoped to `organizationId`.

### 5. Call History & Recording Playback (`/calls`, `/calls/[id]`)
- **Secure Audio Streaming Proxy:** Authenticated playback (`GET /api/calls/[id]/recording`) supporting HTTP `206 Partial Content`, `Range` byte requests, scrubbing, and direct MP3/WAV download without exposing underlying storage URLs.
- **Call Intelligence:** Real-time transcription, AI conversation summaries, sentiment analysis, and extraction outputs.

### 6. Sales Handoff & Timeline (`/sales-handoff`, `/leads/[id]`)
- **Sales Rep Workload Management:** Live salesperson assignment, capacity monitoring, and reassignment drawers.
- **Chronological Timeline:** Combined chronological history of AI calls and human salesperson notes, highlighting *First Interested* and *Latest Status* moments.

### 7. Billing, Wallet & Invoicing (`/billing`)
- **Usage-Based Wallet:** Real-time billing at `₹6.00/minute` with automatic deduction from organization wallet.
- **18% GST Compliance:** Transparent tax breakdown, instant verified wallet top-ups, and downloadable branded PDF invoices.
- **Subscription Tiers:** *Standard Pay-As-You-Go* (`₹6.00/min`) and *Custom Enterprise*.

### 8. Super Admin Platform Control Center (`/super-admin/*`)
- **Platform Telemetry:** Multi-tenant aggregations, platform-wide minute consumption, and revenue analytics.
- **Service Control Kill-Switch:** Instant emergency calling kill-switch and real-time infrastructure health monitoring (MongoDB, Bolna API, Zero-PII Guard).
- **Direct Organization Access:** Instant transition into tenant workspaces with persistent support banners and audit logging.
- **Audit Logs:** Deep-linked governance logging pre-filtered by organization (`/super-admin/audit-logs?organizationId=...`).

---

## Tech Stack

- **Framework:** Next.js 16.4.6 (App Router, Webpack mode)
- **UI Library:** React 18.3.1
- **Language:** TypeScript 5.6.3
- **Styling:** Tailwind CSS 3.4.17 · Lucide Icons · Recharts 2.13.3
- **Database:** MongoDB Atlas via Mongoose 8.8.1
- **Voice Infrastructure:** Bolna AI API v2 (`@bolna/web-call`)
- **AI Models:** Google Gemini AI (`gemini-2.5-flash`)
- **Authentication:** HTTP-only signed JWT cookies (`jsonwebtoken`) · `bcryptjs`
- **Validation:** Zod 4.6.7 · React Hook Form 7.53.2

---

## Getting Started

### Prerequisites
- Node.js 20.x or higher
- MongoDB Atlas cluster or local MongoDB instance
- Bolna AI API Key ([platform.bolna.ai](https://platform.bolna.ai))
- Google Gemini API Key ([aistudio.google.com](https://aistudio.google.com))

### Installation

```bash
# Clone the repository
git clone https://github.com/PrashantVaishnav680/indiacalling-console.git
cd indiacalling-console

# Install dependencies
npm install

# Copy environment variables template
cp .env.example .env.local
```

### Environment Configuration

Open `.env.local` and configure your credentials:

```env
MONGODB_URI=mongodb+srv://<username>:<password>@<cluster>.mongodb.net/indiacalling_console?retryWrites=true&w=majority
JWT_SECRET=your_secure_32_character_random_hex_key
BOLNA_API_KEY=bn-your_bolna_api_key_here
GEMINI_API_KEY=your_gemini_api_key_here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

*(Refer to `.env.example` for the complete list of optional flags like Razorpay, UPI ID, and model selection).*

### Seed Initial Accounts (Optional)

```bash
npm run seed
```

### Start Development Server

```bash
npm run dev
```

Visit [http://localhost:3000](http://localhost:3000) to access the console.

---

## Verification & Automated Test Suite

Always run the full test and build verification suite before committing:

```bash
# Run TypeScript typecheck, ESLint, test suite, and production build
npx tsc --noEmit && npm run lint && npm test && npm run build
```

The test runner executes **46 automated test specifications** covering:
- Canonical 2-role Zero-PII RBAC enforcement
- Organization tenant isolation and route protection
- Bolna v2 API client and sync idempotency
- Lead qualification scoring algorithms and scheduling state machines
- Wallet usage deductions, GST calculations, and invoice generation
- Authenticated recording stream proxies and owner protection workflows

---

## Deployment (Vercel)

1. Connect your repository to **Vercel** with the **Next.js** framework preset.
2. In **Project Settings → Environment Variables**, add all keys defined in `.env.example`.
3. In your **MongoDB Atlas** console, ensure network access allows connections from Vercel (`0.0.0.0/0`).
4. Trigger deployment from the `main` branch.

---

## License

Private & Proprietary — IndiaCalling Voice AI. All rights reserved.
