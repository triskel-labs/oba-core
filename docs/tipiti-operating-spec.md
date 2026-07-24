# Tipiti Surf — Operating Spec for OBA

Date: 2026-07-16  
Status: first working product spec  
Sources:
- `secondBrain.md` from `tipitisurf/templo-patrol-cratos`
- `docs/product-control-strategy.md`
- `docs/tipiti-service-scenario-matrix.md`

## 0. Purpose

This document defines Tipiti's real services, edge cases, and operating rules before more UI/code is built.

It is intentionally operational, not architectural. The goal is to answer:

> “How does Patri/Cris actually run this?”

Then OBA logic adapts to that.

For every service we define:

- intake questions;
- possible statuses;
- calendar behavior;
- capacity rule;
- price rule;
- payment/deposit rule;
- staff/inventory needs;
- WhatsApp actions;
- edge cases.

---

## 1. Global operating assumptions

### 1.1 Booking channels

| Channel | Role |
|---|---|
| WhatsApp | Primary booking and customer conversation channel |
| Admin-created booking | Owner can create/adjust records manually after a conversation |
| Bot/intake automation | Should collect missing fields and notify Patri/Cris, not silently finalize uncertain cases |

### 1.2 Payment philosophy

| Service group | Payment behavior |
|---|---|
| Surf classes | Confirmed without prepayment; paid in person on service day |
| Material rental | Confirmed without prepayment; paid in person |
| Surf House | Deposit required depending on nights |
| Bonos | Assumed paid at sale; needs confirmation |
| Collaborator trips | External payment/booking; OBA should redirect or record referral only |

### 1.3 Scheduling philosophy

Surf scheduling is condition-dependent.

The app must support:

1. **confirmed schedule** — date/time known;
2. **pending schedule confirmation** — date known/preferred, exact time sent closer to date;
3. **unresolved request** — customer intent exists but required fields are missing.

This is non-negotiable for surf operations.

---

## 2. Service: Group surf class

### 2.1 Product definition

| Field | Value |
|---|---|
| Customer-facing name | Clase de surf en grupo |
| OBA archetype | Group class / shared session |
| Price | 35€ / person |
| Duration | 2 hours |
| Capacity | Max 6 people |
| Includes | Board, wetsuit, instructor, RC/accident insurance, optional photos/videos |
| Staff | Instructor required |
| Inventory | Board + wetsuit demand per participant |

### 2.2 Intake questions

| Required? | Question | Field |
|---|---|---|
| Yes | ¿Cuántas personas sois? | participant count |
| Yes | ¿Qué fecha os viene bien? | desired date |
| Yes | ¿Has surfeado alguna vez? | level / experience note |
| Useful | ¿Horario preferido: mañana, mediodía o tarde? | time preference |
| Optional | ¿Niños/familia? | communication/policy note |

### 2.3 Status model

| Status | Meaning | Owner action |
|---|---|---|
| `request_missing_info` | Customer has intent but required intake fields missing | Ask missing questions |
| `pending_schedule_confirmation` | Date is far enough away that exact surf time is not confirmed yet | Follow up closer to date |
| `scheduled` | Session date/time assigned | Prepare roster/inventory/staff |
| `confirmed` | Customer has accepted scheduled time | Send maps/info if not sent |
| `completed` | Class happened | Mark attendance/payment |
| `cancelled` | Customer/operator cancelled | No penalty logic for MVP |
| `no_show` | Customer did not attend | Operational history only |

### 2.4 Calendar behavior

| Case | Calendar surface |
|---|---|
| Exact time known | Show as group session/class slot |
| Exact time unknown | Show as pending scheduling item on desired date / agenda warning |
| Multiple bookings same slot | One class session with roster, not duplicate private sessions |

### 2.5 Capacity rule

- Capacity is **session-scoped**, not service-global.
- Default max: 6 participants per instructor in a group class session.
- Participant count matters more than booking count.
- If a second instructor joins the same class, owners think of it as the same session with two instructors; OBA should allow capacity to expand intentionally instead of silently creating duplicate sessions.

### 2.6 Price rule

