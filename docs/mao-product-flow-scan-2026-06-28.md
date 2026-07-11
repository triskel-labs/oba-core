# OBA Core — Product Flow Scan

Date: 2026-06-28
Branch: `fix/dev-baseline`
Repo: `/home/agent/core/repos/oba-core`

## 1. Current framing

OBA Core is correctly trying to be a generic operating system for outdoor/adventure businesses, with Tipiti Surf as the first proving ground.

The strongest architectural idea already present is the module system:

- `sessions`
- `roster`
- `editions`
- `inventory`
- `instructor`
- `credits`

That is the right direction. The problem is not that the data model has no concept for the work. The problem is that the UI and server flow still make owners think in implementation modules instead of business jobs.

## 2. Validation state

Commands run:

```bash
corepack pnpm check
corepack pnpm test:unit
corepack pnpm build
```

Results:

- `pnpm check`: passes with `0 errors`, `148 warnings`.
- `pnpm build`: passes.
- `pnpm test:unit`: fails 1 test:
  - `src/routes/auth/login/login.server.test.ts > redirects authenticated users to /calendar`
  - failure: test timeout at 5000ms.
  - 19 tests passed, 3 skipped, 1 failed.

Source size, excluding deps/build/generated-ish folders:

- Svelte: 58 files, 9,587 lines.
- TypeScript: 106 files, 8,905 lines.
- CSS: 1 file, 159 lines.

Largest handwritten source files:

- `src/lib/features/sessions/queries.ts` — 1,409 lines.
- `src/routes/(app)/calendar/+page.svelte` — 1,157 lines.
- `src/lib/components/services/ServiceForm.svelte` — 847 lines.
- `src/routes/(app)/bookings/[id]/+page.server.ts` — 776 lines.
- `src/lib/features/bookings/queries.ts` — 728 lines.
- `src/lib/modules/sessions/BookingDetailCard.svelte` — 602 lines.
- `src/routes/(app)/bookings/new/+page.svelte` — 478 lines.

## 3. Product model I would use

The app needs one stable business vocabulary:

| Concept | Meaning | UI owner mental model |
|---|---|---|
| Service | Sellable offer/template | “What do we sell?” |
| Edition | Dated occurrence of a service | “This camp/trip happens 13–18 July.” |
| Booking | Commercial contract/reservation | “This client bought/enrolled.” |
| Enrollment | One client inside a booking/roster | “Cris booked 3 people.” |
| Participant | Person doing the activity | “These are the actual surfers.” |
| Session | Operational delivery slot | “Monday 10:00 surf class.” |
| Inventory need | Required material, exact item maybe unknown | “Need 3 boards, sizes later.” |
| Allocation | Specific assigned item | “Board #12 assigned.” |
| Credit pack | Prepaid entitlement | “5-class bono bought, credits consumed later.” |

The user should not have to understand “modules”. Modules should remain the implementation engine. The UI should expose **service templates and workflows**.

## 4. Current implemented strengths

- Strong module-driven schema exists: `services.modules` JSONB.
- `service_editions` exists and calendar loads editions even before bookings via `listEditionsForDateRange()`.
- `sessions.ownerType` supports `booking`, `service`, and `edition` ownership.
- Booking detail is already moving to module cards:
  - `ClientsCard`
  - `SessionsCard`
  - `InstructorCard`
  - `InventoryCard`
  - `CreditsCard`
  - `PaymentCard`
- `booking_clients.participant_count`, `credit_source_id`, `credit_count`, and `price_override` exist.
- Inventory supports fuzzy allocations: item type + quantity, optional specific item later.
- Calendar and roster already count edition enrollment by participant count, not only client count.

## 5. Main weak spots / mismatches

### A. New booking server flow is ordered by module, not by business archetype

File: `src/routes/(app)/bookings/new/+page.server.ts`

Current logic checks inventory first:

```ts
if ('inventory' in (service.modules ?? {})) {
  ...
  return { bookingId: booking.id, message: 'Booking created — assign inventory from the booking detail' };
}
```

This catches every service with inventory, including camps/classes that also have `editions`, `sessions`, `roster`, and `instructor`.

That means a surf camp with inventory can bypass the edition/session/roster-specific flow. This is probably one of the reasons the app feels incoherent.

### B. Roster means two different things right now

