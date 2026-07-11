# Booking Detail Page Redesign

**Date:** 2026-06-20
**Scope:** `/bookings/[id]` page layout, data model cleanup, reusable `SessionCard` component

---

## Goal

Replace the current single-column stacked-card layout with a responsive grid that makes the booking contract, participants, sessions, and inventory clearly separated and independently actionable. Establish a clean data model where a booking = 1 client contract, participants belong to that client, and sessions + inventory reference those participants directly.

---

## Data Model Changes

### 1. Enforce 1 client per booking
Add unique constraint on `booking_clients(booking_id)`.

**Migration:** Query for any existing bookings with >1 active `booking_client`. For each, convert secondary clients into `booking_participants` under the first client, then delete the secondary `booking_client` rows.

### 2. Per-participant payment tracking
Add to `booking_participants`:
- `amount_paid` decimal (default 0)
- `payment_status` enum: `pending | partial | paid`

The `booking_clients` row remains the contract record (holds the total `amount_due`). Per-participant `amount_paid` values roll up into it.

### 3. Inventory allocations per participant
Add `booking_participant_id uuid REFERENCES booking_participants(id)` (nullable) to `inventory_allocations`. When set, the allocation belongs to that participant across all sessions of the booking.

### 4. New pricing mode
Add `per_session_per_participant` to `services.pricing_mode` enum.

Pricing formula: `active_sessions × active_participants × unit_price`

Recalc triggers: adding/removing a participant, adding/cancelling a session.

### 5. Per-session payment flag (optional, for fine-grained tracking)
Add `paid boolean DEFAULT false` to `session_participants`. Used when pricing mode is `per_session_per_participant` and the manager needs to track which specific session × participant combinations have been paid.

---

## Page Layout

### Mobile
Unchanged — single column, cards stacked vertically.

### Desktop (`md` breakpoint and above)
```
┌─────────────────────────────────────────────────────────┐
│  Header: ← Service name · status badge · booking ID    │
├──────────────┬──────────────────────────┬───────────────┤
│  Service     │  Client + Participants   │  Payment      │
│  (read-only) │                          │               │
├──────────────┴──────────────────────────┴───────────────┤
│  Sessions  (full width, 2-col card grid)                │
├─────────────────────────────────────────────────────────┤
│  Inventory  (full width, per-participant rows)           │
├─────────────────────────────────────────────────────────┤
│  Cancel booking  |  Delete booking                      │
└─────────────────────────────────────────────────────────┘
```

Top row grid: `grid-cols-[1fr_1.6fr_1fr]`

---

## Cards

### Service Card
- Read-only once a service is linked. Displays: color dot, service name, active module chips (Sessions, Roster, Instructor, Inventory, Credits).
- Footer note: "Read-only. Delete booking to change."
- Empty state (no service linked): shows a service search/picker input.

### Client Card
**Contract holder section:** Name, phone, email, contact action buttons (WhatsApp / email).

**Participants section:**
- List of `booking_participants` for this booking's `booking_client`.
- Each row: name, ✎ inline rename, ✕ remove.
- Remove action: inline warning if participant is in any sessions or has inventory allocated ("Removing will also remove from N sessions and unassign inventory"). Requires explicit confirm button.
- **Bulk add:** textarea (one name per line) + "Add all" button. On submit, creates participant rows and syncs them to all existing sessions of this booking.

### Payment Card
**Per-participant breakdown** (shown when pricing mode is `per_session_per_participant`; otherwise shows single client total):
- Each participant row: name | amount due | amount paid | status badge (paid / partial / pending).
- Tap ✎ to expand row: editable `amount_due` + `amount_paid` fields, Save / Cancel.
- Totals strip: Total due | Collected | Outstanding.
- Auto-recalc warning banner: shown when session or participant count has changed and price may be stale. "Recalculate" button triggers `recalcBookingAmounts`.

**Flat mode** (all other pricing modes): single row for the client, same edit/pay flow as current.

---

## Sessions Section

Full-width below the top row.

**Header:** "Sessions · N active" + `+ New session` button + `🔗 Link existing` button.

**Card grid:** `grid-cols-2` on desktop, `grid-cols-1` on mobile. Gap `gap-4` between cards.

### SessionCard Component

**File:** `src/lib/components/sessions/SessionCard.svelte`

Single source of truth for session card UI. Replaces current `BookingDetailCard.svelte` in the sessions module and the existing session list on `/sessions`.

**Props:**
```ts
{
  session: Session
  mode: 'booking' | 'service' | 'modal'
  participantPool?: BookingParticipant[]   // mode=booking: from this booking's client
  instructors: Instructor[]
  booking?: { id, status }                // mode=booking
  onLink?: (sessionId: string) => void    // mode=modal
}
```

