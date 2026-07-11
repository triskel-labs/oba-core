# UI Full Unification Design

**Goal:** Complete visual and component consistency across the entire app — unified session card, full StatusBadge coverage, client-grouped participant display everywhere.

**Architecture:** Merge the two session card components into one; extend StatusBadge with role/tracking variants; augment the sessions query to return client groups; clean up all remaining inline badge/color maps.

**Tech Stack:** SvelteKit 2 + Svelte 5 runes, TypeScript, Tailwind CSS v4, Drizzle ORM + PostgreSQL

---

## Section 1: Unified SessionCard component

### File changes
- **Modify:** `src/lib/components/sessions/SessionCard.svelte` — full rewrite, absorbs SessionListCard
- **Delete:** `src/lib/components/sessions/SessionListCard.svelte`
- **Modify:** every consumer of SessionListCard (4 routes) to import SessionCard instead

### Visual design
Both modes share:
- Card frame: `rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden`
- Whole card is an `<a>` tag when `openHref` is provided — no separate "Abrir →" link
- Time block: neutral dark (`text-gray-900` bold), shows **start time + end time + duration** in all modes
- Status badge: `<StatusBadge>` in footer left — no inline spans
- Footer: badge left · Edit + Cancel text buttons right
- Client groups: subtle enclosure (`bg-gray-50 border border-gray-200 rounded-lg p-2`) per client, showing "First Last" name + link to `/bookings/[bookingId]` + participant chips/rows beneath

**`mode="list"`** (replaces SessionListCard):
- Layout: `color-bar (4px) | time-block (72px) | body | footer`
- Color bar left edge from `color.bg` (service color)
- Body: `Instructor: [name]` meta row; then one client-group box per `ClientGroup`; fall back to flat participant chips if no `clientGroups` provided
- Footer: `<StatusBadge>` left · Edit + Cancel right

**`mode="booking"`** (replaces old SessionCard):
- Layout: `left-panel (36%) | right-panel (flex-1) | footer`
- Left panel: date label + start time + end time + duration + instructor checkboxes (when `canEditInstructors`)
- Right panel: capacity counter + one client-group box per `ClientGroup`; current booking's group is blue-tinted (`bg-blue-50 border-blue-200`), other bookings dimmed (`opacity-75`)
- Each client group in booking mode shows participant rows with add/remove actions (when `canEditInstructors` and not cancelled)
- Footer: same as list mode

### Prop API

```typescript
interface ClientGroup {
  clientName: string;       // always "First Last", never "Last, First"
  bookingId?: string;       // enables link to /bookings/[id]
  isCurrentBooking?: boolean;
  participants: {
    id: string;
    name: string;
    bookingParticipantId?: string | null;
    inSession?: boolean;    // booking mode: true = enrolled, false = available to add
  }[];
}

interface SessionCardProps {
  session: Session;
  mode?: 'list' | 'booking';           // default: 'list'
  // list mode
  color?: ServiceColor;                // color bar
  openHref?: string;                   // card click target
  showDate?: boolean;                  // show date in time block
  hiddenFields?: Record<string, string>;
  updateAction?: string;
  cancelAction?: string;
  deleteAction?: string;
  // booking mode
  canEditInstructors?: boolean;        // enables instructor checkboxes
  participantPool?: BookingParticipant[];  // pool for add/remove actions
  bookingId?: string;
  bookingStatus?: string;
  capacity?: number | null;
  onLink?: (sessionId: string) => void; // modal mode
  // shared
  clientGroups?: ClientGroup[];
  participantNames?: string[];         // fallback if no clientGroups
  instructors?: Instructor[];
  children?: Snippet;                  // header context slot
  extraContent?: Snippet;              // kept for backward compat
}
```

### Consumer changes
| Route | Old import | New import + mode |
|---|---|---|
| `sessions/+page.svelte` | SessionListCard | SessionCard mode="list" |
| `services/[id]/sessions/+page.svelte` | SessionListCard | SessionCard mode="list" |
| `services/[id]/roster/+page.svelte` | SessionListCard | SessionCard mode="list" |
| `bookings/[id]/+page.svelte` | SessionCard (old) | SessionCard mode="booking" |

---

## Section 2: StatusBadge new variants

**File:** `src/lib/components/ui/StatusBadge.svelte`

Add to `StatusVariant` union and `COLORS`/`DEFAULT_LABELS` maps:

| Variant | Color classes | Spanish label | Used in |
|---|---|---|---|
| `admin` | `bg-red-100 text-red-700` | administrador | /staff |
| `owner` | `bg-blue-100 text-blue-700` | propietario | /staff |
| `manager` | `bg-purple-100 text-purple-700` | gestor | /staff |
| `instructor` | `bg-green-100 text-green-700` | instructor | /staff |
| `banned` | `bg-red-100 text-red-600` | bloqueado | /staff |
| `pool` | `bg-blue-100 text-blue-700` | piscina | /inventory |
| `specific` | `bg-emerald-100 text-emerald-700` | específico | /inventory |

No booking-type variants (camp/roster/private) — service name conveys this, no badge needed.

---

## Section 3: Sessions list query — client groups

**File:** `src/lib/features/sessions/queries.ts`

Three query functions in `src/lib/features/sessions/queries.ts` must return client groups per session:
- `listSessionsForDateRange` (used by `/sessions/+page.server.ts`)
- `listSessionsForService` (used by `/services/[id]/sessions/+page.server.ts`)
- `listSessionsForEdition` (used by both `/services/[id]/sessions/+page.server.ts` and `/services/[id]/roster/+page.server.ts`)

New join chain: `session_participants → booking_participants → booking_clients → clients`

New field added to session results:
```typescript
clientGroups: {
  clientName: string;   // client firstName + ' ' + lastName
  bookingId: string;
  participants: { id: string; name: string }[];
}[]
```

Walk-in participants (`bookingParticipantId IS NULL`) are excluded from clientGroups and remain as flat names only (shown as plain chips in the card).

The existing `participantNames` field is kept for backward compatibility.

---

## Section 4: Page cleanups

### `/staff/+page.svelte`
- Remove `ROLE_COLORS` map
- Add `StatusBadge` import
- Replace `<span class="rounded-full ... {ROLE_COLORS[r]}">` → `<StatusBadge variant={r} />`
- Replace banned span → `<StatusBadge variant="banned" />`

### `/inventory/+page.svelte`
- Add `StatusBadge` import
- Replace tracking mode span → `<StatusBadge variant={type.trackingMode} />`

### `/bookings/+page.svelte`
- Remove the booking-type badge (the `typeBadge`/`typeLabel` helper functions and their span)
- Service name already shown prominently; no replacement needed

### `/bookings/[id]/+page.svelte`
- Remove `statusColors` map
- Add `StatusBadge` import (if not already)
- Replace booking header status span → `<StatusBadge variant={data.booking.status} />`
- Replace any remaining payment badge spans → `<StatusBadge variant="paid|partial|pending" />`
