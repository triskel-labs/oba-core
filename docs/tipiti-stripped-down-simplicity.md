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

## 7. Communication implementation options to investigate before building

Before installing anything, evaluate what already exists.

| Need | Build ourselves? | Investigate/reuse |
|---|---|---|
| Scheduled daily digests | No, mostly already Hermes/cron-shaped | Hermes cronjobs, n8n, lightweight worker |
| Internal owner/manager notifications | No custom app required first | Telegram bot, WhatsApp Cloud API, n8n |
| Customer WhatsApp messages | Avoid custom protocol work if possible | WhatsApp Business Cloud API, Twilio, Evolution API, Baileys only if acceptable |
| Calendar-like scheduling | Maybe not first | FullCalendar UI, Cal.com concepts, Google Calendar sync/export |
| Admin CRUD | Do not hand-build everything if avoidable | SvelteKit tables/forms, NocoDB/Baserow/Appsmith/Directus as reference or temporary admin |
| Workflow automation | No heavy engine first | n8n, Trigger.dev, temporal-ish only later |

Decision rule:

> If an open-source tool can cover 80% of a boring operational layer without trapping us, reuse or copy the pattern. Build custom only where Tipiti's UX needs to feel native.

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
- Draft message actions for confirmations, reminders, missing info, map links.
- Full admin data view.

### 8.2 Useful but second

- Automatic WhatsApp ingestion.
- Automatic outbound WhatsApp send.
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
4. Use messages as a first-class operational output, but keep send/approve/log explicit.
5. Evaluate reuse options before custom-building calendars/notification engines.

## 10. Concrete next working session

Recommended next session:

1. Audit current OBA screens against this simplicity MVP.
2. Decide whether to adapt current code or spike a stripped-down Tipiti cockpit route.
3. Design one `Today` card model from existing data.
4. Design one `Request/Booking` editable record model.
5. Decide communication channel for first internal notifications: Telegram first is probably easiest; WhatsApp for clients remains more sensitive.
6. Pick one reuse candidate to inspect for CRUD/admin/calendar instead of building blind.

## 11. Open decisions for Dave

These are the questions that actually matter now:

1. Should the stripped-down MVP be built inside current OBA Core, or as a separate Tipiti cockpit spike that can later merge back?
2. For Cris/Patri, is full CRUD best as an OBA admin screen, or would a tool like Baserow/NocoDB/Directus be acceptable behind the scenes if the cockpit is custom?
3. Is Telegram acceptable for internal owner/manager/instructor notifications, while WhatsApp remains client-facing?
4. Should first automation only draft messages for approval, or is auto-send acceptable for low-risk reminders?
5. What is the first record that must feel perfect: surf class request, today's agenda, or payments?

## 12. Working product mantra

> If Cris/Patri cannot see it, edit it, trust it, and recover it manually, it is not part of the MVP.

> If a professor can receive one clear daily message instead of learning a new app, do that first.

> If a customer already lives in WhatsApp, do not force a portal until there is a reason.
