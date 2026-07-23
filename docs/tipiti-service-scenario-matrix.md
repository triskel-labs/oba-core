# Tipiti Surf — Service & Edge-Case Scenario Matrix

Date: 2026-07-16  
Status: discovery draft from `secondBrain.md`  
Source: https://github.com/tipitisurf/templo-patrol-cratos/blob/main/secondBrain.md  
Relationship to product control: this document translates Tipiti's real operation into OBA workflow archetypes.

## 0. Purpose

Dave's product direction:

> Define all services, edge-case scenarios, and how the school actually operates first; adapt OBA logic to that operation; then tweak from real usage.

This is the correct next layer below `docs/product-control-strategy.md`.

- Product control says **which product grammar we use**.
- This scenario matrix says **how Tipiti actually behaves**.
- `docs/tipiti-operating-spec.md` expands this into detailed service-by-service rules before UI/code work.
- Coding tasks should use all three.

---

## 1. Service inventory from Tipiti second brain

| Tipiti service | Customer-facing description | OBA workflow archetype | Notes |
|---|---|---|---|
| Group surf class | Max 6 people, 2h, 35€/person, includes board+wetsuit+instructor+insurance | **Group class / shared session** | Shared capacity per class slot. Needs participant count, level, preferred date/time, later confirmed schedule. |
| Private surf class | 1–5 people, 1h30, 60€ total group | **Private lesson / private package** | Booking-owned session. Price is per group, not per participant. |
| 5 group-class bono | 150€ for 5 group classes | **Credit pack / bono sale** | Needs credit type = group surf class consumption. |
| 5 private-class bono | 270€ for 5 private classes | **Credit pack / bono sale** | Needs credit type = private surf class consumption. |
| Material rental | Wetsuit/table/both, half-day/day prices | **Rental / resource reservation** | Inventory/resource date/time reservation; exact item assignment can happen at pickup/check-in. |
| Surf House full house | Accommodation, seasonal rules, deposits, availability | **Accommodation / resource reservation** | Not fully represented by current archetypes; closest is rental/resource reservation + availability calendar + deposit rules. |
| Surf House room rental | Double room / bunk room, only available in certain season windows | **Accommodation / resource reservation** | Needs unit/resource type, check-in/out, nights, min-stay rules. |
| 5 nights + 5 surf classes pack | Group +3 people, minimum 5 days, 300€/person | **Composite package** | Combines accommodation reservation + class entitlements/sessions. Not a first simple workflow; needs staged model. |
| Collaborator surf trips | Sakiff, Rebelarte, Helena dates/links | **External run / blocked edition** | OBA should block dates and redirect/inform; may not own booking flow. |
| Yoga class | Group/private yoga with Larissa, price by WhatsApp | **Group class or private lesson** | Same scheduling/archetype engine; less inventory. |
| Airport transfer | SCQ/LCG transfer, solo vs 2+ pricing | **Transfer / add-on appointment** | Could be simple booking/add-on with date/time, pickup, passengers, price rule. |

---

## 2. Surf class flow

Source process: `4.1 Flujo de Reserva de Clases y Alquiler`.

### Intake questions

| Question | Data field / product meaning |
|---|---|
| “¿Has surfeado alguna vez?” | experience level / level note |
| “¿Cuántas personas sois?” | participant count |
| “¿Qué fecha os viene bien?” | desired date |
| “¿Horario preferido?” | time preference, not always final time |

### Timing rule

| Situation | Operational behavior | OBA state needed |
|---|---|---|
| Date is in less than 5 days | Confirm time directly | `confirmed_session_time` / normal scheduled booking |
| Date is more than 5 days away | Tell customer schedules will be sent closer to date because surf depends on tides/conditions | `pending_schedule_confirmation` / follow-up reminder |

### Confirmation/payment rules

| Rule | OBA implication |
|---|---|
| Surf classes confirmed without prepayment | Payment state can remain unpaid until day-of-service without warning as “bad”. |
| Payment on the day, preferably cash; card available; Bizum last option | Payment method preference is operational note, not hard validation. |
| No cancellation policy for surf classes/material rental | Do not overbuild cancellation penalties/refunds for MVP. |
| Send school Google Maps link on confirmation | WhatsApp/template action after confirmation. |
| If customer is not child/family, mention free post-class beer naturally | Optional communication template rule, not booking logic. |

---

## 3. Surf House flow

Source process: `4.2 Flujo Surf House (Alojamiento)`.

### Availability and season rules