```txt
price = participant_count * 35€
```

Potential future needs:

- manual discount;
- free/comped participant;
- credit-pack consumption.

### 2.7 Payment rule

- No prepayment required.
- Payment expected on class day.
- Preferred method: cash.
- Card available.
- Bizum only if customer asks.

OBA must not treat unpaid future group classes as urgent debt by default.

### 2.8 Staff/inventory needs

| Need | Rule |
|---|---|
| Instructor | Required |
| Board | Demand = participant count |
| Wetsuit | Demand = participant count |
| Exact gear assignment | Can happen at arrival/check-in, not necessarily booking time |

### 2.9 WhatsApp/actions

| Trigger | Action |
|---|---|
| Missing info | Ask intake questions naturally |
| Booking confirmed | Send school Google Maps link and, for shared group classes, make clear that other people may join the same lesson/session |
| More than 5 days away | Explain schedule will be confirmed closer to date due to sea/tides |
| Non-child/family customer | Do not mention beer/free extras by default; keep optional perks out of MVP messaging unless owner explicitly enables them |
| Day before / same day | Optional reminder with map/time/what to bring |

### 2.10 Edge cases

| Edge case | Desired behavior |
|---|---|
| Customer books >5 days ahead | Save request/booking as pending schedule; create follow-up task |
| Mixed skill levels | Record level notes; class can adapt |
| Group exceeds 6 people | Suggest split into multiple sessions or private/custom arrangement |
| Customer wants exact hour too early | Explain surf timing depends on conditions; collect preference |
| Weather/sea changes | Owner can reschedule session and notify customers |
| No payment once the class time/date has passed | Severe Today warning/action until payment is recorded, skipped with reason, or corrected |

---

## 3. Service: Private surf class

### 3.1 Product definition

| Field | Value |
|---|---|
| Customer-facing name | Clase de surf privada |
| OBA archetype | Private lesson / private package |
| Price | Needs Tipiti confirmation; Dave's review suggests pricing is per person/participant, so OBA must not hard-code the old “60€ total group” assumption |
| Duration | 1h30 |
| Capacity | 1–5 people |
| Includes | Board, wetsuit, instructor, RC/accident insurance, optional photos/videos |
| Staff | Instructor required |
| Inventory | Board + wetsuit demand per participant |

### 3.2 Intake questions

| Required? | Question | Field |
|---|---|---|
| Yes | ¿Cuántas personas sois? | participant count |
| Yes | ¿Qué fecha os viene bien? | desired date |
| Yes | ¿Has surfeado alguna vez? | level / experience note |
| Useful | ¿Horario preferido? | time preference |

### 3.3 Status model

Same as group class, but session is booking-owned:

- `request_missing_info`
- `pending_schedule_confirmation`
- `scheduled`
- `confirmed`
- `completed`
- `cancelled`
- `no_show`

### 3.4 Calendar behavior

- Private class creates its own booking-owned session.
- It should not join a shared class roster.
- Calendar chip should show client/group + participant count + private marker.

### 3.5 Capacity rule

- Participant count must be 1–5.
- Above 5 triggers owner review/custom arrangement.

### 3.6 Price rule

```txt
private_class_amount_due = owner/manager-confirmed price
```

Do not auto-calculate private surf class totals from the old 60€ group-price assumption until Tipiti confirms the current rule. Dave's review indicates it is likely per participant.

### 3.7 Payment rule

Same as surf classes:

- no prepayment;
- paid in person;
- cash preferred, card available, Bizum last option.

### 3.8 Staff/inventory needs

| Need | Rule |
|---|---|
| Instructor | Required |
| Board/wetsuit | Demand per participant |
| Exact gear | Assign later if needed |

### 3.9 Edge cases

| Edge case | Desired behavior |
|---|---|
| 5+ people | Ask whether to split/group class/custom; do not silently price wrong |
| Customer thinks price is per person | Confirm 60€ total group price |
| Customer wants privacy/specific instructor | Staff preference note |
| Booking >5 days ahead | Pending schedule confirmation |

---

## 4. Service: Bonos / credits

### 4.1 Product definition

