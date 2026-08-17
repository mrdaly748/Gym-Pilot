# Product Specification — AI-Powered Gym Management SaaS

Status: Draft for review — revised with Phase 0 product decisions (roles, localization, financial/legal scope, SaaS billing, member data, membership history, retention, canonical metrics)
Owner: Product (this document is the source of truth for product scope)
Out of scope for this document: architecture, database design, API design, infrastructure, specific AI models/SDKs

---

## 1. Product Summary

A B2B SaaS platform that helps gym owners and managers run the day-to-day operations of a gym: members, membership plans, memberships, payments, attendance, trainers, and expenses. The platform gives owners a real-time operational dashboard and analytics built on trustworthy, structured business data.

An AI assistant sits on top of this structured data and lets gym owners ask natural-language questions about their business ("How many memberships expire this week?", "Why did revenue drop this month?") and receive answers grounded in the gym's actual records — not generic or fabricated advice.

The initial market is Tunisian gyms (small-to-medium, single-location, cash/card-driven, currently run on spreadsheets, notebooks, or generic tools). The product is designed so the same model can expand to other MENA markets later without a rebuild.

The product must be fully usable and valuable **without** the AI. AI is a layer of insight on top of reliable operational software, not the product itself.

---

## 2. Problem Statement

Small and medium gyms in Tunisia (and similar markets) typically manage their business with a mix of paper logs, spreadsheets, WhatsApp, and memory. This causes:

- No reliable, real-time view of who is an active member, who is expiring, and who has stopped paying.
- Revenue and outstanding payments tracked inconsistently, often discovered late (a member "still comes" but hasn't paid in two months).
- No structured record of attendance, so owners can't identify disengaged members before they churn.
- No visibility into which membership plans are actually profitable or popular.
- Expenses tracked separately from revenue (if at all), so owners don't have a real picture of profitability.
- Owners lack the time, data literacy, or tooling to turn raw records into decisions — they need direct answers, not more spreadsheets to interpret.

Generic spreadsheet tools and generic AI chatbots both fail here: spreadsheets don't enforce structure or give proactive insight, and a generic chatbot (e.g., asking ChatGPT) has no access to the gym's actual data and will produce plausible-sounding but ungrounded answers.

---

## 3. Product Vision

Become the operational system of record for independent gyms in Tunisia and, over time, the wider MENA region — the single place an owner opens every day to see how their gym is doing, manage members and money, and get trustworthy answers to business questions in plain language.

The product succeeds when a gym owner trusts the numbers on the dashboard enough to make decisions from them, and trusts the AI enough to ask it instead of doing mental math.

---

## 4. Target Users / Personas

### 4.1 Primary persona — Gym Owner ("Sami")
- Owns or manages a single independent gym (~100–800 members) in Tunisia.
- Moderate technical literacy: comfortable with smartphones, Facebook/Instagram, WhatsApp; not a power user of business software.
- Currently uses Excel, a paper notebook, and/or a basic local desktop tool.
- Cares most about: who owes money, who is expiring soon, whether the gym is growing, and not losing time on admin.
- Primary device: laptop or desktop at the front desk; may also check a phone/tablet.

### 4.2 Secondary persona — Gym Staff / Front-Desk Employee
- An employee trusted to run daily operations: look up and register/edit members, check members in, assign/renew memberships, and collect and record payments.
- Not the financial decision-maker; does not see sensitive financial analytics, gym settings, or staff management, and cannot perform destructive financial operations (see [Section 5.3](#53-gym-staff--front-desk)).

### 4.3 Platform persona — Platform Admin ("internal team")
- The SaaS operator's own team (initially the founder or a small ops team).
- Onboards new gym customers, manages gym accounts (activate/suspend), and needs a platform-level view across all tenant gyms — without needing routine access to any gym's member-level data.

### 4.4 Explicitly not a persona in MVP
- Gym members (people who work out at the gym) are **not** system users in MVP. They are data subjects managed by the gym, not accounts that log in.
- Trainers are **not** system users in MVP. They are records managed by the gym admin, not accounts that log in.

---

## 5. User Roles and Responsibilities

MVP ships with three account-holding roles. Permissions are kept intentionally simple — a small, fixed set of roles with clear allow/deny boundaries, not a granular/configurable permission system.

### 5.1 Platform Admin
- Creates and manages gym (tenant) accounts.
- Activates/suspends a gym's access to the platform.
- Views platform-level operational data (e.g., number of active gyms, platform health) — **not** routine access to any individual gym's member, payment, or attendance data.
- Does not perform gym operations (does not manage a gym's members, payments, etc.).
- Manages gym accounts manually in MVP (no self-service SaaS billing — see [Section 8](#8-mvp-scope) and [Section 24](#24-post-mvp--deferred-features)).

### 5.2 Gym Owner / Gym Admin
- Full access to their own gym's data only: members, membership plans, memberships, payments, attendance, trainers, expenses, dashboard, analytics, and AI assistant.
- Full owner-level administration: gym settings, membership plan and trainer management, expense recording, financial/analytics reporting, and management of Gym Staff logins for their own gym.
- The only role that can perform destructive or sensitive financial operations: voiding/adjusting a payment or expense, archiving a plan/trainer, or manually cancelling a membership before its natural expiry.
- Manages their gym's own account settings (within limits set by Platform Admin, e.g., subscription status is platform-controlled).

### 5.3 Gym Staff / Front Desk
A restricted operational role for employees who run daily front-desk activity without owner-level access. Introduced because a solo owner realistically cannot staff the front desk at all times, and the core check-in/payment-collection workflow needs an operational role to support it.

**Can do:**
- Look up members.
- Register new members and edit existing member records (operational fields — name, contact info, emergency contact).
- Membership operations: assign a plan to a member, renew a membership, record a membership freeze/pause.
- Record payments (including partial/installment payments) against a membership.
- Attendance / check-in: search for a member and mark them present.

**Cannot do:**
- No owner-level administration: cannot manage gym settings, membership plan definitions, or trainer records.
- No access to sensitive financial analytics or reports (dashboard revenue/expense/analytics views, AI assistant) — see [Section 11.8](#118-dashboard), [Section 11.9](#119-analytics), and [Section 15.5](#155-ai-user-experience).
- No staff management: cannot create, edit, or remove other Gym Staff or Gym Admin logins.
- No destructive financial operations: cannot void/adjust a payment or expense, cannot archive a plan or trainer, cannot manually cancel a membership, and cannot record expenses at all in MVP (expense recording is Gym Admin-only).

### 5.4 Roles explicitly not introduced
- **Member accounts / member self-service portal**: Explicitly out of scope for MVP. Members are not the buyer or the primary user; self-service (check-in, plan viewing, booking) is valuable but not required to prove the core value proposition (helping the *owner* run the gym). Deferred.
- **Trainer accounts / trainer self-service**: Explicitly out of scope for MVP for the same reason — trainers are data the owner manages, not users who need their own login in v1.
- No further role subdivision beyond these three (e.g., no separate "manager" tier between Gym Admin and Gym Staff) is introduced in MVP.

---

## 6. Goals

1. Give gym owners a single, reliable source of truth for members, memberships, payments, attendance, trainers, and expenses.
2. Replace spreadsheets/paper with a system that is faster and more trustworthy for daily operations.
3. Surface the metrics owners currently have to calculate manually (active members, expiring memberships, revenue, outstanding payments) automatically and correctly.
4. Let owners ask plain-language questions about their gym and get answers grounded in their real data.
5. Establish a multi-tenant foundation where each gym's data is fully isolated, so the platform can safely onboard many gyms.
6. Ship an MVP that a small team can realistically build, operate, and support.

---

## 7. Non-Goals

Explicitly **not** goals for this product (not just for MVP — these are not the product's identity):

- Being a generic AI chatbot that can discuss anything.
- Being a full accounting/bookkeeping or tax-compliance system.
- Being a payment processor or replacing a payment gateway.
- Being a fitness/workout-programming app for end users.
- Being a member-facing social or community platform.
- Being a franchise/multi-location enterprise management suite (in MVP).
- Being an autonomous system that takes actions (financial or otherwise) without a human confirming them.

---

## 8. MVP Scope

### 8.1 In scope for MVP
- Platform Admin: gym account creation, activation/suspension (manual account management — no self-service SaaS billing), platform-level visibility.
- Gym Admin: full CRUD on members, membership plans, memberships, payments, attendance, trainers, expenses; full dashboard/analytics; AI assistant; management of Gym Staff logins.
- Gym Staff: restricted operational access — member lookup/registration/editing, membership operations, payment recording, attendance/check-in (see [Section 5.3](#53-gym-staff--front-desk)).
- Dashboard: active members, new members, expiring memberships, revenue, expenses, outstanding payments, attendance summary (full view for Gym Admin; operational subset for Gym Staff).
- Analytics: trends over time and period-over-period comparisons for the metrics above; membership plan performance (Gym Admin only).
- AI assistant: natural-language Q&A grounded in the gym's own structured data (read-only, no actions; Gym Admin only).
- Multi-tenancy: strict data isolation between gyms, enforced as a non-negotiable product requirement.
- Reliable payment and expense tracking, including partial/installment payments — not a tax/accounting/invoicing system (see [Section 13](#13-business-rules)).
- Single currency (Tunisian Dinar), English-only UI (localization-ready, see [Section 12](#12-non-functional-requirements)), and a single gym per Gym Admin account (multi-location deferred).

### 8.2 Explicitly out of scope for MVP
See [Section 24 — Post-MVP / Deferred Features](#24-post-mvp--deferred-features) for the full list and rationale. In summary: member/trainer accounts or mobile apps, biometric/QR check-in, payment gateway integration, WhatsApp/SMS automation, advanced accounting, inventory, class scheduling/booking, social features, multi-location/franchise management, autonomous AI actions, AI-generated arbitrary SQL execution, self-serve signup and in-product SaaS billing.

---

## 9. Prioritized Features

**P0 — Required to ship a usable MVP:**
1. Gym account provisioning (Platform Admin creates a gym + its Gym Admin login).
2. Member management (create, view, edit, deactivate/archive members).
3. Membership plan management (create/edit/archive plans: name, price, duration).
4. Membership assignment and renewal (assign a plan to a member, track start/end, renew).
5. Payment recording (record payments against a membership; support partial/installment payments; track outstanding balance).
6. Attendance check-in (staff-assisted, search-and-mark-present).
7. Expense recording (categorized expenses with amount and date).
8. Dashboard with core metrics.
9. AI Q&A grounded in the gym's structured data.
10. Tenant data isolation.
11. Role-based permission enforcement for the three MVP roles (Platform Admin, Gym Admin, Gym Staff), per [Section 5](#5-user-roles-and-responsibilities).

**P1 — Strongly desired, ship if timeline allows without compromising P0 quality:**
12. Trainer records and optional member-trainer assignment.
13. Analytics trends and comparisons (beyond the dashboard snapshot).
14. Membership freeze/pause (simple, admin-triggered date extension).
15. Manual early cancellation of a membership (Gym Admin-only), distinct from natural expiration.
16. Basic audit trail on financial edits (who changed a payment/expense and when).

**P2 — Nice to have, first candidates to cut if scope pressure arises:**
17. Export of core data (members, payments) to CSV for the owner's own records.
18. In-app (not email/SMS) notification banner for memberships expiring soon.

---

## 10. User Stories

**Platform Admin**
- As a Platform Admin, I can create a new gym account with an initial Gym Admin login, so a new customer can start using the product.
- As a Platform Admin, I can suspend a gym's account, so access can be revoked (e.g., non-payment of subscription) without deleting their data.
- As a Platform Admin, I can see a list of all gyms and their subscription status, so I know the health of the platform.
- As a Platform Admin, I cannot browse into a gym's member/payment/attendance data during normal operation, so gym data stays private by default.

**Gym Admin**
- As a Gym Admin, I can add a new member with their basic details, so I have a record of who trains at my gym.
- As a Gym Admin, I can define membership plans (e.g., "Monthly", "3-Month", "Annual") with a price and duration, so I can sell consistent products.
- As a Gym Admin, I can assign a plan to a member and record their payment, so I know they are an active, paying member.
- As a Gym Admin, I can see which memberships are expiring in the next N days, so I can follow up before members lapse.
- As a Gym Admin, I can record a partial payment and see the remaining balance owed, so I know who still owes money.
- As a Gym Admin, I can check a member in when they arrive, so I have an attendance record.
- As a Gym Admin, I can record a gym expense (rent, salaries, equipment, utilities, other), so I understand my costs.
- As a Gym Admin, I can see a dashboard of active members, new members, expiring memberships, revenue, expenses, and outstanding payments, so I understand my gym's health at a glance.
- As a Gym Admin, I can see trends and month-over-month comparisons, so I understand whether my gym is improving or declining.
- As a Gym Admin, I can add a trainer's details and optionally link them to members, so I know who works with whom.
- As a Gym Admin, I can ask a natural-language question about my gym ("How is my gym doing this month?") and get an answer based on my actual data, so I don't have to calculate it myself.
- As a Gym Admin, when the AI doesn't have enough data to answer confidently, I want it to tell me that rather than guess, so I don't make decisions based on a fabricated answer.
- As a Gym Admin, I can create restricted Gym Staff logins for my front-desk employees, so they can run daily operations without seeing my full financial picture.

**Gym Staff**
- As a Gym Staff member, I can look up a member by name or phone, so I can serve them quickly at the front desk.
- As a Gym Staff member, I can register a new member and record their initial membership and payment, so a walk-in can join without waiting for the owner.
- As a Gym Staff member, I can renew an existing member's membership and record their payment, so returning members can be served without owner involvement.
- As a Gym Staff member, I can check a member in when they arrive, so attendance is recorded even when the owner isn't present.
- As a Gym Staff member, I cannot see gym-wide revenue/expense analytics, edit gym settings, manage other staff logins, or void a payment, so sensitive financial control stays with the owner.

---

## 11. Functional Requirements

### 11.1 Members
- Create, view, edit, and deactivate/archive a member record (soft-delete: financial and attendance history must never be lost by deleting a member). Gym Admin and Gym Staff can both register and edit members (see [Section 5](#5-user-roles-and-responsibilities)).
- Required fields (minimum): full name, phone number, join date, status (active/inactive).
- Optional field: minimal emergency contact information (name and phone number only). No medical/health information is collected — this is not a medical-record system (see [Section 17](#17-data-and-privacy-requirements-product-level)).
- Prevent duplicate members within the same gym based on phone number (configurable tolerance for legitimate re-entry, e.g. a returning member years later).
- A member's status is derived from their membership state, not manually set arbitrarily (see Business Rules).

### 11.2 Membership Plans
- Create, edit, and archive plans (archiving, not hard-deleting, once a plan has been used — for financial history integrity).
- A plan has: name, price, duration (fixed period, e.g. 30/90/365 days).
- Plans support a zero price (to allow trial/promotional memberships).

### 11.3 Memberships
- Assign a plan to a member, creating a membership with a start date and computed end date.
- Renew a membership (new period following, or extending, the prior one). Renewal creates a new, distinct membership record — it never overwrites the prior one.
- A member can have multiple memberships over time; historical (past) memberships remain visible and clearly distinguishable from the current membership. Normally a member has exactly one active membership at a time — concurrent/overlapping active memberships are not supported in MVP (see [Section 18](#18-edge-cases) and [Section 24](#24-post-mvp--deferred-features)).
- Track membership status: active, expiring soon, expired, frozen, cancelled (see Business Rules for exact definitions).
- Support recording a membership freeze/pause that extends the end date by the frozen duration.
- Support a Gym Admin-only manual early cancellation of a membership (before natural expiry), recorded distinctly from expiration — a restricted/destructive operation not available to Gym Staff.

### 11.4 Payments
- Record a payment against a membership: amount, date, method (free-text/selected category — no gateway integration). Both Gym Admin and Gym Staff can record payments.
- Support partial/installment payments; the system tracks and surfaces the outstanding balance per membership/member.
- Payment history is permanent and auditable; corrections are made via adjustment entries, not silent edits/deletes of historical records (see Business Rules). Voiding/adjusting a recorded payment is a Gym Admin-only, restricted operation — Gym Staff can record new payments but cannot alter or void existing ones.
- MVP financial tracking is limited to reliable payment and expense recording (including installments/partial payments) for the gym's own operational visibility. It is explicitly **not** a tax, invoicing, or accounting system — see [Section 13](#13-business-rules) and [Section 24](#24-post-mvp--deferred-features) for Tunisian tax/accounting/invoicing, which is deferred pending legal/product research.

### 11.5 Attendance
- Staff-assisted check-in: search for a member and mark them present "now." Both Gym Admin and Gym Staff can check members in.
- View attendance history per member and per day/period for the gym.
- No self-service, biometric, or QR check-in in MVP.

### 11.6 Trainers
- Create, edit, and archive trainer records: name, contact info, specialty/notes. Gym Admin-only — trainer management is owner-level administration, not a Gym Staff operation.
- Optionally associate a trainer with one or more members.
- No trainer login, scheduling, payroll, or commission calculation in MVP.

### 11.7 Expenses
- Record an expense: category (from a small fixed/extendable set — rent, utilities, salaries, equipment, marketing, other), amount, date, optional note. Gym Admin-only in MVP — Gym Staff do not record or view expenses.
- View and edit/archive expense entries.

### 11.8 Dashboard
- Gym Admin sees the full dashboard for a selectable period (default: current month): active members, new members, memberships expiring soon, revenue collected, total expenses, outstanding payments, attendance summary.
- Gym Staff sees an operational subset only (e.g., today's attendance, expiring memberships list, member lookup) — revenue, expenses, and outstanding-payment totals are sensitive financial analytics and are not shown to Gym Staff (see [Section 5.3](#53-gym-staff--front-desk)).
- Numbers must be computed the same way everywhere they appear — dashboard, analytics, or the AI — using the single canonical set of metric definitions in [Section 13](#13-business-rules).

### 11.9 Analytics
- Trend views over time for revenue, membership growth, attendance.
- Period-over-period comparison (e.g., this month vs. last month) for core metrics.
- Membership plan performance (which plans generate the most members/revenue).
- Gym Admin-only in MVP — analytics is sensitive financial/business reporting, not part of the Gym Staff operational role.

### 11.10 AI Assistant
- Natural-language question box available to Gym Admins. Not available to Gym Staff in MVP, consistent with Gym Staff's restriction from sensitive financial analytics (see [Section 15.5](#155-ai-user-experience)).
- Answers are generated only from the gym's own structured, computed data (the same metrics available on the dashboard/analytics — see [Section 15](#15-ai-capabilities-and-ai-boundaries)), using the same canonical metric definitions as [Section 13](#13-business-rules).
- Answers are scoped to the asking gym only; no cross-tenant data can appear in a response under any circumstance.
- When the underlying data is insufficient to answer reliably (e.g., a brand-new gym with one week of history), the AI must say so rather than produce a speculative answer.

### 11.11 Platform Administration
- Create a gym account (provisions a Gym Admin login for that gym).
- View list of gyms with basic status (active/suspended, created date).
- Suspend/reactivate a gym's access.
- Platform-level metrics (e.g., count of gyms, count of active gyms) without drilling into any gym's operational data by default.

---

## 12. Non-Functional Requirements

- **Data integrity**: Financial data (payments, expenses) must never be silently lost or overwritten; corrections must be traceable.
- **Tenant isolation**: A gym's data must be completely inaccessible to any other gym under all normal and error conditions. This is treated as a non-negotiable product requirement, not a nice-to-have (see [Section 16](#16-multi-tenant-product-requirements)).
- **Availability**: The product should be reliably usable during a gym's operating hours (typically early morning to late evening, 7 days/week in Tunisia); planned maintenance should avoid peak hours where practical.
- **Performance**: Common actions (check-in, look up a member, record a payment) must feel immediate to front-desk staff serving a member who is waiting. Dashboard and analytics should load within a few seconds for a gym with a realistic member count (hundreds to low thousands).
- **Usability**: Must be usable by staff with basic computer literacy and minimal training; the product should not require the owner to be technical.
- **Auditability**: Changes to financial records (payments, expenses) should be attributable to a user and timestamped.
- **Data durability**: Gym data must be backed up such that an infrastructure failure does not mean a gym loses its business records. (Backup mechanism is an architecture decision; the requirement that data not be lost is a product requirement.)
- **Localization readiness**: MVP ships with English as the only UI language. The product must remain localization-ready for French and Arabic (including Arabic RTL layout) for future MENA expansion — i.e., the product should not hard-assume choices (e.g., left-to-right-only layout assumptions, hardcoded English strings, currency/date formatting tied to one locale) that would block adding French and Arabic later. Full French/Arabic localization and RTL implementation are **not** part of MVP scope (see [Section 24](#24-post-mvp--deferred-features)).
- **Accessibility of core flows**: Core daily-use flows (check-in, payment recording) should be simple enough to complete quickly on a standard laptop/desktop browser at a front desk; tablet use is a plus, not a requirement, for MVP.

---

## 13. Business Rules

### 13.0 Canonical Metric Definitions (Single Source of Truth)

Every important business metric has exactly **one** canonical definition and calculation, used consistently everywhere it appears — dashboard, analytics, and AI assistant alike. No feature is permitted to compute its own variant definition of a metric defined here (e.g., the AI must not have a looser or different notion of "active member" than the dashboard). This applies at minimum to: active members, revenue, outstanding payments, membership expirations, new members, and attendance metrics — each defined below.

Membership status, payment status, and attendance status are kept **conceptually separate** and are not conflated into one another: a membership can be active while a balance is outstanding; a member can attend while their membership is technically expired (flagged, not hidden); attendance history does not retroactively change membership status. This separation is deliberate — it keeps each status trustworthy and independently auditable, and it is what allows the AI to reason precisely (e.g., distinguishing "hasn't paid" from "hasn't attended" from "membership lapsed").

1. **Active member**: A member is "active" if they currently have a membership that is valid (today falls within its date range) and that is **not frozen and not cancelled**. Frozen and cancelled memberships are their own distinct states and are excluded from the active-member count, even though the member record itself remains fully visible.
2. **Expiring soon**: A membership is "expiring soon" if its end date falls within a configurable near-term window (default: 7 days) from today.
3. **Expired**: A membership whose end date has passed and which has not been renewed is "expired." An expired membership does not delete or hide the member — the member record and history remain.
4. **New member**: A member is counted as "new" for a given period if their join date (first-ever membership start) falls within that period.
5. **Outstanding balance / outstanding payments**: The outstanding balance for a membership is its plan price minus the sum of payments recorded against it. A membership can be active while carrying an outstanding balance (gyms commonly let trusted members pay late); this is tracked, not silently blocked, in MVP. The gym-level "outstanding payments" metric is the sum of outstanding balances across all current (non-cancelled) memberships.
6. **Membership freeze**: Freezing a membership pauses its countdown; the end date is pushed back by the number of frozen days when the freeze ends. A frozen membership is not counted as "active" (per Rule 1) but is not counted as "expired" either — it has its own state.
7. **Membership cancellation**: A Gym Admin may manually cancel a membership before its natural expiry (e.g., member request, dispute). A cancelled membership is a distinct, permanent historical state — separate from "expired" (which means the term ran out naturally) — and is excluded from the active-member count per Rule 1. Cancellation does not itself imply a refund; refund handling is out of scope for MVP.
8. **Membership history**: A member may have multiple memberships over time (e.g., successive renewals, or a new membership after a gap). Renewing or replacing a membership always creates a new, distinct membership record — historical memberships are never overwritten and remain visible, clearly distinguishable from the current one. Normally exactly one membership is active per member at a time; concurrent/overlapping active memberships are not supported in MVP (see [Section 18](#18-edge-cases)).
9. **Revenue**: Revenue for a period is the sum of payments recorded within that period (cash-basis, not accrual) — i.e., revenue reflects money actually collected, matching how a small gym owner thinks about cash flow.
10. **Attendance metrics**: For a given period, the gym's attendance is measured as (a) total check-ins recorded in that period, and (b) the count of distinct members who checked in at least once in that period ("unique visitors"). Both figures are tracked and reported consistently by that same definition everywhere attendance is shown (dashboard, analytics, AI).
11. **Financial record correction**: Payments and expenses are never hard-deleted once saved; corrections happen via a visible adjustment/void, preserving history for trust and audit. Voiding/adjusting is a Gym Admin-only operation.
12. **Plan/trainer archiving**: A membership plan or trainer used by any historical record cannot be hard-deleted, only archived (hidden from new-selection lists but preserved for historical reporting).
13. **Tenant scoping**: Every business record (member, plan, membership, payment, attendance entry, trainer, expense) belongs to exactly one gym and is never visible or reachable from another gym's context.
14. **Currency**: All monetary values within a gym are recorded in a single currency (Tunisian Dinar for MVP); the product does not mix currencies within one gym's records.
15. **Financial scope boundary**: MVP financial tracking (payments, expenses, outstanding balances) is for the gym's own operational visibility only. It is not a tax, invoicing, or accounting system; advanced Tunisian tax/accounting/invoicing capabilities are explicitly deferred pending legal/product research (see [Section 24](#24-post-mvp--deferred-features)).
16. **Data retention on deactivation**: Deactivating/archiving a gym account (Platform Admin action) is distinct from permanently deleting its data. Deactivation does not trigger immediate data destruction; permanent deletion is a separate, deliberate action governed by a retention policy to be defined later (see [Section 17](#17-data-and-privacy-requirements-product-level)).

---

## 14. Core User Flows

1. **Gym onboarding**: Platform Admin creates a gym account → Gym Admin receives credentials → Gym Admin logs in → Gym Admin sets up membership plans → Gym Admin starts adding members.
2. **New member sign-up**: Gym Admin/staff creates a member record → assigns a membership plan → records the initial payment (full or partial) → member is now active.
3. **Renewal**: Gym Admin/staff finds an expiring/expired member → renews their membership (new plan or same plan) → records payment.
4. **Daily check-in**: Staff searches for a member by name/phone → marks them present → system logs the timestamp.
5. **Payment collection for outstanding balance**: Staff looks up a member with an outstanding balance → records a new payment → balance updates.
6. **Expense logging**: Gym Admin records a recurring or one-off expense (e.g., monthly rent) with category and amount.
7. **Daily/weekly review**: Gym Admin opens the dashboard → reviews active members, expiring memberships, revenue, outstanding payments → takes action (calls members, follows up on payment).
8. **Ask the AI**: Gym Admin types a question in plain language → AI computes/looks up the relevant grounded metrics → AI responds with a direct answer referencing the underlying numbers.
9. **Platform oversight**: Platform Admin reviews the list of gyms → identifies a gym with a lapsed subscription → suspends access; later reactivates once resolved.
10. **Front-desk staffing**: Gym Admin creates a Gym Staff login for an employee → employee logs in with restricted access → runs day-to-day check-in, member registration, and payment collection without seeing gym-wide financial analytics.

---

## 15. AI Capabilities and AI Boundaries

### 15.1 What the AI should do in MVP
- Answer natural-language questions about the asking gym's own operational data: members, memberships, payments, attendance, expenses, trainers, and the metrics/trends derived from them.
- Ground every answer in the same computed metrics that power the dashboard and analytics — the AI must not compute business numbers by a different, untrusted path than the rest of the product.
- Explain and contextualize numbers the product already trusts (e.g., "Revenue is X this month, down Y% from last month, driven mainly by Z fewer renewals" — where Z is itself a real, computed figure, not a guess).
- Answer comparison questions (this month vs. last month), lookup questions (how many memberships expire this week), and simple diagnostic questions framed around the gym's own recorded internal factors (fewer renewals, more cancellations, plan mix shift).
- Clearly decline or hedge when it lacks sufficient data (e.g., a gym with two weeks of history asked about a "trend"), rather than fabricating a trend.

### 15.2 What the AI should NOT do in MVP
- Must not act as a general-purpose chatbot (no unrelated small talk, no answering questions outside the gym's own business data).
- Must not take any action that changes data (no creating/editing/deleting members, payments, memberships, etc.) — MVP AI is read-only/advisory. Any future action-taking must be explicit, confirmed by a human, and scoped narrowly (post-MVP).
- Must not generate or execute arbitrary queries against the database directly; it must operate over a constrained, product-defined set of data/metrics it is allowed to read (the exact mechanism is an architecture decision, but the boundary itself — "no arbitrary query execution" — is a product requirement).
- Must not access or reference any other gym's data under any circumstance.
- Must not speculate about causes outside the gym's own recorded data (e.g., must not claim "the local economy" or "a competitor gym opening" caused a revenue drop) — it may only reason about causes visible in the gym's own records (fewer renewals, more expirations, plan mix, attendance drop).
- Must not give medical, legal, or financial/tax advice.
- Must not fabricate a specific number that is not backed by an actual query against real data.

### 15.3 What information the AI is allowed to reason about
- The requesting gym's own structured, computed business data: members, plans, memberships, payments, attendance, trainers, expenses, and the derived metrics/trends already defined as trusted product calculations (see [Section 13](#13-business-rules)).
- Nothing outside that gym's tenant boundary. Nothing outside the categories of data this product collects (no web browsing, no external data sources, in MVP).

### 15.4 Grounding and anti-hallucination approach (product-level)
- Every factual claim the AI makes about the business (a number, a trend, a comparison) must be traceable to an actual computation over the gym's real data — not generated freeform by the language model.
- The AI must use the exact same canonical metric definitions as the dashboard and analytics (see [Section 13.0](#130-canonical-metric-definitions-single-source-of-truth)) — it is never permitted to compute its own variant notion of "active member," "revenue," "outstanding payments," or any other defined metric.
- The AI's role is to interpret and explain numbers the product has already computed and trusts, and to help the user retrieve/compare them via natural language — not to be the source of the numbers itself.
- Where the user's question cannot be mapped to real, available data, the product must prefer an honest "I don't have enough information to answer that" over a plausible-sounding fabrication.
- (The specific technical grounding mechanism — e.g., retrieval, tool-calling, structured query layer — is an architecture decision for the next phase, not this document.)

### 15.5 AI user experience
- Presented as an assistant embedded in the gym's own dashboard experience (not a separate, generic product) — it should feel like "ask my gym's data a question," not "chat with an AI."
- Available to Gym Admin users only in MVP. Gym Staff do not have access to the AI assistant, consistent with their restriction from sensitive financial analytics (see [Section 5.3](#53-gym-staff--front-desk)) — this is a default decision, not yet explicitly re-confirmed by the latest round of product decisions, and is flagged for confirmation (see [Section 25](#25-open-questions)).
- Responses should be concise, business-relevant, and where useful reference the specific numbers behind the answer (so the owner can verify/trust it, and cross-check it against the dashboard).
- The assistant should make its limits visible when relevant, e.g., noting when a comparison period has too little data to be meaningful.

### 15.6 Deferred AI features (post-MVP)
- Proactive/autonomous alerts ("I noticed X, want me to do Y?") beyond passive display of metrics.
- AI-initiated actions on data (even with confirmation) — MVP is read-only.
- Predictive churn scoring / member risk modeling.
- Personalized workout or nutrition programming for members.
- Voice interface.
- Multi-turn autonomous agent behavior (the AI taking a sequence of independent actions toward a goal).

---

## 16. Multi-Tenant Product Requirements

Multi-tenancy is a fundamental, non-negotiable product requirement, not an implementation detail to be addressed later:

1. **Ownership**: Every gym is its own tenant and owns its own data (members, plans, memberships, payments, attendance, trainers, expenses) completely independently of every other gym.
2. **Isolation**: A user authenticated to one gym must never be able to view, modify, or infer the existence of another gym's data — including through indirect means (e.g., error messages, shared identifiers, search, or AI responses).
3. **Platform vs. gym separation**: Platform Admin access is a distinct privilege tier from gym-level access (Gym Admin and Gym Staff are both gym-level roles, scoped to their own gym only). Platform Admin's default posture is administrative (account lifecycle, platform health) — not routine visibility into a gym's member/financial/attendance data. Any legitimate need for a Platform Admin to view gym-level data (e.g., support/debugging) is an exception path, not the default, and should be deliberate and traceable — the exact mechanism is an architecture decision.
4. **AI isolation**: The AI assistant is subject to the same tenant boundary as every other feature — a question asked from Gym A's account can only ever be answered using Gym A's data.
5. **Testability**: Tenant isolation must be a property the product can be verified against (e.g., through dedicated testing before release and on an ongoing basis) — "isolation is assumed" is not acceptable; isolation must be demonstrable.
6. **No cross-tenant aggregation in MVP**: The product does not offer any feature in MVP that aggregates or compares data across multiple gyms (e.g., no "benchmark against other gyms"). This avoids an entire category of cross-tenant leakage risk in v1 and can be reconsidered later as an explicit, anonymized, opt-in feature.

---

## 17. Data and Privacy Requirements (Product Level)

- **Minimum necessary member data**: Collect the minimum member data needed to run the business relationship (name, contact info, membership/payment/attendance history). The product is explicitly **not** a medical-record system: no health/medical information is collected. The only exception is a minimal, optional emergency-contact field (name and phone number) — offered because it is operationally useful (e.g., in a gym emergency) without holding actual health data.
- **Gym owns its data**: The gym, not the platform, is the data controller for its member data in the relationship with its own members; the platform is a processor on the gym's behalf. (Legal framing to be confirmed with counsel — flagged as a risk/assumption, not decided here.)
- **Data portability**: A gym owner should be able to get their own data out of the system (at minimum, a basic export) — protects against vendor lock-in concerns that would otherwise block adoption. (P2 in MVP, see [Section 9](#9-prioritized-features).)
- **Retention on deactivation/cancellation**: Deactivating or suspending a gym account does not immediately destroy its data — deactivation/archival and permanent deletion are treated as separate, distinct actions (see [Section 13, Rule 16](#130-canonical-metric-definitions-single-source-of-truth)). A formal retention/deletion policy (exact timelines, legal deletion process, export-before-deletion workflow) is deferred to be defined later — see [Section 25](#25-open-questions).
- **Access control**: Only the gym's own authorized users (Gym Admin and Gym Staff, per their respective permissions) can access its data; Platform Admin access is limited per [Section 16](#16-multi-tenant-product-requirements).
- **AI data boundary**: As stated in [Section 15](#15-ai-capabilities-and-ai-boundaries), the AI can only reason over the requesting gym's own data — this is as much a privacy requirement as an AI-quality requirement.

---

## 18. Edge Cases

- A member's membership expires while they still physically show up and try to check in — the system should allow the check-in to be recorded (attendance and payment status are tracked separately) while clearly flagging the expired status to staff.
- A member returns after a long absence (e.g., 2 years) — should be matched/reactivated on their existing record where possible rather than always creating a duplicate.
- A member appears to need two overlapping memberships at once (e.g., a gym plan and a separate personal-training package) — MVP does not support concurrent/overlapping active memberships (see [Section 13, Rule 8](#130-canonical-metric-definitions-single-source-of-truth)); this is deferred as an explicit future capability rather than silently supported or silently blocked with no product answer (see [Section 24](#24-post-mvp--deferred-features)).
- A membership plan is edited (price change) after members are already actively on it — existing memberships must retain the price/terms they were sold under; only new assignments use the new price.
- A membership plan or trainer that has historical records attached is "deleted" — must be archived, not removed, to preserve payment/attendance history integrity.
- A payment is recorded in error (wrong amount/member) — must be correctable via a visible adjustment, not a silent delete/edit that breaks the audit trail.
- A gym has zero historical data (brand new) and the owner asks the AI a trend question — AI must recognize insufficient data rather than fabricate a trend.
- A gym is suspended by Platform Admin while staff are actively using it — in-progress actions should fail gracefully and clearly (e.g., "your gym's account is inactive, contact support"), not silently or confusingly.
- Two staff members try to check in / record a payment for the same member at nearly the same time — should not corrupt data (last valid write should be consistent, not a data race); exact handling is a technical concern but "must not corrupt financial/attendance data" is a product requirement.
- A membership freeze is applied, un-applied, or applied twice — must not create inconsistent expiry dates.
- A Gym Staff user attempts a restricted action (e.g., voiding a payment, viewing analytics, editing gym settings) — must be blocked with a clear explanation, not a confusing error, and must not be silently allowed through any indirect path (e.g., via the AI assistant, which Gym Staff also cannot access).

---

## 19. Error / Empty / Loading States That Matter at the Product Level

- **New gym, no data yet**: Dashboard and analytics must present a clear "no data yet" / onboarding-guidance state instead of blank confusion or misleading zeros that look like "the business earned nothing."
- **No members match a search**: Clear "no results" state during check-in/lookup flows (front-desk staff need this to be unambiguous while a member is waiting).
- **AI has insufficient data**: The AI must have a defined, honest "I don't have enough data to answer that yet" response rather than silence, an error, or a fabricated answer.
- **Payment recorded but balance still outstanding**: Must clearly show partial-payment success and the remaining balance, not just a generic "success" message.
- **Gym account suspended**: Login/usage must show a clear, non-technical explanation (contact support / subscription issue) rather than a generic error.
- **Slow-loading analytics for a gym with a lot of history**: Should show a loading state rather than appearing frozen or broken.

---

## 20. Success Metrics / Product Metrics

- **Adoption**: % of onboarded gyms actively using the system weekly/daily (login + at least one core action: check-in, payment, or member edit).
- **Retention**: Gym subscription renewal rate month over month.
- **Core-workflow reliance**: % of a gym's active members with attendance and payment history actually tracked in-system (a proxy for "have they abandoned spreadsheets/paper for this").
- **AI engagement and trust**: % of active gyms that use the AI assistant at least weekly; qualitative/explicit feedback signal (e.g., a simple thumbs up/down on AI answers) indicating trust in responses.
- **Operational value**: Reduction in outstanding/uncollected payments visibility gap (i.e., owners report knowing who owes money, rather than being surprised).
- **Support burden**: Low volume of "my data looks wrong" or "I can't find my member" support issues — a proxy for data integrity and usability.

---

## 21. Assumptions

- Gyms in the initial target market are single-location, independently owned, with member counts roughly in the low hundreds to a couple thousand.
- Gym owners/staff have basic smartphone/computer literacy and reliable-enough internet access to use a web-based product.
- Currency for MVP is Tunisian Dinar (TND); no multi-currency support is needed yet.
- A gym operates on a single time zone (Africa/Tunis).
- Gyms are comfortable recording payments manually (cash/card/transfer) without needing an integrated payment gateway in MVP.
- The SaaS subscription relationship itself (the gym paying the platform) is handled manually/offline by the Platform Admin in MVP — this is now a firm product decision, not an open question; self-service SaaS billing is deferred (see [Section 24](#24-post-mvp--deferred-features)).
- MVP ships with three fixed, simple roles (Platform Admin, Gym Admin, Gym Staff) rather than a configurable permission system — this is assumed to be sufficient for a small gym's staffing reality; a more granular permission model is deferred unless real usage proves the three-role model too coarse.
- English is an acceptable sole MVP UI language for the initial launch audience, with French/Arabic localization expected to matter for broader Tunisian/MENA adoption post-MVP (see [Section 25](#25-open-questions)).

---

## 22. Constraints

- Must be buildable and maintainable by a small development team/effort — this is a hard constraint on scope, not just a preference.
- No payment gateway integration in MVP (explicit product-direction constraint).
- No SMS/WhatsApp automation in MVP (explicit product-direction constraint; also a real cost/complexity driver in the Tunisian market where SMS delivery and cost vary by carrier).
- No biometric hardware dependency in MVP (explicit product-direction constraint; also avoids hardware distribution/support burden for a small team).
- AI features depend on a third-party AI provider's availability, cost, and behavior — a business/operational constraint, not just technical.
- Local regulatory requirements in Tunisia (data protection, invoicing/tax rules) are not fully known at this stage and may constrain later phases — flagged as a risk, not assumed away.

---

## 23. Risks

- **AI trust risk**: If the AI ever produces an incorrect or fabricated business claim (e.g., a wrong revenue figure), it can quickly destroy owner trust in the entire product, not just the AI feature. Mitigation is grounding discipline as defined in [Section 15](#15-ai-capabilities-and-ai-boundaries).
- **Adoption/behavior-change risk**: Gym owners have entrenched habits (paper, WhatsApp, memory); the product must be clearly faster/easier than what it replaces or it won't get used.
- **Data sensitivity risk**: Even without health data, member contact info and payment history are sensitive; a tenant-isolation failure would be a severe trust and possibly legal event. Treated as a top-tier requirement in [Section 16](#16-multi-tenant-product-requirements).
- **Regulatory/compliance risk**: Tunisian (and future MENA-market) requirements around data residency, consumer receipts/invoicing, and tax may impose requirements not yet identified — flagged for follow-up, not assumed to be nonexistent.
- **Pricing/willingness-to-pay risk**: The target market is price-sensitive; the product must prove clear operational value to justify a recurring SaaS cost.
- **Small-team operational risk**: A small team supporting many gym customers (especially around financial data) has limited capacity to firefight; the product must minimize support burden through clarity and reliability (see [Section 20](#20-success-metrics--product-metrics)).
- **Third-party AI dependency risk**: Cost, rate limits, or availability changes from an external AI provider could affect the AI feature's reliability or unit economics — a business continuity concern for that feature specifically (not the core product, which must work without AI).

---

## 24. Post-MVP / Deferred Features

Each item below was evaluated against the MVP and deliberately deferred, with rationale:

| Feature | Why deferred |
|---|---|
| Member mobile app / member self-service portal | Members are not the buyer; owner-facing value can be proven without it; adds a second user experience, auth surface, and support burden. |
| Trainer mobile app / trainer self-service scheduling | Trainers are managed as records, not users, until scheduling/commission needs are validated. |
| Biometric check-in (fingerprint, etc.) | Hardware dependency and distribution/support burden not justified before manual check-in is validated. |
| QR / self-service kiosk check-in | Depends on member-facing experience, which is itself deferred. |
| Payment gateway integration (cards, online payments) | Explicit product-direction constraint; manual payment recording proves the workflow value first; gateway adds compliance/PCI-adjacent complexity. |
| WhatsApp / SMS automated reminders | Explicit product-direction constraint; real per-message cost and delivery complexity in-market; in-app notification can validate the underlying need first. |
| Advanced Tunisian tax / accounting / formal invoicing compliance | A different, deep product domain requiring proper legal/product research before design; MVP needs simple, reliable revenue/expense/payment tracking, not a compliant accounting or e-invoicing system. Explicitly deferred pending that research, not silently assumed unnecessary. |
| Inventory management | Not a core driver of the stated problem (member/payment/attendance visibility). |
| Class scheduling / booking system | Real feature for many gyms, but adds significant scope (calendars, capacity, conflicts); not required to prove the core value proposition. |
| Workout/program builder | Fitness-content product, distinct from gym *business* management; would dilute focus. |
| Social/community features | Explicit product-direction exclusion; not aligned with a B2B owner-facing tool. |
| Multi-location / franchise management | Explicit product-direction exclusion; adds a whole tier of cross-location roles/rollup reporting; initial target gyms are single-location. |
| Autonomous AI agents (AI takes actions) | MVP AI is intentionally read-only/advisory to control risk while trust is established. |
| AI-generated arbitrary SQL / open-ended data access | Direct security and hallucination risk; MVP constrains the AI to vetted, product-defined data access. |
| Self-serve signup + integrated SaaS billing for gyms | Explicit product decision: gym subscription billing for the SaaS itself is not part of MVP. Platform Admin manages gym accounts manually; early-stage, sales-led onboarding is sufficient and simpler to control at low gym counts. |
| Granular/custom permission tiers beyond the three fixed MVP roles (e.g., per-feature configurable permissions, a fourth role) | The three-role model (Platform Admin, Gym Admin, Gym Staff) with fixed, simple allow/deny permissions is the explicit MVP decision; further subdivision is deferred unless real usage proves it necessary. |
| Full French and Arabic localization, including Arabic RTL layout | Explicit product decision: MVP ships English-only. French/Arabic localization is planned and the product must remain localization-ready for it, but full translation and RTL implementation are not built in MVP. |
| Medical-record / health-information tracking for members | Explicit product decision: this is not a medical-record system. Only a minimal, optional emergency-contact field (name + phone) is included; broader health data collection is deferred unless a clear, specific need and liability review justify it. |
| Overlapping/concurrent active memberships per member (e.g., simultaneous separate packages) | MVP assumes one active membership per member at a time. Genuine multi-package concurrency is deferred as an explicit future capability requiring its own design, not silently supported. |
| Formal data retention & permanent-deletion policy (exact timelines, legal deletion process) | The principle that deactivation ≠ deletion is decided for MVP; the precise retention duration and deletion process is deferred to be defined later, potentially with legal input. |
| Churn prediction / ML risk scoring | Requires a data history MVP gyms won't yet have; premature before basic attendance/payment tracking is even adopted. |
| Cross-gym benchmarking / aggregate analytics | Cross-tenant aggregation is a distinct, higher-risk feature class deferred until tenant isolation is proven and an opt-in model is designed. |

---

## 25. Open Questions

The Phase 0 product decisions resolved several previously open questions (staff role, MVP language, SaaS billing, medical/emergency data, concurrent memberships, and the "active member" definition — see [Section 27](#27-assumptions-that-should-be-challenged) for how each was resolved). The following remain genuinely open and require explicit answers/approval before or during the architecture phase:

1. **Local compliance**: Are there Tunisian legal/tax requirements (e.g., formal receipts, invoicing rules) the product must support even at MVP? Decision 3 confirms MVP will not build a full tax/accounting/invoicing system, but it does not establish whether some minimal legal requirement (e.g., a basic receipt) is mandatory even for a simple payment-recording feature. Not yet researched — needs a definitive answer, not an assumption.
2. **Data retention specifics**: The principle that deactivation ≠ deletion is now decided (see [Section 13, Rule 16](#130-canonical-metric-definitions-single-source-of-truth)). The exact retention duration, the permanent-deletion process, and who can request export/deletion still need to be defined — likely with legal input.
3. **AI access for Gym Staff**: This document currently assumes Gym Staff do **not** get AI assistant access in MVP, as a direct consequence of their restriction from sensitive financial analytics (see [Section 15.5](#155-ai-user-experience)). This wasn't explicitly stated in the Phase 0 decisions and should be explicitly confirmed rather than left as an inferred default.
4. **Multi-language for AI responses**: Once French/Arabic localization is eventually built, should the AI assistant respond in the user's UI language, or is that a separate, later decision? Not urgent for MVP (English-only) but worth flagging now since it affects future AI design.

---

## 26. Missing Requirements

Requirements not stated in the original brief but necessary for a coherent, launchable product, added here for visibility and approval:

- **Authentication basics**: password reset, session handling expectations (product-level: users must be able to recover access without contacting support manually every time) — how this is built is an architecture decision, but the requirement to have it is a product gap otherwise.
- **Audit trail on financial edits**: who changed a payment/expense record and when (listed as P1 in [Section 9](#9-prioritized-features), called out here because it wasn't in the original brief but is necessary given money is involved).
- **Duplicate-member handling policy**: explicit product rule for detecting/handling likely-duplicate member records (see [Section 11.1](#111-members)).
- **Soft-delete/archive policy**: explicit rule that financial/attendance-linked records (members, plans, trainers) are archived, not hard-deleted (see [Section 13](#13-business-rules), rules 3 and 12).
- **AI minimum-data threshold behavior**: explicit product behavior for when the AI is asked something it can't yet answer responsibly (see [Section 15.1](#151-what-the-ai-should-do-in-mvp)).
- **Data export/backup for the owner**: basic ability for a gym owner to get their own data out (see [Section 17](#17-data-and-privacy-requirements-product-level); P2 scope).
- **Terms of service / privacy policy content**: a legal, not engineering, gap — needed before real gyms and their members' data are onboarded, but outside this document's scope to draft.
- **Currency and date/time formatting consistency**: needs to be explicit early so MENA expansion doesn't require rework (see [Section 12](#12-non-functional-requirements)).

---

## 27. Assumptions That Should Be Challenged

This section explicitly revisits assumptions from the original brief and states how they were treated, including how they were subsequently resolved by the Phase 0 product decisions.

- **"Two roles are sufficient for MVP."** Originally challenged and raised as an open question. **Resolved by Phase 0 decision 1**: MVP now ships three fixed roles (Platform Admin, Gym Admin, Gym Staff), with Gym Staff given a deliberately narrow, simple permission set (member/membership/payment/attendance operations only — no financials, settings, staff management, or destructive operations). This is a direct product decision, not a re-opened question — but note the follow-on question of whether Gym Staff should have AI access was not explicitly addressed and is now flagged as [Open Question 3](#25-open-questions).
- **"No payment gateway is fine."** Accepted for MVP and reaffirmed by Phase 0 decision 3: manual recording proves the core workflow value (visibility into who owes what, including installments) without gateway integration/compliance overhead. Revisit once the base product is validated and owners start asking for online payment links.
- **"Attendance via manual check-in only is valuable enough."** Accepted, but flagged as a compliance-risk assumption: manual check-in only works if staff reliably use it every time a member arrives; if adoption of the check-in step itself is weak, the attendance data (and anything the AI says about "members who haven't visited recently") becomes unreliable. This is a UX-execution risk to watch, not a reason to add hardware in MVP. Unaffected by Phase 0 decisions, other than that Gym Staff (not just Gym Admin) now perform check-ins, which should improve real-world adoption of the step.
- **"The AI can explain *why* revenue changed."** Narrowed: the AI may only cite causes visible in the gym's own recorded data (fewer renewals, more expirations, plan mix shift, attendance drop) — it must not speculate about external causes (economy, competition, weather, etc.) it has no data on. This boundary is explicitly preserved by Phase 0 decision 9 (see [Section 15.2](#152-what-the-ai-should-not-do-in-mvp)) and reinforced by the new canonical-metrics requirement (decision 8): the AI must reason from the same defined numbers as the dashboard, not its own interpretation.
- **"Membership freeze/pause" wasn't in the original brief at all.** Added as P1 because it is a very common real-world gym operation (member travels, gets injured) and without it, owners will make ad hoc manual date changes that undermine the reliability of the membership-status data the whole product (and the AI) depends on. Kept deliberately simple (manual trigger, date-shift only) to avoid scope creep. Unaffected by Phase 0 decisions.
- **"Active member = valid, unexpired membership" — is that the right mental model, or should attendance/engagement factor in?** **Resolved by Phase 0 decision 8**: active member is now explicitly defined as "a membership that is currently valid and is not frozen or cancelled" — attendance/engagement is deliberately kept as a *separate* signal (per the membership/payment/attendance status-separation principle in [Section 13.0](#130-canonical-metric-definitions-single-source-of-truth)), not folded into the active-member calculation.
- **A "cancelled" membership status was not previously defined in this document.** Introduced as a minimal addition to make the Phase 0 active-member definition ("not frozen or cancelled") concrete: a Gym Admin-only manual early-cancellation action, distinct from natural expiration, with no implied refund logic in MVP. This is a small, deliberate scope addition inferred from decision 8's wording — flagged here for visibility rather than silently added, since it is a new (if minimal) capability, not just a definition.
- **Concurrent/overlapping memberships per member.** Previously an open question. **Resolved by Phase 0 decision 6**: MVP assumes exactly one active membership per member at a time; genuine concurrency (e.g., simultaneous separate packages) is explicitly deferred as a future capability rather than built or silently disallowed with no product answer.
- **Medical/health data collection.** Previously an open question. **Resolved by Phase 0 decision 5**: no medical-record system; only a minimal, optional emergency-contact field (name + phone) is included. This keeps the product's data footprint deliberately narrow and avoids liability/privacy exposure disproportionate to MVP needs.
- **SaaS subscription billing for gyms.** Previously an open question. **Resolved by Phase 0 decision 4**: fully manual/offline via Platform Admin in MVP; self-service billing deferred.
- **UI language for MVP.** Previously an open question. **Resolved by Phase 0 decision 2**: English-only for MVP, with an explicit non-functional requirement that the product remain localization-ready for French and Arabic (including RTL) without committing to building that localization now.
- **"Trainers" was listed as a core entity but not clearly a role.** Interpreted as data the gym manages (a directory + optional member linkage), not a login/user, because no requirement demonstrated trainers need their own access in MVP. Unaffected by Phase 0 decisions; trainer management remains Gym Admin-only (explicitly not delegated to Gym Staff, consistent with keeping Gym Staff permissions narrow).
- **"Multi-tenancy is a fundamental requirement" was explicit in the brief and not weakened anywhere in this document** — confirmed as-is rather than softened, and extended to explicitly cover the new Gym Staff role (Gym Staff is just as strictly tenant-scoped as Gym Admin) and the AI assistant, since it is the single hardest-to-retrofit product property if under-specified now.

---

*End of document.*
