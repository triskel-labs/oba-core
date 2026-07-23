# Tipiti Stripped Down to Simplicity

Date: 2026-07-23  
Status: strategic product draft — use before more OBA feature coding  
Owner: Dave / Mao  
Related docs:

- `docs/product-control-strategy.md`
- `docs/tipiti-service-scenario-matrix.md`
- `docs/tipiti-operating-spec.md`

## 0. Why this exists

The previous OBA direction is coherent, but it risks becoming too complex before Tipiti has proven daily value.

Dave's correction:

> Strip Tipiti down to the simplest indispensable system: a business-owned operational record, a very usable manager cockpit, and low-friction communications. Do not reinvent complex calendars, notification engines, or overdesigned service logic before we know what is actually needed.

After review, Dave sharpened the rule:

> Simplicity and not reinventing the wheel are mandatory, but the user interaction with the data must still be top-notch — closer to a game-like cockpit than a spreadsheet clone.

This document is a product reset lens. It does not delete the existing workflow architecture; it ranks what matters first.

## 1. Core thesis

Tipiti does not first need a perfect booking platform.

Tipiti first needs a **clean operational second brain with controls**:

1. Everything important that now lives in WhatsApp, paper, memory, or scattered sheets must become a reliable record.
2. Cris/Patri must retain full control of their business data, like a better Google Sheet with full CRUD access.
3. The day-to-day manager must get a simple cockpit for the work that happens today: clients, bookings, payments, sessions, instructors, material, changes, and reminders.
4. Communication should happen through low-friction channels people already use — likely WhatsApp/Telegram first — instead of forcing every actor into an app.
5. Complex systems should be reused when possible, not rebuilt from scratch.

Short version:

> Database first. Cockpit second. Messages third. Smart automation later.

## 2. Non-goals for the stripped-down Tipiti MVP

These are deliberately not first-priority unless a concrete workflow forces them.

| Non-goal | Why not now? | Acceptable placeholder |
|---|---|---|
| Perfect calendar system | Surf scheduling depends on conditions; forcing fake certainty creates friction | Agenda list + pending schedule states + optional external calendar links |
| Full customer portal | Customers already use WhatsApp; adoption cost is high | Owner-created records + message templates |
| Teacher/instructor app | Professors probably only need daily assignment messages | Telegram/WhatsApp notifications with confirmation links later |
| Fully automated booking bot | Too many edge cases; wrong automation damages trust | Intake assistant that collects missing fields and proposes drafts |
| Deep service-module UI | Makes owners think like engineers | Workflow presets + advanced/raw data screen |
| Complex payment platform | Classes/rentals are mostly paid in person | Payment status/method notes first |
| Sophisticated multi-tenant SaaS | Tipiti proof comes before generic platform expansion | Single-business clean model first |

## 3. Product layers for simplicity

### 3.1 Owner/Admin data layer

This is the "better than Google Sheets" layer.

Requirements:

- Full CRUD over all core records.
- Clear tables/lists, bulk-ish editing where useful, no hidden magic.
- Owners can correct anything manually.
- Nothing important exists only in automation logs or chat history.
- Every automation writes back into visible records.

Owner-visible core records:

| Record | Purpose | Minimum fields |
|---|---|---|
| Client | Who is asking/booking | name, phone, language, notes, history |
| Booking / Request | Commercial/operational intent | service, dates, people, status, payment state, source, notes |
| Participant | Actual person doing the activity | name/alias, level, size/gear notes, attendance |
| Session / Agenda item | Operational delivery slot or pending task | date, time/state, roster, instructor, material demand |
| Payment record | Money tracking | expected amount, paid amount, method, status, notes |
| Staff / Instructor | Who can deliver | name, contact, availability notes, assigned sessions |
| Material demand/allocation | What is needed / assigned | type, quantity, exact item optional, status |
| Message/action log | What was sent or needs sending | recipient, channel, template/free text, state |

### 3.2 Manager cockpit layer

This is the daily operational UI. It can be visually rough, but UX must feel obvious and almost game-like.

It should answer:

- Who is coming today/tomorrow?
- What is not scheduled yet?
- Who has not paid?
- Which instructor is assigned?
- What material is needed?
- What message needs to be sent?
- What changed since last check?

The cockpit should not expose the whole database by default. It should expose *actions*.

First cockpit screens:

1. **Today** — agenda cards with status, people, payment, material, instructor, message actions.
2. **Requests** — unresolved WhatsApp/intake/admin requests needing decisions.
3. **Bookings** — searchable operational records.
4. **Clients** — history and notes.
5. **Data/Admin** — full CRUD tables for Cris/Patri.

