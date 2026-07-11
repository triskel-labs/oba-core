# UI Design System + Page Rebuilds

**Date:** 2026-06-23
**Branch:** feat/booking-detail-redesign
**North star:** `/bookings/[id]` — the reference page. All patterns derive from it.
**Goal:** Extract the booking detail card vocabulary into reusable components. Apply those components across every page that touches client/participant/session data. One design language, DRY, mobile-first.

---

## Problem

The domain chain **Service → Booking → Client → Participants → Sessions** is fully assembled only on `/bookings/[id]`. Everywhere else:

- `/sessions/[id]` shows participants but without booking context — no "who brought this person?"
- `/clients/[id]` shows a booking history list but no payment overview, no session timeline
- List pages are inconsistent — same data (status, payment, participants) rendered differently on each page
- Navigation between related entities is broken or missing

Three failure modes: missing info, visual inconsistency, dead navigation links.

---

## Design Decisions

### Card Shell
All cards share **one neutral style**: white background, `border border-border`, subtle `shadow-sm`, `rounded-(--radius-card)`. Section labels use a small icon (Lucide) + uppercase text. **No colored backgrounds per card type.** Color lives only in status badges and service color dots.

### Status Badges
Single `StatusBadge` component covers all status types. Consistent pill shape everywhere.

| Variant | Color |
|---|---|
| confirmed | green |
| pending | amber |
| cancelled | red |
| paid | green |
| partial | amber |
| unpaid | gray |
| active (session) | blue |
| beginner | blue |
| intermediate | amber |
| advanced | green |

### Layout — Adaptive Grid Per Page

Same design vocabulary, optimal grid per context:

| Page | Grid |
|---|---|
| `/bookings/[id]` | 3-col: `[1fr_1.6fr_1fr]` — service · client+participants · payment. Keep as-is (reference). |
| `/sessions/[id]` | Sidebar+main: `[280px_1fr]` — session info+payment left, participants right. |
| `/clients/[id]` | Sidebar+main: `[240px_1fr]` — client info+payment left, bookings+timeline right. |
| All detail pages | Mobile: `grid-cols-1`, sidebar content first (natural reading order). |

Full-width sections always appear **below** the grid (sessions section, module cards, timeline).

### Participants on Session Detail
Participants grouped by booking (EnrollmentGroup pattern). Each group: client name header + "ver reserva →" link + nested participant rows with payment badge. Not a flat list.

---

## Components

### New components

**`src/lib/components/ui/CardShell.svelte`**
Props: `label: string`, `icon?: ComponentType` (Lucide), `class?: string`
Slots: default (body), `footer` (optional)
Replaces: all inline `rounded-(--radius-card) border ... p-4` card patterns

**`src/lib/components/ui/StatusBadge.svelte`**
Props: `variant: 'confirmed'|'pending'|'cancelled'|'paid'|'partial'|'unpaid'|'active'|'beginner'|'intermediate'|'advanced'`, `class?: string`
Replaces: all inline status pill spans scattered across pages

**`src/lib/components/bookings/EnrollmentGroup.svelte`**
Props: `clientName: string`, `bookingId: string`, `bookingClientId: string`, `participants: { id, name, paymentStatus, amountPaid, amountDue }[]`, `canEdit?: boolean`
When `canEdit={true}`: exposes rename, remove (with cascade), bulk-add, sync-to-sessions actions via form actions passed as props (same pattern as current `ClientParticipants`).
When `canEdit={false}` (session detail, roster read-only view): shows names + badges only, no mutation controls.
Shows: client header with "ver reserva →" link, nested participant rows with `StatusBadge`, inline payment edit when `canEdit`
Replaces: inline participant grouping in `/bookings/[id]`, `ClientParticipants` usage in roster, participant section in `/sessions/[id]`

**`src/lib/components/bookings/BookingMiniRow.svelte`**
Props: `bookingId: string`, `serviceName: string`, `serviceColor: string`, `date: string`, `status: string`, `participantCount: number`, `amountDue: string`, `amountPaid: string`
Shows: service color dot · name · date · participant count · status badge · → link
Used by: `/clients/[id]` active bookings section

**`src/lib/components/sessions/SessionTimelineRow.svelte`**
Props: `date: string`, `serviceName: string`, `instructorName?: string`, `status: string`
Shows: date · service · instructor · status badge
Used by: `/clients/[id]` session history section

### Existing — keep, don't replace
- `SessionCard.svelte` — already used on booking detail, sessions list, service sessions
- `PageHeader.svelte` — already used on clients/[id]
- `SessionListCard.svelte` — keep, update to use `StatusBadge`

