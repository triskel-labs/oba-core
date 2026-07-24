# OBA Core Service Workflow Refactor — CEO Decision Log

Date: 2026-07-13  
Branch: `feat/oba-workflow-archetype-sequence`

## Executive status

Assessment: **GREEN for Phase 1 foundation — workflow archetype metadata is now test-backed; YELLOW for full product completeness**.

This PR locks the first professional-team layer of the OBA product grammar:

> Service template → Workflow archetype → UI metadata → Edition/Run → Session → Booking/Enrollment → Participant → Attendance

It introduces a central service workflow classifier and exposes workflow metadata to the new-booking UI load data. That is the right first layer before more cockpit/actions work.

It is not yet a complete field-operations cockpit refactor. The current booking UI still consumes some raw module behavior, group-session assignment and session-scoped capacity are incomplete, and migration/backfill policy is still unresolved.

## CEO rule for this work

Engineering may continue on reversible, test-backed refactors.

Engineering must not silently finalize product semantics for:

- credit pack vs credit consumption behavior;
- group session assignment flow;
- session/date/edition capacity scope;
- inventory demand and reservation behavior;
- `booking_sessions` deprecation/removal policy;
- customer-facing vocabulary: booking/enrollment/run/session/attendance.

## Decisions currently encoded in the branch

| Decision | Current branch behavior | CEO status |
|---|---|---|
| Workflow classifier exists | Services are classified through `classifyServiceWorkflow()` | Directionally approved as architecture |
| Workflow metadata reaches UI load data | New-booking load returns `workflowByServiceId` | Phase 2 foundation, UI consumption still next |
| Credits precedence | Any service with `credits` becomes `credit_pack` | Needs CEO/product approval |
| Edition workflow | Any service with `editions` becomes `camp_course_run` and requires an edition/run | Needs CEO/product approval, likely right for camps/runs |
| Private sessions | `sessions` without roster creates booking-owned sessions | Likely approved |
| Group sessions | `roster + sessions` creates booking/enrollment without booking-owned sessions | Needs workflow/UI approval |
| Session ownership | private=`booking`, group=`service`, edition=`edition` | Directionally approved, migration-sensitive |
| Runtime `booking_sessions` | Removed from touched runtime paths | Needs migration/backfill plan before table removal |
| Credit packs calendar | `calendarSurface: none` | Needs CEO/product approval |
| Inventory-only | Treated as date/date-range reservation | Needs product refinement |

## Must-fix items found by council

### Fixed in branch

1. **Upcoming sessions API dropped multiple private sessions for the same booking.**
   - Cause: map keyed bookingId → single sessionId.
   - Fix: `_buildSessionBookingLinks()` emits one link per booking-owned session.
   - Regression test: `src/routes/api/v1/sessions/upcoming/links.test.ts`.

2. **Booking creation accepted an edition from another service.**
   - Cause: selected `serviceEditionId` was not checked against selected `serviceId`.
   - Fix: `_validateServiceEditionForService()` rejects cross-service editions.
   - Regression test: `src/routes/(app)/bookings/new/page.server.test.ts`.

### Still open followups

1. Booking UI still branches on raw modules instead of workflow metadata.
2. Group-session capacity is declared session-scoped but enforced service-wide.
3. Group-session assignment does not yet validate date/status/capacity or sync participants.
4. Edition enrollment does not sync participants into already-existing edition sessions.
5. Private booking-owned session creation does not yet sync booking participants into session participants.
6. Exact `serviceEditionId` vs date-overlap fallback is inconsistent across read models.
7. `booking_sessions` migration/backfill needs audit before any schema removal.
8. Inventory demand for camps/classes is not operationalized yet.

## Professional-team sequencing

A real product/engineering team would proceed in this order:

1. **Lock the workflow archetype matrix.**
   - Private lesson
   - Group class
   - Camp/course/run
   - Rental/equipment/accommodation
   - Credit pack
   - Simple booking

2. **Make workflow metadata available to UI.**
   - Stop teaching operators raw modules.
   - UI should ask operational questions: choose run, choose/create session, reserve inventory, sell credits.

3. **Fix participant/session synchronization.**
   - Booking-owned private sessions receive booking participants.
   - Edition sessions receive new edition enrollments.
   - Group session assignment syncs participants and validates capacity.

4. **Fix capacity semantics.**
   - Edition capacity = edition.
   - Group class capacity = session/date.
   - Private session capacity = booking/session.
   - Inventory capacity = resource/date.

5. **Quarantine legacy fallback.**
   - Exact `serviceEditionId` becomes canonical.
   - Overlap fallback moves to repair/audit mode, not normal runtime.

6. **Plan migration/backfill before removing tables.**
   - Audit old `booking_sessions` rows.
   - Backfill owner-scoped session fields.
   - Backfill exact edition links.
   - Backfill/sync session participants.

7. **Then build the operations cockpit.**
   - Today/agenda.
   - unresolved enrollments.
   - session/run roster.
   - payment/credit gaps.
   - instructor assignment gaps.
   - inventory demand warnings.
   - WhatsApp action state.

## Current verification

Commands run after council fixes:

```txt
corepack pnpm test:unit
# 11 passed | 1 skipped; 41 passed | 3 skipped

corepack pnpm check
# 0 errors; 153 existing warnings

corepack pnpm build
# passed

prettier --check changed files
# passed

eslint changed files
# passed

git diff --check
# passed
```

Global `pnpm lint` remains noisy because the repo has pre-existing Prettier warnings across many files. This branch formats and lints only changed files to avoid a formatting explosion.

## CEO decision pending

Before deeper UI/data changes, approve or revise this default product thesis:

| Archetype | Booking action | Session owner | Capacity scope | Calendar surface |
|---|---|---|---|---|
| Private lesson | create booking + private sessions | booking | booking/session | sessions |
| Group class | enroll into chosen/created group session | service | session | sessions |
| Camp/course/run | enroll into edition/run | edition | edition | edition sessions |
| Rental/equipment | reserve inventory/date | none/resource | inventory/date | inventory reservations |
| Credit pack | sell entitlement | none | none | none |
| Simple booking | create commercial record | none | none | optional/none |

Recommendation: approve this thesis as the working model, with one important caveat:

> `credits` should probably become two concepts: **credit pack sold as a service** and **credit consumption accepted by operational services**. Do not let one `credits` module mean both forever.