| Bono | Price | OBA archetype |
|---|---:|---|
| 5 group classes | 150€ | Credit pack / bono sale |
| 5 private classes | 270€ | Credit pack / bono sale |

### 4.2 Product-control rule

Credits have two separate concepts:

1. **Credit pack sale** — customer buys entitlement.
2. **Credit consumption** — customer uses entitlement on a future operational service.

Do not let one raw `credits` module permanently mean both.

### 4.3 Intake / sales rule

Do **not** make credit packs a first-class booking-intake path in the first Today/action slice.

Dave's review: clients normally will not know/ask for this product directly. Treat bonos as:

1. owner/manager-sold credit packs;
2. upsell suggestions when the customer intent matches;
3. a payment/coverage option that appears only when the client already has an associated/bought credit pack.

| Required? | Question | Field |
|---|---|---|
| Yes, when selling pack | ¿Qué bono quiere? | credit pack type |
| Yes, when selling pack | ¿Para quién es el bono? | holder/client |
| Useful | ¿Cuándo quiere empezar a usarlo? | first intended use |
| Open | ¿Caduca? | validity policy |

### 4.4 Status model

| Status | Meaning |
|---|---|
| `draft_sale` | Pack discussed but not confirmed/paid |
| `active` | Pack bought and usable |
| `partially_used` | Some credits consumed |
| `used_up` | No credits remain |
| `expired` | Validity ended, if validity exists |
| `cancelled/refunded` | Manual admin state |

### 4.5 Calendar behavior

- Sale of a credit pack should not appear as an operational calendar event.
- Consumption appears through the actual class booking/session.

### 4.6 Price/payment rule

- Pack sale has flat price.
- Treat pack payment as upfront for now.
- If a pack is active/associated, booking payment should show credit coverage instead of normal unpaid debt.
- If a pack sale is expected but unpaid, create a Today warning/message action rather than silently treating the credits as usable.

### 4.7 Edge cases

| Edge case | Desired behavior |
|---|---|
| Bono bought by one person but used by family/group | Need holder vs participant policy |
| Customer books class with bono | Booking should show credit applied, not unpaid debt |
| Group/private credits mixed | Prevent wrong credit type consumption unless owner overrides |
| Expiry unclear | Keep validity optional until Tipiti confirms policy |

---

## 5. Service: Material rental

### 5.1 Product definition

| Material | Half day | Full day |
|---|---:|---:|
| Wetsuit | 10€ | 15€ |
| Board | 15€ | 25€ |
| Board + wetsuit | 20€ | 35€ |

OBA archetype: rental / resource reservation.

### 5.2 Intake questions

| Required? | Question | Field |
|---|---|---|
| Yes | ¿Qué material necesitas? | board/wetsuit/both |
| Yes | ¿Medio día o día completo? | rental duration |
| Yes | ¿Qué fecha? | rental date |
| Useful | ¿Cuántas personas/unidades? | quantity |
| Useful | Nivel/talla/medida | size/type note |

### 5.3 Status model

| Status | Meaning |
|---|---|
| `requested` | Customer asks but missing detail |
| `reserved` | Item type/quantity/date reserved |
| `picked_up` | Customer has material |
| `returned` | Material returned |
| `cancelled` | Cancelled |
| `issue` | Lost/damaged/late return |

### 5.4 Calendar behavior

- Show reservation on resource/rental calendar.
- If exact item is unknown, show item type demand.
- Exact item assignment can happen at pickup.

### 5.5 Capacity/inventory rule

- Track type-level demand first: board, wetsuit, both.
- Exact allocation later: specific board/wetsuit.
- Need avoid overbooking available inventory by date/duration.

### 5.6 Payment rule

- No prepayment required from second brain.
- Paid in person; cash preferred, card available, Bizum last option.

### 5.7 WhatsApp/actions

| Trigger | Action |
|---|---|
| Rental pricing request | Send pricing image if available; fallback to table |
| Reservation confirmed | Send school Google Maps link |
| Customer not child/family | Mention post-rental beer naturally |

### 5.8 Edge cases

