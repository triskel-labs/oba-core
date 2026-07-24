# OBA Rescue Control Map — Tipiti

Date: 2026-07-23  
Status: council audit synthesis / implementation baseline  
Owner: Dave / Mao  
Repo: `/home/agent/core/repos/oba-core`

## 0. Verdict

Do **not** restart OBA from scratch.

Do **not** continue Tipiti Cockpit as a disconnected replacement app.

Use OBA as the **source of truth** and build the simplified cockpit as OBA's **Today / Attention / Action layer**.

```txt
OBA core records
→ derived attention cards
→ role-specific allowed actions
→ Telegram/WhatsApp/message outbox
→ action writes back to OBA
→ audit log / delivery state
```

The real problem is not that OBA lacks data. The problem is that important operational truth does not reliably reach the right person, at the right time, with the right safe action.

## 1. Feedback mapped to code reality

| Feedback | Audit verdict | Main paths |
|---|---|---|
| Nobody gets notified | True. Only manual WhatsApp links, staff invite email, and a polling API exist. No durable outbox/message log. | `src/routes/(app)/bookings/[id]/+page.svelte`, `src/lib/server/email/sender.ts`, `src/routes/api/v1/sessions/upcoming/+server.ts` |
| Manager/instructor roles are not tight | True. Roles exist, but capabilities are scattered and contradictory. | `src/lib/server/permissions.ts`, many `+page.server.ts` actions |
| Manager cannot mark paid | Explained. Server allows manager payment updates, UI hides financial card from manager. | `src/routes/(app)/bookings/[id]/+page.server.ts`, `src/lib/server/permissions.ts` |
| Navigation/back breaks flow | True. Back behavior is hardcoded/ad hoc: `/bookings`, `history.back()`, partial `?from=` use. | booking detail/new, sessions, services, roster routes |
| Month calendar UI is bad | Believable and structurally likely. Calendar page is too large and overloaded. | `src/routes/(app)/calendar/+page.svelte` |
| Services/statuses/participants/payments/rosters feel overcomplicated | True at surface level. Core abstractions are valuable, but internal complexity leaks into operator UX. | service workflow, booking/session/participant/payment/inventory files |

## 2. Product framing

OBA should become:

1. **System of record** — bookings, clients, sessions, rosters, payments, instructors, inventory, services.
2. **Today cockpit** — simple operational surface for what needs attention now.
3. **Notification/action layer** — Telegram/WhatsApp/manual message actions generated from records and logged back.
4. **Deep admin/detail layer** — OBA pages remain available when details need inspection or correction.

The cockpit belongs in OBA, likely under the existing Today/Agenda concept.

## 3. Immediate architecture decision

### Canonical ownership

| Data/behavior | Owner |
|---|---|
| Clients | OBA |
| Bookings/requests | OBA |
| Sessions/calendar records | OBA |
| Service setup | OBA |
| Instructors/staff | OBA |
| Payments | OBA |
| Inventory/material allocations | OBA |
| Camps/editions/rosters | OBA |
| Attention cards | Derived from OBA records |
| Snoozes/dismissals | OBA attention support tables |
| Notification queue/log | OBA message-action tables |
| Telegram/WhatsApp sending | transport workers that update OBA state |

### What not to do

- Do not duplicate clients/bookings/payments in a separate cockpit DB.
- Do not force workers into full OBA detail flows for simple actions.
- Do not add another generic module layer before the Today/action loop works.
- Do not make external automation own notification truth outside OBA.

## 4. First attention rules

These are query-derived from OBA records and filtered by role/capability.

| # | Rule | Who sees | Primary action |
|---:|---|---|---|
| 1 | New booking/request needs confirmation message | owner, manager | send/approve WhatsApp |
| 2 | Request missing required info | owner, manager | ask missing questions |
| 3 | Booking/session today or tomorrow lacks time | owner, manager | schedule |
| 4 | Scheduled session lacks instructor | owner, manager | assign instructor |
| 5 | Instructor assigned but not notified | owner, manager | send Telegram/WhatsApp |
| 6 | Client reminder due for next session | owner, manager | send reminder |
| 7 | Payment due today/past and unpaid | owner, manager | mark paid / remind |
| 8 | Inventory/material demand missing for today/tomorrow | manager, owner | prepare/assign material |
| 9 | Roster/capacity mismatch | owner, manager | open roster / resolve |
| 10 | Notification failed or needs approval | owner, manager | retry / manual send / skip |