| Rule | OBA implication |
|---|---|
| Check availability against reservation table | Needs accommodation availability calendar/resource reservations. |
| 1 June–25 August: minimum 5 nights, only full house | Date-dependent rule engine or at least operational warning. |
| From 15 September: nights/rooms available again | Date-dependent resource offering. |
| Assume full house unless customer specifies otherwise | Default intake option = full house. |
| For groups >3 and minimum 5 days, offer pack 5 nights + 5 classes = 300€/person | Cross-sell/composite package suggestion. |
| House is meant to combine with surf classes or rental | Intake should ask/record linked surf/rental interest. |
| 1 night: no deposit; more than 3 nights: 10% deposit | Deposit rule by nights. |
| Send Surf House Google Maps link on confirmation | WhatsApp/template action after confirmation. |

### Collaborator dates

| Collaborator | Dates | OBA behavior |
|---|---|---|
| Sakiff Studios | 6–11 Jul, 13–18 Jul | Mark dates occupied/external; redirect to Sakiff links. |
| Rebelarte | 3–8 Aug, 10–15 Aug | Mark dates occupied/external; redirect to Rebelarte link. |
| Helena | 17–22 Aug | Mark dates occupied/external; redirect to Tipiti/Helena landing. |

Important: these are not normal Tipiti-owned bookings. They behave like **blocked external runs** with customer-facing redirection.

---

## 4. Operational edge cases to represent

| Edge case | Product behavior needed | MVP priority |
|---|---|---:|
| Customer asks for surf class more than 5 days ahead | Create request/booking with unresolved session time and follow-up reminder | High |
| Group class has mixed levels | Record level per booking/participant note; instructor adapts class | Medium |
| Private class has 1–5 people but fixed group price | Support per-booking/group pricing separate from participant count | High |
| Group class max 6 people | Session-scoped capacity, not service-global capacity | High |
| Customer books rental, exact board/wetsuit unknown | Track inventory demand first; assign exact item at pickup/check-in | High |
| Customer wants accommodation during blocked collaborator dates | Explain external organizer and redirect; do not offer normal booking | High |
| Accommodation request violates min nights/full-house season rule | Show operator warning and suggested response | High |
| Group >3 and 5+ nights | Suggest package 5N + 5 classes | Medium |
| Customer asks yoga price | Mark price as “consult WhatsApp” / unresolved quote | Low/Medium |
| Transfer for solo vs 2+ | Passenger-count pricing rule | Low/Medium |
| Payment is unpaid before class day | Normal state, not urgent debt | High |

---

## 5. What this means for OBA logic

### Keep/approve from product-control strategy

- Group surf class = `group_session_roster`.
- Private surf class = `private_session`.
- Bonos = `credit_pack`, but later split sale vs consumption.
- Rental = `inventory_reservation`, but exact item assignment can be delayed.
- Surf House needs a resource/accommodation reservation capability; current inventory-only rental model may be too narrow.

### Required additions/refinements

1. **Pending schedule state** for surf classes requested more than 5 days in advance.
2. **Session-scoped group class capacity** with max 6 by default.
3. **Group-price private bookings** where participant count does not multiply base price.
4. **Inventory demand vs exact allocation** as two separate operational moments.
5. **Accommodation/resource reservation model** for Surf House if we include it in OBA MVP.
6. **External blocked run/date** concept for collaborator surf trips.
7. **Communication action templates** for confirmation links, maps, pending schedules, and redirects.

---

## 6. Open questions for Dave / Tipiti

These questions should be answered before building too much logic:

1. For group classes, do Patri/Cris create fixed class slots first, or do they collect people and then decide slots based on tides/weather?
2. When a customer asks for “mañana/tarde”, how granular is the real scheduling decision?
3. Does max 6 apply strictly per instructor, per class, or per slot with multiple instructors possible?
4. For private class of 1–5 people, is 60€ always total, or does it change at higher participant counts/seasons?
5. Do bonos get paid upfront always, and are they tracked by named person or by purchaser/family/group?
6. For rentals, do they reserve item type only, or do they care about size/category before arrival?
7. Should Surf House be part of OBA Core MVP now, or modeled later as a second vertical/resource workflow?
8. Are collaborator trips only informational redirects, or should Tipiti track leads/referrals for them?
9. Is WhatsApp the canonical booking channel for all workflows, or should web form/admin-created bookings be equal citizens?

---

## 7. Recommended next product session

Work with Dave through the real service scenarios in this order:

1. Group surf class.
2. Private surf class.
3. Bonos/credits.
4. Rental material.
5. Surf House accommodation.
6. Collaborator surf trips / blocked external dates.
7. Yoga and transfer as lower-priority add-ons.

For each service, define:

- intake questions;
- possible statuses;
- calendar surface;
- capacity rule;
- price rule;
- payment/deposit rule;
- inventory/staff needs;
- WhatsApp messages/actions;
- edge cases.