| Edge case | Desired behavior |
|---|---|
| Customer asks for exact board type/size | Record preference; owner confirms availability |
| Customer keeps item late | Mark issue/late return |
| Rental overlaps class inventory demand | Show inventory warning, not silent conflict |
| Price image unavailable | Use fallback table |

---

## 6. Service: Surf House accommodation

### 6.1 Product definition

| Option | Price/night |
|---|---:|
| Full house | 90€ |
| Double room | 65€ |
| Bunk room | 70€ |

OBA archetype: accommodation/resource reservation. This is adjacent to inventory reservation but has different rules: nights, check-in/out, unit availability, deposits, min stay.

### 6.2 Intake questions

| Required? | Question | Field |
|---|---|---|
| Yes | ¿Qué fechas necesitáis? | check-in/check-out |
| Yes | ¿Cuántas personas sois? | guest count |
| Defaulted | ¿Casa completa o habitación? | resource option; assume full house unless specified |
| Yes-ish | ¿Queréis combinar con clases o alquiler? | linked surf/rental interest |

### 6.3 Status model

| Status | Meaning |
|---|---|
| `availability_request` | Customer asks dates; availability not confirmed |
| `available_pending_customer` | Free dates found; waiting customer decision/details |
| `deposit_pending` | Reservation agreed but deposit needed |
| `confirmed` | Reservation confirmed |
| `occupied_external` | Blocked by collaborator/external trip |
| `cancelled` | Cancelled |

### 6.4 Calendar behavior

- Show as multi-day accommodation reservation/block.
- External collaborator dates should appear as occupied/blocked, not normal bookable availability.

### 6.5 Availability and season rules

| Rule | Behavior |
|---|---|
| 1 Jun–25 Aug | Minimum 5 nights, full house only |
| From 15 Sept onward | Nights/rooms available again |
| Customer unspecified option | Assume full house |
| Group >3 and min 5 days | Offer 5 nights + 5 classes pack |
| House is surf-oriented | Ask/link to surf classes or rental naturally |

### 6.6 Deposit/payment rule

| Situation | Deposit |
|---|---|
| 1 night | No deposit |
| More than 3 nights | 10% of total stay |

Open question: what happens for exactly 2–3 nights?

### 6.7 WhatsApp/actions

| Trigger | Action |
|---|---|
| Confirmed accommodation | Send Surf House Google Maps link |
| Dates blocked by collaborator | Explain external trip and send relevant link |
| Customer asks in restricted season for short stay/room | Explain minimum/full-house rule naturally |

### 6.8 Edge cases

| Edge case | Desired behavior |
|---|---|
| Dates overlap collaborator trip | Redirect; do not offer normal booking |
| Dates violate min stay | Show warning and suggested reply |
| Customer wants only accommodation | Mention surf-house concept naturally; ask about classes/rental |
| Group qualifies for pack | Suggest pack automatically |
| Deposit rule ambiguous for 2–3 nights | Ask owner / flag manual review |

---

## 7. Service: Collaborator surf trips / blocked dates

### 7.1 Product definition

These are not normal Tipiti-managed bookings.

| Collaborator | Dates | Behavior |
|---|---|---|
| Sakiff Studios | 6–11 July, 13–18 July | Redirect to Sakiff links |
| Rebelarte | 3–8 Aug, 10–15 Aug | Redirect to Rebelarte link |
| Helena | 17–22 Aug | Redirect to Tipiti/Helena landing |

### 7.2 OBA archetype

External blocked run / blocked edition.

### 7.3 Calendar behavior

- Dates are occupied/blocked.
- Show external organizer and link.
- Do not treat as normal available Surf House inventory.

### 7.4 Status model

| Status | Meaning |
|---|---|
| `external_block_confirmed` | Dates blocked by external/collab trip |
| `lead_redirected` | Customer was redirected to organizer |
| `manual_followup` | Owner needs to answer special case |

### 7.5 Edge cases

| Edge case | Desired behavior |
|---|---|
| Customer wants those dates | Send relevant collaborator info/link |
| Customer wants adjacent dates | Check normal availability around block |
| Customer asks Tipiti to book it | Explain organizer handles booking unless Tipiti says otherwise |