For an edition service, roster means: clients enroll into a dated edition.

For a non-edition group class, roster seems to mean: multiple clients should join the same group slot/session.

But capacity counting for non-edition roster currently uses `countEnrolledClientsForService(serviceId)` — across the whole service, not a specific date/session. That makes sense for “total program capacity” but not for repeated group classes.

The app needs a clearer rule:

- `roster + editions`: roster belongs to edition.
- `roster + sessions` without editions: roster belongs to a service-owned session/slot.
- plain `sessions` without roster: booking owns its own private sessions.

### C. Sessions have three ownership models, but the UI does not make that obvious

File: `src/lib/features/sessions/queries.ts`

`resolveSessionContext()` already encodes this:

- edition service → edition sessions.
- roster service → service sessions for that date.
- otherwise → booking sessions.

That is smart, but the UI needs to teach this indirectly through workflows:

- private lesson: create booking → schedule its sessions in booking detail.
- group lesson: create/open group session → enroll clients into it.
- camp/trip: create edition → program edition sessions → enroll clients into edition.

### D. Booking session linkage is split / partly legacy

`bookings.session_id`, `sessions.booking_id`, and `booking_sessions` all exist.

Some code creates booking-owned sessions with `sessions.bookingId`; some booking list/payment code still checks `booking_sessions`. This can make session counts and recalculation inconsistent.

Example: `recalcBookingAmounts()` counts actual sessions via `bookingSessions`, then falls back to `sessionsIncluded`.

This needs one canonical rule.

### E. Service creation exposes internals too early

File: `src/lib/components/services/ServiceForm.svelte`

The module UI is powerful, but it asks the owner to compose internal primitives directly. Dave’s discomfort is valid: this is too close to the database.

The app needs a first step like:

> “What kind of thing are you selling?”

Then presets:

- Group class
- Private class
- Course/pack with N sessions
- Camp/trip with fixed dates
- Rental/equipment
- Accommodation
- Transfer/add-on
- Credit/bono

Each preset can still map to modules internally.

### F. Editions are too prominent in service editing

Already noted in `TODO.md`: when editions exist, “add edition” should not remain a dominant/default state. It should become a secondary action under the list of existing editions.

Correct default state: show current editions + occupancy + next operational action.

### G. Inventory requirement vs exact allocation is under-explained

The model supports type-level allocation, but the UX wording still mixes “included”, “quantity per booking”, “add-on”, and “assign exact item”.

The owner mental model should be:

1. This service usually requires these item types.
2. At booking/session time, reserve quantity needed.
3. At arrival, assign exact items/sizes if known.

## 6. Recommended product direction

Do not start with a visual redesign. First fix the operating grammar.

### Primary navigation should become

1. **Today / Agenda** — what needs attention now.
2. **Calendar** — operational schedule: sessions, editions, bookings, events.
3. **Bookings** — commercial records/payments/clients.
4. **Services** — catalog/templates/configuration.
5. **Clients**
6. **Inventory**
7. **Staff**

### Service detail should become an operating hub

For each service, show the next natural actions based on modules:

| Service archetype | Service detail primary actions |
|---|---|
| Private class | New booking, default duration/session count, instructors, inventory requirements |
| Group class | Upcoming group sessions, create session, enroll client, capacity |
| Camp/trip edition | Editions list, open roster, program sessions, enroll client |
| Rental/accommodation | Linked inventory/resource types, create booking/reservation |
| Credit/bono | Sell pack, compatible services, remaining-credit rules |

### New booking should become a smart wizard

Step order should be business-first:

1. Choose service/template.
2. If editions: choose edition and hide free date fields.
3. If group session: choose existing session/slot or create one.
4. Add client(s) + participant count.
5. Apply credits/price overrides if needed.
6. Notes + confirmation.

The current form is close, but the server branch order needs fixing and the UI needs stronger conditional semantics.

## 7. Highest-leverage next actions