**Left panel (~34%):** Background slightly off-white.
- Date (small, uppercase)
- Time (large, bold, brand green)
- Duration (muted)
- Instructor section: checkboxes for each instructor, conflict warnings inline.

**Right panel (~66%):**
- Participants header + count + capacity bar.
- **mode=booking:** Participants grouped by client contract.
  - Current booking's participants: blue left border, "this booking" label on group header, ✓/○ toggles to add/remove per session, "remove" action per participant.
  - Other bookings' participants: grey left border, muted text, labelled "other booking" — read-only (no add/remove).
- **mode=service:** Flat list of all session participants with names, no grouping.
- **mode=modal:** Same as service mode — shows who is already enrolled.

**Footer:** Status badge | Edit | Open → | Cancel.

---

## Session Picker Modal

**Component:** `src/lib/components/sessions/SessionPickerModal.svelte`

Triggered by "+ New session" or "🔗 Link existing" buttons on the booking detail page. Opens as an overlay — no navigation away.

**Structure:**
- Dark semi-transparent backdrop.
- Modal panel with header (title + close ✕) and tab bar (New session | Link existing).
- Session list sits on a grey background (`bg-gray-100`) so each card is a distinct white island.

**"Link existing" tab:**
- Lists upcoming sessions for this service ordered by date.
- Each card: header strip (date, time, instructors, X/Y count badge), enrolled clients + their participants as grouped chips, impact statement ("Adding Peter + 4 → 7/8"), Link CTA.
- **Full session:** amber `⚠ Full X/Y` badge in header. Amber warning box with exact overflow count. Secondary "Link anyway (override capacity)" button replaces the primary CTA.
- **Available session:** neutral grey count badge. Primary green "Link to this session" button.

**"New session" tab:**
- Form: date picker, time, duration.
- Instructor checkboxes with conflict detection (reuses existing conflict logic).
- On submit: creates session, links to booking, syncs booking's participants to the new session.

---

## Inventory Section

Full-width card below sessions.

Per-participant rows:
```
[Participant name]  [Item slot 1]  [Item slot 2 ...]  [+ item]
```

- Each slot shows: item name, specific item ID/number, status badge (ready / pending / out).
- Empty slot shows: dashed "+ assign [type]" placeholder — clicking opens item picker for that type.
- Items are linked to `booking_participant_id` on `inventory_allocations`.
- Service's `serviceInventoryLinks` defines which item types appear as columns.

---

## Removed / Moved

| What | Old location | New location |
|---|---|---|
| Standalone Instructor card | `BookingDetailCard.svelte` (instructor module) | Inside `SessionCard` left panel |
| Notes card | Always-visible card at top | Inline in the header meta strip — click "📝 Notes" to expand a textarea in-place |
| Multi-client enrollment add | `ClientsCard` | Removed. Multiple clients → separate bookings. Participants go in Client card. |

---

## Component Architecture

```
src/lib/components/sessions/
  SessionCard.svelte          ← new, single source of truth
  SessionPickerModal.svelte   ← new, wraps SessionCard in modal

src/lib/modules/sessions/
  BookingDetailCard.svelte    ← refactored to use SessionCard (mode=booking)

src/routes/(app)/services/[id]/sessions/
  +page.svelte                ← refactored to use SessionCard (mode=service)

src/routes/(app)/bookings/[id]/
  +page.svelte                ← new grid layout, new card arrangement
  +page.server.ts             ← new actions for per-participant payment, bulk-add participants
```

---

## Behaviour Rules

- **Removing a participant:** If participant has `session_participant` rows or inventory allocations — show inline warning with counts. Confirm required. On confirm: delete `session_participant` rows, null `booking_participant_id` on allocations, delete `booking_participant` row. Recalc pricing.
- **Adding participants (bulk):** Parse textarea by newline. Trim. Skip blanks. Create `booking_participant` rows. Sync all to existing sessions via `addParticipant`. Recalc pricing.
- **Session participant toggles:** Adding a participant to a session creates a `session_participant` row. Removing deletes it. No effect on booking-level participant list.
- **Capacity override:** Linking to a full session is allowed with explicit confirmation. No hard block — owner override is intentional.
- **Pricing recalc:** Triggered automatically on: participant add/remove, session add/cancel. Manual trigger also available ("Recalculate" button in Payment card).
- **Service card:** Only shown as picker when `booking.serviceId` is null. Otherwise read-only always.

---

## Out of Scope

- Redesign of `/sessions/[id]` detail page (separate spec if needed after this ships).
- Credits module redesign.
- WhatsApp confirmation banner (keep as-is).
- Editions / camp booking type (this spec targets group lesson + private lesson session types).