Important Tipiti rules from Dave's PR comments:

- Shared group surf class clients should be told that other people may join the lesson/session.
- Group class capacity is session-scoped and can intentionally expand when a second instructor is assigned; do not silently split/duplicate the session.
- Unpaid future surf classes are not urgent debt, but unpaid classes after the scheduled time/date has passed become a severe Today warning/action.
- Beer/free extras should not be part of MVP messaging unless the owner explicitly enables it.
- Private class pricing must be reconfirmed; Dave's review suggests the old “60€ total group price” may be wrong and pricing may be per participant.
- Credit packs/bonos are second-layer: show/use them only when a client already has an associated bought pack; otherwise treat them as optional upsell, not first intake complexity.
- Auto-send is allowed for low-risk customer/instructor messages, but every action-bearing message needs idempotency, visible state, and duplicate protection.

## 5. Role/capability fixes

Replace broad scattered role checks with explicit capabilities.

Minimum capabilities:

```txt
view_today
view_calendar
view_own_sessions
view_all_sessions
view_bookings
create_booking
edit_booking_schedule
cancel_booking
view_clients
edit_clients
view_services
edit_services
view_inventory
manage_inventory_items
view_financial_reports
record_payment
edit_amount_due
view_staff
manage_staff
manage_admins
send_message_action
approve_message_action
snooze_attention_item
```

Near-term policy:

| Role | Should be able to do |
|---|---|
| Instructor | See own today/calendar/session details; receive notifications; confirm/acknowledge assignment later. No global clients/payments/services. |
| Manager | Run operations: bookings, sessions, rosters, inventory, mark/record payment, send routine messages. No service structure/admin/security. |
| Owner | Business setup, services/pricing, reports, staff visibility, all operational actions. Cannot accidentally create admins unless explicitly allowed. |
| Admin | System/user/security administration. |

Immediate bugs to fix:

1. Split `canSeeFinancials()` into:
   - `canViewFinancialReports()` — admin/owner.
   - `canRecordPayment()` — admin/owner/manager.
2. Payment status must be calculated from DB `amountDue`, not hidden form values.
3. Instructors should not see global pending revenue or all bookings/events/inventory on Today/Calendar.
4. Instructor nav should not link to routes they cannot load, or those routes must become filtered instructor views.
5. API routes need capability checks, not only auth/API key.

## 6. Notification/message layer

Add a first-class `message_actions` table in OBA.

Minimum fields:

```txt
id
source_type             -- booking/session/client/payment/inventory/etc
source_id
recipient_type          -- client/user/role/manual
recipient_id
recipient_label
channel                 -- telegram/whatsapp/email/manual
template_key
body
action_url
state                   -- draft/approved/queued/sent/failed/skipped/acted_on
due_at
approved_at
queued_at
sent_at
failed_at
acted_on_at
idempotency_key
created_by
created_at
updated_at
```

Optional but useful soon:

```txt
message_attempts
attention_snoozes
action_log
notification_preferences
```

Transport rule:

> Telegram/WhatsApp/n8n workers may send messages, but OBA owns message state and idempotency.

## 7. Today route insertion point

Likely files:

```txt
src/routes/(app)/agenda/+page.server.ts
src/routes/(app)/agenda/+page.svelte
```

But product name should probably become **Today** while keeping route compatibility if needed.

New feature files:

```txt
src/lib/features/attention/types.ts
src/lib/features/attention/rules.server.ts
src/lib/features/attention/actions.server.ts
src/lib/features/attention/capabilities.server.ts
src/lib/features/messages/schema/actions.ts      -- or in main schema first
src/lib/features/messages/actions.server.ts
```

