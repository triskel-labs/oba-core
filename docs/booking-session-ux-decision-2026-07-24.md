# Booking creation vs session scheduling UX decision

Date: 2026-07-24
Status: proposed decision surface before implementation
Scope: `/bookings/new`, private lessons, group classes, camps/runs, rentals/accommodation

## 1. Product truth

A booking is not always a calendar event.

```txt
Booking = commercial/enrollment intent
Session = actual calendar occurrence
```

OBA currently mixes these concepts in the new-booking flow because many real-world requests arrive as “I want a class tomorrow / maybe Monday.” That phrase contains both:

1. a business intent: customer wants to book/pay/enroll;
2. one or more possible session dates: when the activity may actually happen.

Those should not always collapse into `booking.date`.

## 2. UX principle

Mobile-first operator UX should ask operational questions, not expose internal metadata.

The new-booking screen should help the manager quickly answer:

- What service is being sold?
- Who is the customer / participant?
- Is the real calendar session known now?
- If yes, is it a new private session or an existing group session?
- If no, should OBA keep the booking as unscheduled follow-up?

## 3. Proposed mental model

| Concept | Meaning | Owns dates? |
|---|---|---|
| Booking | Sale/request/enrollment record | Sometimes only an anchor/request date |
| Session | Calendar occurrence where people attend | Yes |
| Edition/run | A camp/course instance with many sessions | Yes, via run start/end + sessions |
| Rental/accommodation booking | Resource reservation | Yes, check-in/out or date range |

## 4. Workflow-specific create UX

### Private lesson

Private lesson creation should support two paths:

1. **Create unscheduled booking**
   - Customer wants a private lesson but date/time is not locked.
   - Booking is created with sessions included, but sessions stay unscheduled.
   - Follow-up happens from booking detail / Today cockpit.

2. **Schedule during creation**
   - Operator already knows one or more dates.
   - UI allows adding one or multiple session rows:
     - date;
     - optional time;
     - optional instructor;
     - optional duration override.
   - OBA creates one booking-owned session per row.
   - Booking participants sync into those sessions.

Default recommendation: show this as a simple mobile-first choice after service selection:

```txt
When is the lesson?
[ Decide later ] [ Pick date(s) now ]
```

If `Pick date(s) now`, reveal repeatable session date rows. Do not force a full calendar widget until needed.

### Group class

Group class creation should support three paths:

1. **Join existing session**
   - Operator picks a service/date and then an existing session card.
   - Capacity is checked against that session.
   - Booking participants sync into the selected session.

2. **Create new group session**
   - Operator creates a service-owned session on a date/time.
   - Booking is attached to that session.
   - Capacity is checked against the new session.

3. **Leave unassigned**
   - Customer wants the class but exact session is not decided.
   - Booking remains unresolved until assigned later.
   - This should surface in Today/Attention later.

Default recommendation:

```txt
Which class are they joining?
[ Existing class ] [ New class ] [ Decide later ]
```

### Camp/course/run

A camp/course booking should choose a run/edition, not arbitrary booking dates.

- Date range comes from the edition.
- Capacity is edition-level.
- Participants sync into edition sessions.

### Rental/accommodation

For rental/accommodation, date belongs directly to the booking/resource reservation.

- Single-day rental: `date`.
- Multi-day/accommodation: `date` + `dateEnd`.
- Capacity/resource availability is checked against the resource/date range.

## 5. Data implications

### Keep

- `bookings.date` can remain as an anchor for now, because existing screens likely expect it.
- Session truth should live in `sessions` when service uses sessions.
- Edition truth should live in `serviceEditions` + edition-owned sessions.

### Change behavior gradually

For private lessons:

- If unscheduled: create booking + unscheduled booking-owned sessions.
- If scheduled: create booking + dated booking-owned sessions.
- Do not treat hidden `today` as meaningful business date.

For group classes:

- If assigned: set `bookings.sessionId` to the service-owned session.
- If unassigned: leave `bookings.sessionId = null` and surface as unresolved.

## 6. Next implementation slice

Smallest useful PR after this decision:

### Slice A — private lesson scheduling choice

Update `/bookings/new` for services with `sessions` but no `roster`/`editions`:

- add a mobile-first choice:
  - `Decidir fecha luego`;
  - `Programar ahora`;
- when `Programar ahora`, allow repeatable simple session rows using native inputs first:
  - date;
  - time optional;
- server action creates sessions from submitted rows instead of always creating unscheduled sessions anchored to hidden today;
- participant/session sync can be merged after this because the trigger point is clearer.

Use existing project Svelte/Tailwind style first. Check Bits UI / shadcn-svelte only if native inputs become a UX blocker.

### Then

1. Group class assignment choice + capacity check.
2. Rebase/adapt PR #9 participant sync onto the clearer private scheduling flow.
3. Capacity semantics by workflow type.

## 7. Open questions for Dave review

1. For private lessons, should the default button be `Decidir fecha luego` or `Programar ahora`?
2. When scheduling multiple private session dates during creation, do we need times immediately or just dates first?
3. Should unassigned group-class bookings be allowed in normal flow, or only via an “I don’t know yet” escape hatch?
4. Should booking list cards show “unscheduled” more prominently for session-based services?