---

## 8. Service: Yoga

### 8.1 Product definition

| Yoga service | Notes |
|---|---|
| Group class | 2–4 people, approx 1h15 |
| Group bono | From 5 people, approx 1h15 |
| Private class | Individual, approx 1h15 |
| Teacher | Larissa |
| Price | Consult directly by WhatsApp |

### 8.2 OBA archetype

- Group yoga: group class / shared session.
- Private yoga: private lesson.
- Price unresolved/manual quote.

### 8.3 Intake questions

| Required? | Question | Field |
|---|---|---|
| Yes | ¿Cuántas personas sois? | participant count |
| Yes | ¿Qué fecha/hora os viene bien? | schedule preference |
| Useful | ¿Grupo o privada? | service type |

### 8.4 Status/calendar/payment

- Show on calendar as class/session if scheduled.
- Staff = Larissa.
- Payment/pricing = manual quote until Tipiti gives fixed rules.

### 8.5 Edge cases

| Edge case | Desired behavior |
|---|---|
| Customer asks price | Mark price as consult/manual response |
| Group over 4 / bono from 5 | Suggest bono/manual review |
| Weather/location issue | Manual reschedule |

---

## 9. Service: Airport transfer

### 9.1 Product definition

| Scenario | Price |
|---|---:|
| Solo traveler | 50€ |
| 2+ people | 35€ / person |

Airports:

- Santiago de Compostela — recommended, approx 1h30;
- A Coruña — approx 1h30.

### 9.2 OBA archetype

Transfer / add-on appointment.

### 9.3 Intake questions

| Required? | Question | Field |
|---|---|---|
| Yes | ¿Desde qué aeropuerto? | pickup location |
| Yes | ¿Fecha y hora de llegada? | pickup datetime |
| Yes | ¿Cuántas personas? | passenger count |
| Useful | Número de vuelo | flight note |
| Useful | Destination: school/Surf House | dropoff |

### 9.4 Status/calendar/payment

| Status | Meaning |
|---|---|
| `requested` | Missing details |
| `scheduled` | Pickup scheduled |
| `completed` | Transfer done |
| `cancelled` | Cancelled |

Calendar: show as appointment/transfer with pickup time.

Price rule:

```txt
if passengers == 1: price = 50€
else: price = passengers * 35€
```

### 9.5 Edge cases

| Edge case | Desired behavior |
|---|---|
| Flight delayed | Manual adjust / note |
| Unknown airport/time | Request missing info |
| Customer chooses no transfer | Provide train/bus to Cee + taxi info |

---

## 10. Cross-service operational warnings OBA should eventually surface

| Warning | Why it matters |
|---|---|
| Pending schedule confirmations | Surf timing depends on conditions; owner must follow up |
| Session over capacity | Group class max 6 |
| Missing instructor | Surf/yoga sessions need staff assignment |
| Inventory demand conflict | Classes and rentals both consume boards/wetsuits |
| Unpaid day-of-service | Useful for checkout, not urgent before service day |
| Accommodation min-stay violation | Prevent wrong promises |
| External blocked date overlap | Prevent offering occupied collaborator dates |
| Deposit pending | Accommodation may need 10% deposit |
| Credit balance mismatch | Avoid charging customer when bono covers class |

---

## 11. Open questions to resolve with Dave / Tipiti

1. Do group class slots exist before bookings, or are they formed from requests closer to the date?
2. Does max 6 mean per instructor, or absolute per class slot?
3. What is the exact private class price behavior for 2–5 people: always 60€ total?
4. Are bonos personal, family/group-shareable, or owner-flexible?
5. Do bonos expire?
6. For material rental, do they need size/type during booking or only at pickup?
7. For Surf House deposits, what happens for 2–3 nights?
8. Should OBA MVP include Surf House now, or keep it in a later accommodation module?
9. Should collaborator trip leads be tracked in OBA or simply redirected?
10. Which WhatsApp messages should be semi-automated first: maps, pending schedule, reminders, payment, redirects?