1. Fix `bookings/new/+page.server.ts` so flow dispatch is by archetype/combination, not first matching module.
2. Define one table of archetypes/presets from modules, e.g. `classifyServiceWorkflow(service.modules)`.
3. Replace service creation module toggles as the first UI with preset cards; keep advanced module editing behind “Advanced”.
4. Make `roster + sessions` without editions session-centric, not service-global.
5. Make `roster + editions` edition-centric and ensure bookings always store `serviceEditionId`.
6. Make edition sessions canonical for camps/trips; do not create booking-owned duplicate sessions for edition bookings.
7. Decide whether `booking_sessions` is legacy or canonical; remove/stop using the other link path.
8. Improve calendar chips: show `Service + Client`, `X participants`, payment state, and material warning consistently from one shared component/data formatter.
9. Rework service detail editions section: existing editions first, add edition secondary.
10. Fix the lone unit test timeout so baseline is clean again.

## 8. Recommended next implementation session

Build a small domain layer first, not UI polish:

```ts
type ServiceWorkflow =
  | 'private_sessions'
  | 'group_session_roster'
  | 'edition_roster'
  | 'inventory_reservation'
  | 'credit_pack'
  | 'simple_booking';

function classifyServiceWorkflow(service: Service): ServiceWorkflow
```

Then use it in:

- `bookings/new/+page.svelte`
- `bookings/new/+page.server.ts`
- `services/[id]/+page.svelte`
- calendar chip formatting

This will make the UI feel coherent because every page will be speaking from the same product grammar.

## 9. Expert review addendum

After the first scan, I ran three parallel expert reviews: product/CEO workflow, domain/data-model architecture, and mobile-first UX. They converged on the same diagnosis.

### Consensus diagnosis

OBA Core is in the middle of a transition from older booking-scoped/session-junction behavior to the newer owner-scoped session model. The intended architecture is good, but important creation/counting/cancellation/pricing paths still use mixed semantics.

The product issue Dave is feeling is not vague taste. It comes from concrete inconsistencies:

1. **New booking flow treats modules as exclusive branches.** `inventory` currently catches services before `editions`/`sessions`/`roster`, so realistic services like surf camps can be routed as inventory-only bookings.
2. **Session ownership is documented but not fully enforced.** Intended rule: private sessions are booking-owned, group sessions are service-owned, camp/course sessions are edition-owned.
3. **`booking_sessions` is legacy but still used.** It remains in schema and drives counts/recalc/cancel/delete logic even though new sessions use direct owner FKs.
4. **Roster semantics are split.** Sometimes roster means clients inside one booking; sometimes it means independent bookings enrolled into a shared session/edition.
5. **Edition counts are not authoritative.** Some queries count exact `serviceEditionId`, others count by service/date overlap.
6. **Credits/bonos are modeled but not product-complete.** They may appear on calendar, and one query appears to compare a booking id to a service id.
7. **Inventory is additive, not a service type.** The UX and server flow should treat inventory as equipment/resource demand layered onto classes/camps/rentals, not the first branch.
8. **Service setup is module-first.** Owners need scenario-first setup: private lesson, group class, camp/trip, rental/accommodation, credit pack.

### Stronger implementation order

1. Add a shared workflow resolver/capability object:

```ts
type ServiceWorkflow =
  | 'private_session'
  | 'group_session_roster'
  | 'edition_roster'
  | 'inventory_reservation'
  | 'credit_pack'
  | 'simple_booking';
```

2. Refactor `bookings/new/+page.server.ts` around that resolver:

```txt
if editions:
  create enrollment into edition; do not create booking-owned sessions
else if roster + sessions:
  create enrollment; assign to service-owned session or leave unassigned
else if sessions:
  create booking-owned private sessions
else if inventory:
  create inventory/date reservation
else if credits:
  create credit-pack purchase
else:
  create simple booking
```

3. Remove or quarantine `booking_sessions` from runtime logic.
4. Make `serviceEditionId` the authoritative relation for edition enrollment; keep date-overlap only as migration/repair fallback.
5. Hide credit-pack purchases from calendar.
6. Standardize UI vocabulary:
   - Service = catalog item/template
   - Edition = dated run
   - Session = scheduled occurrence
   - Booking = commercial sale/enrollment
   - Enrollment = client row/payment line
   - Participant = person doing the activity
   - Attendance = session presence
7. Rebuild service setup as scenario-first with advanced module editing hidden behind disclosure.
8. Promote Today/Calendar as the operations cockpit, with services as the setup/catalog area.

### Product call

OBA Core should not present itself as just a booking app. It should be a **field operations cockpit**: bookings/enrollments feed sessions/editions, and the operator resolves today’s real constraints — people, time, instructors, equipment, money, and WhatsApp communication.