### Existing — retire after migration

- `ClientParticipants.svelte` — replaced by `EnrollmentGroup`. Delete after step 3 (roster) is complete — that's the last usage.

---

## Page Rebuild Order

### 1 · `/sessions/[id]` — full rebuild (priority: highest, primary operational view)

**Layout:** `grid-cols-1 md:grid-cols-[280px_1fr]`

**Sidebar (left):**
- `CardShell` with Calendar icon: date, time, duration, level, notes
- `CardShell` with Waves icon: instructor(s)
- `CardShell` with CreditCard icon: payment totals for this session (sum across all enrollment groups)
- Edit / cancel / delete actions below cards

**Main (right):**
- `CardShell` with Users icon: "Participantes · N"
- One `EnrollmentGroup` per booking enrolled in this session
- If no participants: empty state with add prompt

**Removed from current page:** the separate instructor card module (merged into sidebar), the separate enrollment list (replaced by EnrollmentGroup)

**Navigation added:** "ver reserva →" on each EnrollmentGroup header

---

### 2 · `/clients/[id]` — full rebuild

**Layout:** `grid-cols-1 md:grid-cols-[240px_1fr]`

**Sidebar (left):**
- `CardShell` with User icon: phone, email, skill level badge, since-date, edit button
- `CardShell` with CreditCard icon: payment overview across active bookings (total / cobrado / pendiente), only if active bookings exist

**Main (right):**
- `CardShell` with Calendar icon: "Reservas activas" — list of `BookingMiniRow` items, "Nueva reserva →" link
- `CardShell` with Clock icon: "Historial de sesiones" — list of `SessionTimelineRow` items (limited to last 20)

**New server query required:** `listSessionsForClient(clientId)` — returns sessions where this client has a booking participant enrolled. Ordered by date desc. Returns: `date`, `serviceName`, `instructorName`, `status`. Add to `/clients/[id]/+page.server.ts`.

**Removed from current page:** bare booking list with no context
**Added:** payment summary, session timeline, consistent navigation to bookings

---

### 3 · `/services/[id]/roster` — vocabulary update (not a full rebuild)

Edition tabs: keep as-is.
Edition summary card: wrap in `CardShell` with Users icon.
Each booking row: replace `ClientParticipants` with `EnrollmentGroup`.
Payment badges: replace inline spans with `StatusBadge`.

No layout changes — the page structure is correct. DRY component adoption only.

---

### 4 · `/sessions` list — consistency update

`SessionListCard`: add service color dot, participant count badge, payment % bar.
Wrap card in `CardShell` or apply consistent border/shadow via CSS.
Replace inline status spans with `StatusBadge`.

---

### 5 · `/clients` list — consistency update

Each client row: add active booking count chip + outstanding balance (red if > 0, gray if zero).
Replace any inline status spans with `StatusBadge`.

---

### 6 · `/bookings` list — consistency pass

Already improved in recent commits. Audit for `StatusBadge` consistency only. No layout changes.

---

### 7 · `/services/[id]/sessions` — consistency pass

Replace inline status spans with `StatusBadge`. `SessionCard` already reused here — no changes needed.

---

### 8 · `/bookings/new` — consistency pass

Already has 3-col grid layout. Wrap form sections in `CardShell`. Replace status spans with `StatusBadge`. No layout changes.

---

### 9 · `/agenda` — light update

Calendar event cards: add service color dot (already exists in some views), participant count where available. No layout changes.

---

## DRY Audit

| Pattern currently repeated | Replaced by |
|---|---|
| `rounded-(--radius-card) border border-xxx bg-xxx p-4` (different per card) | `CardShell` |
| `bg-green-100 text-green-700 rounded-full px-2 py-0.5 text-xs` (repeated 20+ times) | `StatusBadge` |
| Client header + nested participant rows (booking detail, roster, session detail) | `EnrollmentGroup` |
| Inline booking row with color dot + name + status (clients page, roster) | `BookingMiniRow` |

---

## Mobile-First Rules

- All grids: `grid-cols-1` base, `md:grid-cols-[...]` for desktop
- Sidebar content always comes first in DOM order — stacks naturally on mobile
- `CardShell` uses full width on mobile, no horizontal padding reduction
- `EnrollmentGroup` is already compact enough for mobile — no special treatment needed
- `StatusBadge` font size: `text-[10px]` minimum, never smaller

---

## Out of Scope

- New database tables or schema changes (no client→participant direct relationship)
- Participant list on `/clients/[id]` (participants live under bookings, not clients directly)
- Client portal or instructor login
- Any new features — this is UI consistency work only