### 3.3 Communication layer

This is not "build a social network".

This is a notification/action layer over the records.

Needed audiences:

| Audience | What they need | First channel |
|---|---|---|
| Cris/Patri/owner | Daily summary, unresolved requests, warnings, approval prompts | Telegram or WhatsApp |
| Manager/operator | Today/tomorrow operational list, changes, payment/material gaps | Telegram or app cockpit |
| Instructors | Assigned sessions, time, location, client count, level/material notes | WhatsApp/Telegram message |
| Clients | Confirmation, maps, what to bring, schedule pending explanation, changes | WhatsApp |
| Partners/collaborators | External trip/date info, redirects, manual coordination | Manual link/message first |

Message rule:

> A message should be generated from visible records and then logged back to visible records.

No ghost automation.

## 4. Minimal data model direction

The stripped-down MVP should bias toward a flexible operational record rather than many premature specialized tables.

Possible first model:

```txt
client
booking_request
participant
agenda_item
payment
staff_member
material_need
message_action
service_template
```

Where:

- `booking_request` can represent booking, lead, manual record, pending request, or cancellation.
- `agenda_item` can represent confirmed session, pending schedule task, rental pickup/return, accommodation block, or follow-up.
- `message_action` can represent draft, sent, failed, approved, skipped.
- `service_template` stays simple: name, category, price rule notes, default questions, default actions.

Do not over-normalize until repeated pain forces it.

## 5. Full CRUD without losing UX

Dave's requirement is important: Cris/Patri must control their data like a Google Sheet.

That does not mean the daily UI should feel like a spreadsheet.

Use two surfaces:

| Surface | User | Purpose |
|---|---|---|
| Cockpit | Manager/operator | Fast daily work, decisions, warnings |
| Admin data view | Owners/admin | Full CRUD, correction, audit, imports/exports |

If an automation creates or changes a record, the owner must be able to see and edit it.

## 6. "Almost videogame" UX principles

The UI can be ugly, but it cannot be confusing.

Principles:

1. **State is visual.** Pending, scheduled, paid, unpaid, missing info, needs message, instructor missing, material missing.
2. **Cards over forms for daily work.** Each operational item is a card with obvious next actions.
3. **One primary action per card.** Avoid seven equal buttons.
4. **Progression beats configuration.** Move a request through states instead of making the user understand modules.
5. **Fast manual override.** Owners can always edit the raw record.
6. **Changes glow.** Recently changed items should be visibly marked.
7. **Daily quests, not dashboards.** "These 6 things need attention" is better than metric soup.

## 7. Communication and reuse implementation options to investigate before building

Before installing anything, evaluate what already exists.

### 7.1 Reuse policy

Dave's constraint:

> Free/open-source/customizable is ideal. Avoid vendor lock-in. If a product is not usable directly, study the existing solution and copy/adapt the pattern into code we own.

Evaluation rule:

| Question | Required answer before adoption |
|---|---|
| Is it free/open-source or self-hostable? | Prefer yes; paid SaaS only as research/reference unless explicitly approved. |
| Can we customize or fork it? | Must be yes for core workflow surfaces. |
| Can we export/control our data? | Must be yes. No trapped operational data. |
| Does it replace boring infrastructure? | Good: admin CRUD, tables, notifications, calendar widgets. |
| Does it own the Tipiti UX? | Bad unless we can reshape it. The cockpit UX is ours. |

| Need | Build ourselves? | Investigate/reuse |
|---|---|---|
| Scheduled daily digests | No, mostly already Hermes/cron-shaped | Hermes cronjobs, n8n, lightweight worker |
| Internal owner/manager notifications | No custom app required first | Telegram bot, WhatsApp Cloud API, n8n |
| Customer WhatsApp messages | Avoid custom protocol work if possible | WhatsApp Business Cloud API, Twilio, Evolution API, Baileys only if acceptable/legal |
| Calendar-like scheduling | Maybe not first | FullCalendar UI, Cal.com concepts, Google Calendar sync/export |
| Admin CRUD | Do not hand-build everything if avoidable | SvelteKit tables/forms, NocoDB/Baserow/Appsmith/Directus as reference or temporary admin |
| Workflow automation | No heavy engine first | n8n, Trigger.dev, temporal-ish only later |

Decision rule:

> If an open-source tool can cover 80% of a boring operational layer without trapping us, reuse or copy the pattern. Build custom only where Tipiti's UX needs to feel native.

