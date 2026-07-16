# OBA Core — Product Control Strategy

Date: 2026-07-16  
Status: **approved working baseline** — must be checked before product/feature coding  
Owner: Dave / Mao  
Repo: `/home/agent/core/repos/oba-core`

## Approval note

Dave approved this as the working product-control baseline on 2026-07-16.

This is not frozen forever. It is the current source of product truth until Dave and Mao explicitly revise it.

Related operating-detail document:

- `docs/tipiti-service-scenario-matrix.md` — translates Tipiti's real services, processes, and edge cases from the second brain into OBA workflow logic.

## 0. Why this document exists

OBA Core has been pulled toward AI-coded architecture before the product grammar was fully under Dave's control.

This document is the guardrail.

Before any coding task, feature tweak, refactor, UI change, or data-model change, the implementer must check this document and answer:

1. Which product/workflow truth are we encoding?
2. Is the user seeing a business concept or an implementation module?
3. Is this part of the first product cockpit, or are we drifting into generic platform fantasy?
4. What must remain reversible until Dave explicitly approves it?

If a coding task contradicts this document, pause and update the product decision first.

---

## 1. Product thesis

OBA Core is not a generic booking app and not a visible module builder.

OBA Core is a **field operations cockpit** for small service/activity businesses where bookings, people, time, staff, inventory, payments, credits, and messages must become manageable day to day.

First proving ground: **Tipiti / surf and outdoor activity operations**.

Reusable direction: other service operators with similar operational patterns.

### Short version

> A business owner should not assemble modules.  
> A business owner should choose what they sell and then run the day.

---

## 2. Layer model

OBA needs three product layers. Most confusion comes from mixing them.

| Layer | What it means | Who should see it? | Example |
|---|---|---|---|
| **Product pack** | A sellable/marketable shape for a type of business | Customer / buyer | OBA Surf, OBA Tours, OBA Classes |
| **Workflow archetype** | How a service behaves operationally | Owner, through normal language | Private lesson, group class, camp/run, rental, credit pack |
| **Internal module/capability** | Reusable technical engine | Mostly hidden / advanced only | sessions, roster, editions, inventory, instructor, credits |

Rule:

> Product packs and workflow archetypes are the surface. Modules are the engine.

---

## 3. Current internal modules

Current module system in code:

| Module | Current meaning | Product-control verdict |
|---|---|---|
| `sessions` | Service involves scheduled delivery slots | Keep. Must be explained through lessons/classes/runs, not as a raw toggle. |
| `roster` | Multiple clients/participants can join shared capacity | Keep. Needs clearer scope: session roster vs edition roster. |
| `editions` | Fixed dated occurrence/run of a service | Keep. Better surfaced as run/camp/course edition. |
| `inventory` | Service needs or reserves material/resources | Keep. Treat as operational demand/resource layer, not always a service category. |
| `instructor` | Staff/guide required | Keep. Operational assignment capability. |
| `credits` | Prepaid entitlement/bono | Split conceptually: selling a credit pack vs consuming credits on another service. |

Important: these modules are useful. The mistake is showing them as the user's primary mental model.

---

## 4. User-facing product packs

We do **not** need to build every service category upfront.

We define product packs as packaging, not as separate engines.

| Product pack | Target user | Promise | Build now? |
|---|---|---|---|
| **OBA Surf / Activity School** | Surf schools, outdoor instructors, schools with lessons/camps/rentals | Run lessons, camps, students, instructors, gear, credits, reminders | **Yes — primary proving ground** |
| **OBA Tours / Runs** | Guides, excursions, adventure operators | Manage dated runs, guests, guides, capacity, gear | Later, shares edition/run engine |
| **OBA Classes / Workshops** | Yoga, workshops, coaching, group learning | Manage recurring classes, attendance, passes | Later, shares group-session engine |
| **OBA Rentals** | Gear/rental operators | Avoid double-booking equipment/resources | Later, shares inventory reservation engine |
| **OBA Tattoo Intake** | Tattoo artists/studios | Turn request chaos into quote/booking pipeline | Separate product pack, related but not first OBA Core cockpit |

Product-control rule:

> We can name future packs to avoid painting ourselves into a corner, but only OBA Surf/activity-school workflows should drive near-term implementation.

---

## 5. Workflow archetype matrix

This is the current working matrix. It should control feature decisions more than raw modules do.