Keep cards derived. Persist only action/message/snooze state.

## 8. First implementation slice

Build one vertical slice end to end:

```txt
OBA booking/payment record
→ Today card: payment due today / unpaid
→ manager sees card
→ manager clicks Mark paid
→ server verifies canRecordPayment
→ server loads amountDue from DB
→ updates booking_clients.amountPaid/paymentStatus
→ writes action_log
→ card disappears/updates
```

Then add message slice:

```txt
session tomorrow with client phone
→ message_action due
→ Today card: reminder pending
→ click Send WhatsApp/Telegram/manual
→ state logged sent/skipped/failed
```

## 9. Navigation rescue

Create one safe route context helper:

```txt
src/lib/navigation/from.ts
```

Rules:

- accept only internal paths;
- preserve query/hash;
- fallback per workflow;
- every deep link can carry `?from=`;
- no `history.back()` for operational flows.

Immediate fixes:

| Problem | Fix |
|---|---|
| booking detail back always `/bookings` | honor `?from=` fallback `/bookings` |
| booking new uses `history.back()` | explicit safe `from` |
| service links from booking creation lose flow | pass `from` or use modal/local action |
| session detail infers wrong origin | require all entry points to pass `from` |
| client detail `bookings/new?clientId=` ignored | preselect client in new booking load/form |

## 10. Domain simplification without reset

Keep:

- service workflow classifier;
- owner-scoped sessions: booking/service/edition;
- service editions/runs;
- booking enrollment model;
- named participants;
- fuzzy inventory demand/allocation.

Tighten:

- status semantics through derived attention states first;
- group class capacity must be session-scoped;
- camp/edition linkage should use exact `serviceEditionId` as canonical;
- participant sync must be handled by workflow-specific mutations;
- payment summary should be canonical at booking/enrollment level first;
- service modules belong behind presets/advanced UI.

Quarantine later:

- `booking_sessions` legacy table;
- old camp helper paths that imply many active clients per booking;
- `session_participants.paid` duplicate flag;
- date-overlap edition matching as normal runtime logic;
- raw service `type` as business logic.

## 11. Implementation order

### Phase 0 — Stop drift

- Freeze separate `tipiti-cockpit` as prototype/reference.
- Do not implement more standalone business logic there.
- Make OBA docs reflect: OBA source of truth + Today cockpit.

### Phase 1 — Permissions/payment safety

- Add capability helpers.
- Split financial visibility vs payment recording.
- Fix manager payment UI/action.
- Compute payment status from DB.
- Hide instructor financial/global business data.
- Add unit/server tests.

### Phase 2 — Today attention feed

- Create attention types/rules.
- Convert agenda/Today into cards by role.
- Start with payment, missing schedule, missing instructor, reminder due.
- Add snooze/dismiss support only if needed for noisy cards.

### Phase 3 — Message actions

- Add `message_actions` with Drizzle Kit migration/generation.
- Create first templates: client confirmation, client reminder, instructor assignment, owner digest.
- Manual send/log first; Telegram worker next.

### Phase 4 — Flow-preserving navigation

- Add safe `from` helper.
- Fix booking new/detail, service detail, session links, client-to-booking new.

### Phase 5 — Calendar redesign

- After Today/action loop works, redesign month calendar using Dave's proposed model.
- Calendar should show operational schedule, not be the primary attention engine.

### Phase 6 — Domain tightening

- Canonical workflow mutations.
- Capacity scope fixes.
- Participant sync repairs.
- Legacy linkage audits/backfills.

## 12. Non-negotiable rules for future coding

1. Every cockpit action must trace to an OBA source record.
2. Every external message must be logged back into OBA.
3. Every role-visible button must match a server-side capability.
4. No hidden form value may decide financial truth.
5. No new persistent business record should live only in a separate cockpit layer.
6. Use Drizzle Kit commands for schema generation/migrations.
7. Prefer Telegram/WhatsApp/manual channels over forcing every actor into app login.
8. Calendar polish waits behind notification/action correctness.