### 7.2 Auto-send and message reliability

Auto-send is allowed as a product direction, especially for customer-facing confirmations/reminders and instructor notifications.

But any message that expects a follow-up action — especially in groups/channels — must be strict and idempotent.

Reliability rules:

1. Every outbound message is created from a `message_action` record.
2. Every `message_action` has a stable idempotency key, so retrying cannot create duplicates.
3. States must be explicit: `draft`, `approved`, `queued`, `sent`, `failed`, `skipped`, `acted_on`.
4. Group/channel messages that include buttons or expected replies must target exactly one underlying action.
5. If the system cannot prove whether a message was sent/actioned, it must surface a warning instead of sending another copy silently.
6. Manual override always exists: owner can mark sent/skipped/failed and edit the source record.
7. Customer-facing auto-send can come before internal approval only for low-risk templates with clear source data: confirmation, map, reminder, instructor assignment.

Message mantra:

> Auto-send is good when it removes friction. It is bad when it creates duplicates, ambiguous actions, or invisible state.

## 8. First MVP cut

Build only enough to replace air/WhatsApp memory with controlled records and daily action.

### 8.1 Required

- Create/edit clients.
- Create/edit booking/request records from manual intake.
- Track status: missing info, pending schedule, scheduled, confirmed, completed, cancelled.
- Track service type and key fields: people, date, time preference, level, payment, notes.
- Today/tomorrow agenda.
- Pending schedule/follow-up queue.
- Instructor/material fields as simple assignments/notes first.
- Payment state: unpaid/paid/partial, method, amount.
- Message actions for confirmations, reminders, missing info, map links.
- Safe auto-send for low-risk customer/instructor notifications, backed by idempotency and visible logs.
- Full admin data view.

### 8.2 Useful but second

- Automatic WhatsApp ingestion.
- Instructor confirmation buttons.
- Inventory conflict detection.
- Calendar sync.
- Credit pack consumption logic.
- Accommodation season/deposit rule engine.

### 8.3 Later

- Customer portal.
- Full self-serve booking.
- Advanced multi-business SaaS config.
- Public product-pack marketplace.

## 9. How this changes current OBA sequencing

The previous sequence leaned toward fixing workflow architecture first.

This stripped-down lens changes priority:

1. Stop expanding service logic until we define the simple operational record surface.
2. Keep `classifyServiceWorkflow()` if it helps routing, but do not let it become the product center.
3. Build/shape the **Today + Requests + Full CRUD admin** loop before deep calendars/credits/inventory.
4. Use messages as a first-class operational output: draft/approve where needed, auto-send where safe, always log and dedupe.
5. Evaluate free/open-source/customizable reuse options before custom-building calendars/notification/admin layers.

## 10. Concrete next working session

Recommended next session:

1. Start a **separate stripped-down Tipiti cockpit spike** instead of trying to fit this into the current scattered OBA surface.
2. Treat existing production OBA data as a later migration/import problem, not as a constraint that blocks the clean product restart.
3. Pick the stack/reuse candidates: free/open-source, customizable, no vendor lock-in, code/data we can own.
4. Design the three records that must all feel excellent: surf class request, today's agenda, and payments.
5. Design the first `Today` card model with game-like state/progression.
6. Design the first `Request/Booking` editable record model with full owner override.
7. Define the first safe auto-send cases and idempotency/logging rules.
8. Then decide which current OBA concepts/code are worth copying back in.

## 11. Dave review decisions

Dave answered the open questions on 2026-07-23:

| Question | Decision |
|---|---|
| Current OBA Core vs separate spike? | **Separate spike/restart.** Current OBA is scattered; production data exists but should be handled later as migration/import. |
| Admin CRUD via OBA or external tool? | **Free/open-source/customizable only.** Avoid vendor lock-in. Direct use is good if adaptable; otherwise study/copy patterns into our own code. |
| Telegram internally, WhatsApp client-facing? | **Yes.** |
| Draft-only or auto-send? | **Auto-send can be good**, especially for customer-facing messages and instructor notifications, but any action-bearing group/channel message must be tight, reliable, and duplicate-safe. |
| First record that must feel perfect? | **All of them:** surf class request, today's agenda, and payments. |

## 12. Working product mantra

> If Cris/Patri cannot see it, edit it, trust it, and recover it manually, it is not part of the MVP.

> If a professor can receive one clear daily message instead of learning a new app, do that first.

> If a customer already lives in WhatsApp, do not force a portal until there is a reason.