| Archetype | Owner thinks | Booking action | Session owner | Enrollment scope | Capacity scope | Calendar surface | Typical modules |
|---|---|---|---|---|---|---|---|
| **Private lesson / private package** | “This client booked their own lesson(s)” | Create booking + booking-owned session(s) | `booking` | booking | booking/session | sessions | `sessions`, optional `instructor`, optional `inventory` |
| **Group class / shared session** | “People join this class slot” | Choose/create group session, then enroll client(s) | `service` | session | session | sessions | `roster`, `sessions`, optional `instructor`, optional `inventory` |
| **Camp / course / run / edition** | “This dated run has a roster and program” | Enroll booking/client into edition/run | `edition` | edition | edition | edition sessions | `editions`, `roster`, `sessions`, optional `instructor`, optional `inventory` |
| **Rental / resource reservation** | “This customer reserves gear/resource for a time/date” | Reserve inventory/date range | none/resource | booking | inventory/date | inventory reservations | `inventory` |
| **Credit pack / bono sale** | “This customer bought entitlement to use later” | Sell credit pack | none | none | none | none | `credits` |
| **Simple booking / admin record** | “We need a commercial record without operational scheduling” | Create booking record | none | booking | none | optional/none | no operational modules |

Decision pending:

- `credits` must not mean both “this service sells credits” and “this service accepts credits” forever.
- Group classes need session-scoped capacity and explicit session assignment; service-wide capacity is not enough.
- Edition/run linkage should become exact through `serviceEditionId`; date-overlap fallback should be repair/audit only.

---

## 6. Product grammar

These words are the canonical mental model until Dave revises them.

| Concept | Meaning | Owner-language example |
|---|---|---|
| **Service** | Sellable offer/template | “Beginner surf lesson”, “July surf camp”, “Board rental” |
| **Edition / Run** | Dated occurrence of a service | “Surf camp 13–18 July” |
| **Session** | Scheduled operational delivery slot | “Monday 10:00 lesson” |
| **Booking** | Commercial reservation/sale | “Cris booked 3 people” |
| **Enrollment** | Client/booking placed into a roster/session/edition | “Cris is enrolled in the July camp” |
| **Participant** | Person actually doing the activity | “The three surfers in Cris's booking” |
| **Attendance** | Presence/no-show per session | “Marta showed up, Pablo no-showed” |
| **Inventory demand** | Needed material/resource type/quantity | “Need 3 boards and 3 wetsuits” |
| **Inventory allocation** | Exact item assignment | “Board #12 assigned to Marta” |
| **Credit pack / bono** | Prepaid entitlement | “5 lessons remaining until September” |

Avoid using raw module names as primary UI copy unless inside an advanced/admin configuration area.

---

## 7. Surface navigation strategy

The app should feel like an operations cockpit, not like a database editor.

Recommended owner-facing navigation order:

1. **Today / Agenda** — what needs attention now.
2. **Calendar** — sessions, editions/runs, reservations, operational schedule.
3. **Bookings** — commercial records, clients, payments, enrollment state.
4. **Services** — catalog/templates/workflow setup.
5. **Clients** — people and history.
6. **Inventory** — item types, stock, assignments, warnings.
7. **Staff** — instructors/guides, assignments.
8. **Settings / Advanced** — modules, raw configuration, dangerous controls.

Services are not the daily cockpit. Services are setup/catalog.

---

## 8. Service creation strategy

Service creation should begin with business presets, not modules.

### First screen question

> What kind of thing are you selling?

### Presets to expose first

| Preset | Maps to workflow | Maps to modules |
|---|---|---|
| Private lesson | private lesson/package | `sessions`, optional `instructor`, optional `inventory` |
| Group class | group session roster | `roster`, `sessions`, optional `instructor`, optional `inventory` |
| Camp / course / run | edition roster | `editions`, `roster`, `sessions`, optional `instructor`, optional `inventory` |
| Rental / resource | inventory reservation | `inventory` |
| Credit pack / bono | credit pack sale | `credits` |
| Other/simple | simple booking | none / advanced choice |

### Advanced module editing

Modules can remain visible in an advanced panel for power users/admins, but they should not be the normal entry point.

Module editing should answer:

> “Fine-tune how this service behaves.”

Not:

> “Design your business as a set of implementation components.”

---

## 9. Day-to-day management strategy

After service creation, owners should manage operations through workflow surfaces.

| If service is... | Day-to-day surface should show... | Primary actions |
|---|---|---|
| Private lesson | upcoming private sessions, unscheduled bookings, assigned instructor, gear needs, payment state | schedule session, assign instructor, assign gear, mark attendance/payment |
| Group class | upcoming class slots, roster per slot, capacity, waiting/unassigned enrollments | create slot, enroll client, move enrollment, check attendance |
| Camp/run/edition | editions/runs, roster, program sessions, capacity, gear/staff gaps | open run, enroll client, program sessions, assign gear/staff |
| Rental | reservation calendar, resource availability, pick-up/return state | create reservation, assign item, mark returned |
| Credit pack | holder list, remaining credits, expiry, consumption history | sell pack, apply credit to booking/session |
| Simple booking | commercial records needing follow-up | edit status, payment, notes |

This is why raw modules do not feel natural later. They are ingredients; operations need tasks, statuses, rosters, and warnings.

---

## 10. Current code interpretation

As of this document:

- `services.modules` JSONB is the internal capability source.
- `src/lib/features/services/workflow.ts` introduces a `classifyServiceWorkflow()` layer on the current branch.
- `ServiceForm.svelte` already has quick-start presets, but still immediately exposes “Módulos del servicio” as a central visible section.
- Current presets are too narrow: `lesson`, `camp`, `rental`, `credits`, `other`.
- Missing/under-surfaced preset: **group class/shared session**.
- Booking/server logic is being moved toward workflow dispatch instead of first-matching modules.
- Current branch status from decision log is **YELLOW**: directionally right, not product-complete.

Product-control interpretation:

> The architecture is close enough to keep. The surface grammar is still too engineering-shaped.

---

## 11. Mandatory pre-coding checklist

Every new coding task must answer these before implementation:

- [ ] Which workflow archetype does this touch?
- [ ] Is the visible UI copy owner-language or module-language?
- [ ] Is this for OBA Surf/activity-school MVP, or future generic platform work?
- [ ] Does this change booking/enrollment/session/edition/credit/inventory semantics?
- [ ] If semantics change, has Dave approved the product truth?
- [ ] Is the change reversible without production data migration?
- [ ] What tests prove the workflow still works?
- [ ] What daily operator action becomes easier because of this?

If the last question has no strong answer, the feature is probably drift.

---

## 12. Engineering rules derived from product control

1. Use `classifyServiceWorkflow()` or equivalent workflow metadata before branching by raw module.
2. Do not let `inventory` override more specific workflows like camp/run or group class.
3. Keep session ownership consistent:
   - private lesson → booking-owned sessions;
   - group class → service-owned sessions;
   - camp/run/edition → edition-owned sessions.
4. Treat capacity by operational scope:
   - group class → session capacity;
   - camp/run → edition capacity;
   - rental → inventory/date capacity;
   - credit pack/simple booking → no operational capacity unless explicitly designed.
5. Keep `serviceEditionId` as the preferred exact relationship for edition enrollment.
6. Quarantine legacy date-overlap and `booking_sessions` behavior before removing anything.
7. Split credit concepts before deepening credit features:
   - credit pack sold;
   - credit consumption accepted by operational services.
8. Prefer one small tested domain helper over scattered `if (modules.x)` logic.

---

## 13. Near-term product sequence

Do not jump to more features before this sequence is under control.

1. Treat this document as the approved working product baseline.
2. Finish workflow classifier and tests.
3. Make booking creation route fully workflow-based.
4. Add/clarify service creation presets, especially group class.
5. Move raw modules into advanced configuration.
6. Fix group-session assignment and session-scoped capacity.
7. Fix participant/session sync for private, group, and edition flows.
8. Clarify credit-pack sale vs credit consumption.
9. Build the Today/Agenda cockpit around real operator warnings.
10. Only then expand product packs beyond OBA Surf/activity-school.

---

## 14. Agent handoff rule

Any AI coding agent working on OBA Core must receive this instruction before implementation:

```txt
Before coding, read docs/product-control-strategy.md.
Do not expose raw service modules as the primary user mental model.
Route product decisions through workflow archetypes: private lesson, group class, camp/run/edition, rental/resource reservation, credit pack, simple booking.
If a change modifies booking/enrollment/session/edition/credit/inventory semantics, stop and ask for product approval before implementing.
```

This rule exists to keep AI coding from silently turning architecture guesses into product law.

---

## 15. Dave review questions

These are the questions to settle together before deeper coding:

1. Do we call dated occurrences **editions**, **runs**, or both depending on vertical?
2. Should a group class booking be allowed without choosing a session, or should it go into an “unassigned enrollment” queue?
3. For surf schools, is inventory normally reserved at booking time, session time, or arrival/check-in time?
4. Should credits be sold as standalone services, or as payment/entitlement products separate from services?
5. Should “OBA Surf” be the first named product pack, or should the public wording stay “activity school cockpit” until validated?

Until answered, treat these as open product decisions, not engineering defaults.
