# Booking Detail Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `/bookings/[id]` into a mobile-first responsive grid with a clean 1-client-per-booking model, per-participant payment tracking, per-participant inventory allocation, and a reusable `SessionCard` component used across the app.

**Architecture:** Schema-first — migrations land before any UI changes. Server queries and types update next. Then the reusable `SessionCard` component is built. Finally, the booking detail page is rebuilt top-row-first using mobile-first Tailwind (stack by default, grid at `md:`).

**Tech Stack:** SvelteKit, Drizzle ORM, PostgreSQL, Tailwind CSS, Vitest, Lucide Svelte

---

## File Map

**New files:**
- `drizzle/0041_booking_detail_redesign.sql` — schema migration
- `src/lib/components/sessions/SessionCard.svelte` — reusable session card (booking / service / modal modes)
- `src/lib/components/sessions/SessionPickerModal.svelte` — new/link session modal

**Modified files:**
- `src/lib/server/db/schema.ts` — add fields + unique constraint
- `src/lib/server/db/schema.test.ts` — schema tests for new fields
- `src/lib/features/bookings/types.ts` — add payment fields to `BookingParticipant`
- `src/lib/features/bookings/participants.queries.ts` — add payment update, bulk add, removal cascade check
- `src/lib/features/inventory/allocations.queries.ts` — add `bookingParticipantId` to create/list
- `src/lib/features/inventory/types.ts` — add `bookingParticipantId` to allocation types
- `src/routes/(app)/bookings/[id]/+page.server.ts` — new actions (bulk participants, per-participant payment, link/new session modal)
- `src/routes/(app)/bookings/[id]/+page.svelte` — full rebuild: mobile-first grid layout
- `src/lib/modules/sessions/BookingDetailCard.svelte` — delegate to `SessionCard` (mode=booking)
- `src/routes/(app)/services/[id]/sessions/+page.svelte` — delegate to `SessionCard` (mode=service)

---

## Task 1: Schema changes

**Files:**
- Modify: `src/lib/server/db/schema.ts`
- Create: `drizzle/0041_booking_detail_redesign.sql`
- Modify: `src/lib/server/db/schema.test.ts`

- [ ] **Step 1: Add new columns and constraint to schema.ts**

In `src/lib/server/db/schema.ts`, make these changes:

```ts
// 1. bookingParticipants — add payment fields
export const bookingParticipants = pgTable('booking_participants', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingClientId: text('booking_client_id').references(() => bookingClients.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  notes: text('notes'),
  sortOrder: integer('sort_order').notNull().default(0),
  amountPaid: numeric('amount_paid', { precision: 10, scale: 2 }).notNull().default('0'),
  paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (t) => [
  index('idx_booking_participants_booking_client').on(t.bookingClientId)
]);

// 2. inventoryAllocations — add bookingParticipantId
export const inventoryAllocations = pgTable('inventory_allocations', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  bookingId: text('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  bookingParticipantId: text('booking_participant_id').references(() => bookingParticipants.id, { onDelete: 'set null' }),
  itemTypeId: text('item_type_id').notNull().references(() => inventoryItemTypes.id, { onDelete: 'restrict' }),
  itemId: text('item_id').references(() => inventoryItems.id, { onDelete: 'set null' }),
  quantity: integer('quantity').notNull().default(1),
  attributeFilter: jsonb('attribute_filter').$type<Record<string, string> | null>(),
  startDate: date('start_date').notNull(),
  endDate: date('end_date'),
  status: allocationStatusEnum('status').notNull().default('allocated'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (t) => [
  index('idx_inventory_allocations_booking').on(t.bookingId),
  index('idx_inventory_allocations_participant').on(t.bookingParticipantId),
  index('idx_inventory_allocations_item_type').on(t.itemTypeId),
  index('idx_inventory_allocations_item').on(t.itemId),
  index('idx_inventory_allocations_dates').on(t.startDate, t.endDate)
]);

// 3. sessionParticipants — add paid flag
export const sessionParticipants = pgTable('session_participants', {
  id: text('id').primaryKey().$defaultFn(() => crypto.randomUUID()),
  sessionId: text('session_id').notNull().references(() => sessions.id, { onDelete: 'cascade' }),
  bookingParticipantId: text('booking_participant_id').references(() => bookingParticipants.id, { onDelete: 'set null' }),
  name: text('name').notNull(),
  notes: text('notes'),
  paid: boolean('paid').notNull().default(false),
  sortOrder: integer('sort_order').notNull().default(0),
  createdAt: timestamp('created_at').notNull().defaultNow()
}, (t) => [
  index('idx_session_participants_bp').on(t.sessionId, t.bookingParticipantId)
]);

// 4. bookingClients — add unique constraint (1 client per booking)
// In the table definition, add to the index array:
export const bookingClients = pgTable('booking_clients', {
  // ... all existing fields unchanged ...
}, (t) => [
  index('idx_booking_clients_booking').on(t.bookingId),
  index('idx_booking_clients_client').on(t.clientId),
  uniqueIndex('uq_booking_clients_booking').on(t.bookingId)   // ← add this
]);
```

- [ ] **Step 2: Write the migration SQL**

Create `drizzle/0041_booking_detail_redesign.sql`:

```sql
-- 1. booking_participants: add payment tracking columns
ALTER TABLE "booking_participants"
  ADD COLUMN "amount_paid" numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "payment_status" "payment_status" NOT NULL DEFAULT 'pending';

-- 2. inventory_allocations: add per-participant FK
ALTER TABLE "inventory_allocations"
  ADD COLUMN "booking_participant_id" text
    REFERENCES "booking_participants"("id") ON DELETE SET NULL;
CREATE INDEX "idx_inventory_allocations_participant"
  ON "inventory_allocations"("booking_participant_id");

-- 3. session_participants: add paid flag
ALTER TABLE "session_participants"
  ADD COLUMN "paid" boolean NOT NULL DEFAULT false;

-- 4. booking_clients: enforce 1 client per booking
-- First check for and fix any existing violations (run once on dev, then prod)
-- SELECT booking_id, COUNT(*) FROM booking_clients
--   WHERE status = 'enrolled' GROUP BY booking_id HAVING COUNT(*) > 1;
CREATE UNIQUE INDEX "uq_booking_clients_booking"
  ON "booking_clients"("booking_id")
  WHERE status = 'enrolled';
```

> **Note on the unique index:** It is a partial index on `status = 'enrolled'` so cancelled rows don't block re-booking if a client is swapped.

- [ ] **Step 3: Run migration**

```bash
npx drizzle-kit push
```

Expected: migration applied, no errors.

- [ ] **Step 4: Update schema tests**

In `src/lib/server/db/schema.test.ts`, add:

```ts
describe('bookingParticipants table', () => {
  it('has payment tracking fields', () => {
    const cols = Object.keys(bookingParticipants)
    expect(cols).toContain('amountPaid')
    expect(cols).toContain('paymentStatus')
  })
})

describe('inventoryAllocations table', () => {
  it('has bookingParticipantId column', () => {
    const cols = Object.keys(inventoryAllocations)
    expect(cols).toContain('bookingParticipantId')
  })
})

describe('sessionParticipants table', () => {
  it('has paid column', () => {
    const cols = Object.keys(sessionParticipants)
    expect(cols).toContain('paid')
  })
})
```

- [ ] **Step 5: Run tests**

```bash
npx vitest run src/lib/server/db/schema.test.ts
```

Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/server/db/schema.ts src/lib/server/db/schema.test.ts drizzle/0041_booking_detail_redesign.sql
git commit -m "feat(db): add participant payment, inventory-per-participant, session paid flag, 1-client-per-booking constraint"
```

---

## Task 2: Update types + participant queries

**Files:**
- Modify: `src/lib/features/bookings/types.ts`
- Modify: `src/lib/features/bookings/participants.queries.ts`

- [ ] **Step 1: Update `BookingParticipant` type**

In `src/lib/features/bookings/types.ts`, update the interface:

```ts
export interface BookingParticipant {
  id: string;
  bookingClientId: string | null;
  name: string;
  notes: string | null;
  sortOrder: number;
  amountPaid: string;       // ← new
  paymentStatus: PaymentStatus;  // ← new
  createdAt: Date;
}
```

Also add a new input type at the bottom:

```ts
export interface BulkAddParticipantsInput {
  bookingClientId: string;
  names: string[];            // already trimmed, no blanks
  syncToSessions: boolean;    // if true, add to all existing sessions
}
```

- [ ] **Step 2: Add new query functions in participants.queries.ts**

Replace/extend `src/lib/features/bookings/participants.queries.ts` with these additions (keep existing functions):

```ts
import { eq, sql, inArray } from 'drizzle-orm'
import { db } from '$lib/server/db'
import {
  bookingParticipants,
  bookingClients,
  sessionParticipants,
  inventoryAllocations
} from '$lib/server/db/schema'
import type { BookingParticipant, PaymentStatus } from './types'

// ── Existing functions unchanged above ───────────────────────────────────────

/** Update payment fields for a single booking participant */
export async function updateParticipantPayment(
  participantId: string,
  amountPaid: string,
  paymentStatus: PaymentStatus
): Promise<void> {
  await db
    .update(bookingParticipants)
    .set({ amountPaid, paymentStatus })
    .where(eq(bookingParticipants.id, participantId))
}

/**
 * Bulk add participants to a booking client enrollment.
 * Skips blank/duplicate names. Returns newly created rows.
 */
export async function bulkAddParticipants(
  bookingClientId: string,
  names: string[]
): Promise<BookingParticipant[]> {
  const existing = await listParticipantsForEnrollment(bookingClientId)
  const existingNames = new Set(existing.map(p => p.name.trim().toLowerCase()))
  const toAdd = names
    .map(n => n.trim())
    .filter(n => n.length > 0 && !existingNames.has(n.toLowerCase()))
  if (toAdd.length === 0) return []
  const rows = await db
    .insert(bookingParticipants)
    .values(toAdd.map((name, i) => ({
      bookingClientId,
      name,
      sortOrder: existing.length + i
    })))
    .returning()
  return rows
}

/**
 * Returns counts of session_participant and inventory_allocation rows
 * tied to a booking_participant — used to show removal warning.
 */
export async function getParticipantRemovalImpact(
  participantId: string
): Promise<{ sessionCount: number; allocationCount: number }> {
  const [spCount, iaCount] = await Promise.all([
    db
      .select({ cnt: sql<string>`COUNT(*)` })
      .from(sessionParticipants)
      .where(eq(sessionParticipants.bookingParticipantId, participantId)),
    db
      .select({ cnt: sql<string>`COUNT(*)` })
      .from(inventoryAllocations)
      .where(eq(inventoryAllocations.bookingParticipantId, participantId))
  ])
  return {
    sessionCount: parseInt(spCount[0].cnt),
    allocationCount: parseInt(iaCount[0].cnt)
  }
}

/**
 * Remove a participant and cascade: delete session_participant rows,
 * null out inventory_allocation.booking_participant_id.
 */
export async function removeParticipantWithCascade(participantId: string): Promise<void> {
  await db
    .update(inventoryAllocations)
    .set({ bookingParticipantId: null })
    .where(eq(inventoryAllocations.bookingParticipantId, participantId))
  await db
    .delete(sessionParticipants)
    .where(eq(sessionParticipants.bookingParticipantId, participantId))
  await db
    .delete(bookingParticipants)
    .where(eq(bookingParticipants.id, participantId))
}
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/features/bookings/types.ts src/lib/features/bookings/participants.queries.ts
git commit -m "feat(queries): participant payment tracking, bulk add, cascade removal"
```

---

## Task 3: Update inventory allocation queries

**Files:**
- Modify: `src/lib/features/inventory/types.ts`
- Modify: `src/lib/features/inventory/allocations.queries.ts`

- [ ] **Step 1: Add `bookingParticipantId` to inventory types**

In `src/lib/features/inventory/types.ts`, add to `CreateAllocationInput`:

```ts
export interface CreateAllocationInput {
  bookingId: string;
  bookingParticipantId?: string | null;   // ← new
  itemTypeId: string;
  itemId?: string | null;
  quantity?: number;
  attributeFilter?: Record<string, string> | null;
  startDate: string;
  endDate?: string | null;
}
```

And to `InventoryAllocationWithDetails` (the read-side type), add:

```ts
bookingParticipantId: string | null;   // ← new
```

- [ ] **Step 2: Thread `bookingParticipantId` through createAllocation**

In `src/lib/features/inventory/allocations.queries.ts`, find `createAllocation` and add the field:

```ts
export async function createAllocation(input: CreateAllocationInput) {
  const [row] = await db
    .insert(inventoryAllocations)
    .values({
      bookingId: input.bookingId,
      bookingParticipantId: input.bookingParticipantId ?? null,  // ← add
      itemTypeId: input.itemTypeId,
      itemId: input.itemId ?? null,
      quantity: input.quantity ?? 1,
      attributeFilter: input.attributeFilter ?? null,
      startDate: input.startDate,
      endDate: input.endDate ?? null
    })
    .returning()
  return row
}
```

Also update the SELECT in whatever function returns `InventoryAllocationWithDetails` to include `bookingParticipantId`.

- [ ] **Step 3: Add function to assign participant to existing allocation**

```ts
export async function assignParticipantToAllocation(
  allocationId: string,
  bookingParticipantId: string | null
): Promise<void> {
  await db
    .update(inventoryAllocations)
    .set({ bookingParticipantId })
    .where(eq(inventoryAllocations.id, allocationId))
}
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/inventory/types.ts src/lib/features/inventory/allocations.queries.ts
git commit -m "feat(inventory): per-participant allocation support"
```

---

## Task 4: New server actions in +page.server.ts

**Files:**
- Modify: `src/routes/(app)/bookings/[id]/+page.server.ts`

- [ ] **Step 1: Import new query functions**

At the top of `+page.server.ts`, add:

```ts
import {
  bulkAddParticipants,
  getParticipantRemovalImpact,
  removeParticipantWithCascade,
  updateParticipantPayment
} from '$lib/features/bookings/participants.queries'
import { assignParticipantToAllocation } from '$lib/features/inventory/allocations.queries'
```

- [ ] **Step 2: Add `bulkAddParticipants` action**

```ts
bulkAddParticipants: async ({ request, params, locals }) => {
  requireRole(locals, 'admin', 'owner', 'manager')
  const form = await request.formData()
  const bookingClientId = form.get('bookingClientId')?.toString() ?? ''
  const rawNames = form.get('names')?.toString() ?? ''
  const syncToSessions = form.get('syncToSessions') === 'true'
  if (!bookingClientId) return fail(400, { error: 'bookingClientId required' })

  const names = rawNames.split('\n').map(n => n.trim()).filter(Boolean)
  if (names.length === 0) return fail(400, { error: 'No names provided' })

  const newParticipants = await bulkAddParticipants(bookingClientId, names)

  if (syncToSessions && newParticipants.length > 0) {
    const booking = await getBooking(params.id)
    if (booking) {
      const sessions = await listSessionsForContext(booking)
      await Promise.all(
        sessions.map(s =>
          Promise.all(
            newParticipants.map(p =>
              addParticipant({ sessionId: s.id, name: p.name, bookingParticipantId: p.id })
            )
          )
        )
      )
    }
  }
  await recalcBookingAmounts(params.id)
  return { error: null, message: `${newParticipants.length} participante(s) añadidos` }
},
```

- [ ] **Step 3: Add `getRemovalImpact` action**

```ts
getRemovalImpact: async ({ request, locals }) => {
  requireRole(locals, 'admin', 'owner', 'manager')
  const form = await request.formData()
  const participantId = form.get('participantId')?.toString() ?? ''
  if (!participantId) return fail(400, { error: 'participantId required' })
  const impact = await getParticipantRemovalImpact(participantId)
  return { error: null, impact }
},
```

- [ ] **Step 4: Add `removeParticipantCascade` action**

```ts
removeParticipantCascade: async ({ request, params, locals }) => {
  requireRole(locals, 'admin', 'owner', 'manager')
  const form = await request.formData()
  const participantId = form.get('participantId')?.toString() ?? ''
  const bookingClientId = form.get('bookingClientId')?.toString() ?? ''
  if (!participantId) return fail(400, { error: 'participantId required' })
  await removeParticipantWithCascade(participantId)
  if (bookingClientId) await syncParticipantCount(bookingClientId)
  await recalcBookingAmounts(params.id)
  return { error: null, message: 'Participante eliminado' }
},
```

- [ ] **Step 5: Add `updateParticipantPayment` action**

```ts
updateParticipantPayment: async ({ request, locals }) => {
  requireRole(locals, 'admin', 'owner', 'manager')
  const form = await request.formData()
  const participantId = form.get('participantId')?.toString() ?? ''
  const amountPaid = form.get('amountPaid')?.toString() ?? '0'
  const amountDue = parseFloat(form.get('amountDue')?.toString() ?? '0')
  const paid = parseFloat(amountPaid)
  const paymentStatus: PaymentStatus =
    paid >= amountDue ? 'paid' : paid > 0 ? 'partial' : 'pending'
  if (!participantId) return fail(400, { error: 'participantId required' })
  await updateParticipantPayment(participantId, amountPaid, paymentStatus)
  return { error: null, message: 'Pago actualizado' }
},
```

- [ ] **Step 6: Add `assignInventoryParticipant` action**

```ts
assignInventoryParticipant: async ({ request, locals }) => {
  requireRole(locals, 'admin', 'owner', 'manager')
  const form = await request.formData()
  const allocationId = form.get('allocationId')?.toString() ?? ''
  const bookingParticipantId = form.get('bookingParticipantId')?.toString() || null
  if (!allocationId) return fail(400, { error: 'allocationId required' })
  await assignParticipantToAllocation(allocationId, bookingParticipantId)
  return { error: null, message: 'Equipo asignado' }
},
```

- [ ] **Step 7: Update load function to return participants at booking level**

In the `load` function, ensure `participantsByEnrollment` is already loaded (it is). Also add a flat list for convenience:

```ts
// After existing participantsByEnrollment load:
const bookingParticipantsList = Object.values(participantsByEnrollment).flat()

// Add to return:
return {
  // ...existing fields...
  bookingParticipantsList,
}
```

- [ ] **Step 8: Commit**

```bash
git add src/routes/(app)/bookings/[id]/+page.server.ts
git commit -m "feat(actions): bulk add participants, cascade remove, per-participant payment, inventory assignment"
```

---

## Task 5: SessionCard component

**Files:**
- Create: `src/lib/components/sessions/SessionCard.svelte`

This is the single reusable session card. Three modes:
- `booking` — participant pool from the current booking's client, this-booking group highlighted
- `service` — flat list of all session participants, no grouping
- `modal` — link/select mode, same as service but with a Link CTA and no edit actions

- [ ] **Step 1: Create the component**

Create `src/lib/components/sessions/SessionCard.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms'
  import { withToast } from '$lib/utils/enhance'
  import { fmtTimeRange } from '$lib/features/calendar/utils'
  import type { Session } from '$lib/features/sessions/types'
  import type { BookingParticipant } from '$lib/features/bookings/types'

  interface Instructor { id: string; name: string }

  interface ParticipantGroup {
    bookingId: string
    clientName: string
    isCurrentBooking: boolean
    participants: { id: string; name: string; bookingParticipantId: string | null }[]
  }

  let {
    session,
    mode = 'booking',
    participantPool = [],
    participantGroups = [],
    instructors = [],
    bookingId = '',
    bookingStatus = 'confirmed',
    capacity = null,
    onLink
  }: {
    session: Session
    mode?: 'booking' | 'service' | 'modal'
    participantPool?: BookingParticipant[]
    participantGroups?: ParticipantGroup[]
    instructors?: Instructor[]
    bookingId?: string
    bookingStatus?: string
    capacity?: number | null
    onLink?: (sessionId: string) => void
  } = $props()

  const dur = $derived(session.durationMinutes ?? 60)
  const activeParticipants = $derived(session.participants.filter(p => true))
  const takenCount = $derived(session.participants.length)
  const fillPct = $derived(capacity ? Math.min(100, (takenCount / capacity) * 100) : 0)
  const capacityColor = $derived(
    fillPct >= 100 ? 'bg-red-500' : fillPct >= 75 ? 'bg-amber-400' : 'bg-green-500'
  )

  let editingTime = $state(false)
  let editTime = $state(session.time?.slice(0, 5) ?? '')
  let editDuration = $state(dur)
</script>

<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
  <!-- Card body: stacked on mobile, side-by-side on md+ -->
  <div class="flex flex-col md:flex-row">

    <!-- LEFT PANEL: date + time + instructor -->
    <div class="border-b border-gray-100 bg-gray-50/60 p-3 md:w-[34%] md:border-b-0 md:border-r md:p-4">
      <div class="text-[10px] font-bold uppercase tracking-wide text-gray-400">
        {new Date(session.date + 'T00:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}
      </div>
      {#if session.time}
        <div class="text-lg font-bold text-green-600 leading-tight">
          {session.time.slice(0, 5)}
        </div>
        <div class="text-[11px] text-gray-400">{dur} min</div>
      {:else}
        <div class="mt-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700 inline-block">
          Sin horario
        </div>
      {/if}

      {#if instructors.length > 0 && mode !== 'modal'}
        <div class="mt-3 border-t border-gray-100 pt-3">
          <div class="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-400">Instructor</div>
          {#each instructors as inst (inst.id)}
            {@const assigned = session.instructors.some(si => si.instructorId === inst.id)}
            <label class="mb-1 flex cursor-pointer items-center gap-1.5">
              {#if bookingStatus !== 'cancelled'}
                <form method="post" action={assigned ? '?/updateSession' : '?/updateSession'}>
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input
                    type="checkbox"
                    name="sessionInstructorId"
                    value={inst.id}
                    checked={assigned}
                    class="h-3 w-3 accent-green-600"
                  />
                </form>
              {:else}
                <input type="checkbox" checked={assigned} disabled class="h-3 w-3 accent-green-600" />
              {/if}
              <span class="text-[11px] text-gray-700">{inst.name}</span>
            </label>
          {/each}
        </div>
      {/if}
    </div>

    <!-- RIGHT PANEL: participants -->
    <div class="flex-1 p-3 md:p-4">
      <!-- Capacity header -->
      <div class="mb-2 flex items-center justify-between">
        <div class="text-[9px] font-bold uppercase tracking-wide text-gray-400">Participantes</div>
        <div class="flex items-center gap-2">
          <span class="text-[11px] font-bold text-gray-700">
            {takenCount}{capacity != null ? `/${capacity}` : ''}
          </span>
          {#if capacity != null}
            <div class="h-1 w-10 overflow-hidden rounded-full bg-gray-200">
              <div class="h-full rounded-full {capacityColor}" style="width:{fillPct}%"></div>
            </div>
          {/if}
        </div>
      </div>

      <!-- mode=booking: grouped by client contract -->
      {#if mode === 'booking'}
        {#if participantGroups.length > 0}
          {#each participantGroups as group (group.bookingId)}
            <div class="mb-3">
              <div class="mb-1">
                <span class="rounded-full px-2 py-0.5 text-[8px] font-bold uppercase tracking-wide
                  {group.isCurrentBooking ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}">
                  {group.clientName}{group.isCurrentBooking ? ' ← esta reserva' : ''}
                </span>
              </div>
              <div class="flex flex-col gap-1 border-l-2 pl-2
                {group.isCurrentBooking ? 'border-blue-300' : 'border-gray-200'}">
                {#each group.participants as sp (sp.id)}
                  <div class="flex items-center justify-between rounded px-2 py-1
                    {group.isCurrentBooking ? 'bg-blue-50' : 'bg-gray-50'}">
                    <span class="text-[11px] {group.isCurrentBooking ? 'font-medium text-gray-900' : 'text-gray-400'}">
                      ✓ {sp.name}
                    </span>
                    {#if group.isCurrentBooking && bookingStatus !== 'cancelled'}
                      <form method="post" action="?/removeParticipant" use:enhance={withToast()}>
                        <input type="hidden" name="participantId" value={sp.id} />
                        <button type="submit" class="text-[9px] text-gray-300 hover:text-red-400">remove</button>
                      </form>
                    {:else if !group.isCurrentBooking}
                      <span class="text-[8px] text-gray-300">otra reserva</span>
                    {/if}
                  </div>
                {/each}
                <!-- Pool participants not yet in this session -->
                {#if group.isCurrentBooking}
                  {#each participantPool as bp (bp.id)}
                    {@const inSession = group.participants.some(sp => sp.bookingParticipantId === bp.id || sp.name === bp.name)}
                    {#if !inSession}
                      <form method="post" action="?/addParticipant" use:enhance={withToast()}
                        class="flex items-center justify-between rounded px-2 py-1 hover:bg-blue-50/60">
                        <input type="hidden" name="sessionId" value={session.id} />
                        <input type="hidden" name="participantName" value={bp.name} />
                        <input type="hidden" name="bookingParticipantId" value={bp.id} />
                        <span class="text-[11px] text-gray-400">○ {bp.name}</span>
                        <button type="submit" class="text-[9px] font-semibold text-green-600 hover:underline">add</button>
                      </form>
                    {/if}
                  {/each}
                {/if}
              </div>
            </div>
          {/each}
        {:else}
          <!-- No groups yet — simple pool checklist -->
          <div class="flex flex-col gap-1">
            {#each participantPool as bp (bp.id)}
              {@const inSession = session.participants.some(sp => sp.bookingParticipantId === bp.id || sp.name === bp.name)}
              {#if inSession}
                {@const sp = session.participants.find(sp => sp.bookingParticipantId === bp.id || sp.name === bp.name)!}
                <div class="flex items-center justify-between rounded bg-green-50 px-2 py-1">
                  <span class="text-[11px] font-medium text-gray-900">✓ {bp.name}</span>
                  {#if bookingStatus !== 'cancelled'}
                    <form method="post" action="?/removeParticipant" use:enhance={withToast()}>
                      <input type="hidden" name="participantId" value={sp.id} />
                      <button type="submit" class="text-[9px] text-gray-300 hover:text-red-400">remove</button>
                    </form>
                  {/if}
                </div>
              {:else}
                <form method="post" action="?/addParticipant" use:enhance={withToast()}
                  class="flex items-center justify-between rounded px-2 py-1 hover:bg-green-50/40">
                  <input type="hidden" name="sessionId" value={session.id} />
                  <input type="hidden" name="participantName" value={bp.name} />
                  <input type="hidden" name="bookingParticipantId" value={bp.id} />
                  <span class="text-[11px] text-gray-400">○ {bp.name}</span>
                  <button type="submit" class="text-[9px] font-semibold text-green-600">add</button>
                </form>
              {/if}
            {/each}
          </div>
        {/if}

      <!-- mode=service or modal: flat participant list -->
      {:else}
        <div class="flex flex-col gap-1">
          {#each session.participants as p (p.id)}
            <div class="flex items-center justify-between rounded bg-gray-50 px-2 py-1">
              <span class="text-[11px] text-gray-700">✓ {p.name}</span>
            </div>
          {/each}
          {#if session.participants.length === 0}
            <p class="text-[11px] italic text-gray-400">Sin participantes.</p>
          {/if}
        </div>
      {/if}
    </div>
  </div>

  <!-- FOOTER -->
  <div class="flex items-center justify-between border-t border-gray-100 bg-gray-50/40 px-3 py-1.5 md:px-4">
    <span class="rounded-full px-2 py-0.5 text-[9px] font-semibold capitalize
      {session.status === 'scheduled' ? 'bg-green-100 text-green-700' :
       session.status === 'cancelled' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700'}">
      {session.status}
    </span>
    <div class="flex items-center gap-3">
      {#if mode === 'modal' && onLink}
        <button
          type="button"
          onclick={() => onLink!(session.id)}
          class="rounded-md bg-green-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-green-700">
          Vincular
        </button>
      {:else}
        {#if bookingStatus !== 'cancelled' && mode === 'booking'}
          <button type="button" onclick={() => editingTime = !editingTime}
            class="text-[10px] text-gray-400 hover:text-gray-700">Editar</button>
        {/if}
        <a href="/sessions/{session.id}?from=/bookings/{bookingId}"
          class="text-[10px] text-blue-500 hover:underline">Abrir →</a>
        {#if bookingStatus !== 'cancelled' && mode === 'booking'}
          <form method="post" action="?/cancelSession" use:enhance={withToast()}>
            <input type="hidden" name="sessionId" value={session.id} />
            <button
              type="submit"
              onclick={(e) => { if (!confirm('¿Cancelar esta sesión?')) e.preventDefault() }}
              class="text-[10px] text-red-400 hover:text-red-600">Cancelar</button>
          </form>
        {/if}
      {/if}
    </div>
  </div>

  <!-- Inline edit panel (time/duration) -->
  {#if editingTime && mode === 'booking'}
    <form method="post" action="?/updateSession" use:enhance={withToast(() => { editingTime = false })}
      class="border-t border-gray-100 px-4 py-3">
      <input type="hidden" name="sessionId" value={session.id} />
      <div class="flex flex-wrap gap-3">
        <div>
          <label class="block text-[10px] text-gray-400">Hora</label>
          <input name="sessionTime" type="time" bind:value={editTime} class="input text-xs mt-0.5 w-28" />
        </div>
        <div>
          <label class="block text-[10px] text-gray-400">Duración (min)</label>
          <input name="sessionDuration" type="number" min="15" step="15" bind:value={editDuration}
            class="input text-xs mt-0.5 w-20" />
        </div>
      </div>
      <div class="mt-2 flex gap-2">
        <button type="submit" class="btn-primary btn-sm text-xs">Guardar</button>
        <button type="button" onclick={() => editingTime = false} class="text-xs text-gray-400">Cancelar</button>
      </div>
    </form>
  {/if}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/sessions/SessionCard.svelte
git commit -m "feat(component): add reusable SessionCard with booking/service/modal modes"
```

---

## Task 6: SessionPickerModal component

**Files:**
- Create: `src/lib/components/sessions/SessionPickerModal.svelte`

- [ ] **Step 1: Create the modal**

Create `src/lib/components/sessions/SessionPickerModal.svelte`:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms'
  import { withToast } from '$lib/utils/enhance'
  import SessionCard from './SessionCard.svelte'
  import type { Session } from '$lib/features/sessions/types'

  interface ModalSession extends Session {
    participantGroupsForModal: {
      bookingId: string
      clientName: string
      isCurrentBooking: boolean
      participants: { id: string; name: string; bookingParticipantId: string | null }[]
    }[]
    slotsAfterLink: number  // (capacity ?? 99) - participants.length - incomingCount
    wouldExceed: boolean
  }

  let {
    open = $bindable(false),
    bookingId,
    bookingStatus,
    incomingParticipantCount,  // participants that would be added on link
    capacity,
    availableSessions = [],
    instructors = [],
    bookingDate
  }: {
    open: boolean
    bookingId: string
    bookingStatus: string
    incomingParticipantCount: number
    capacity: number | null
    availableSessions: ModalSession[]
    instructors: { id: string; name: string }[]
    bookingDate: string
  } = $props()

  let activeTab = $state<'new' | 'link'>('link')

  // New session form state
  let newDate = $state(bookingDate)
  let newTime = $state('')
  let newDuration = $state(60)
</script>

{#if open}
  <!-- Backdrop -->
  <div
    class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
    onclick={() => open = false}
    role="presentation"
  ></div>

  <!-- Panel -->
  <div class="fixed inset-x-4 top-[5%] z-50 mx-auto max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl md:inset-x-auto md:left-1/2 md:-translate-x-1/2 md:w-full">
    <!-- Header -->
    <div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
      <div>
        <h2 class="text-sm font-bold text-gray-900">Sesión</h2>
        <p class="text-xs text-gray-400 mt-0.5">Crear nueva o vincular existente</p>
      </div>
      <button onclick={() => open = false}
        class="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-sm text-gray-400 hover:bg-gray-50">✕</button>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-gray-100 bg-gray-50">
      <button
        onclick={() => activeTab = 'new'}
        class="flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors
          {activeTab === 'new' ? 'border-green-600 text-green-700 bg-white' : 'border-transparent text-gray-400 hover:text-gray-600'}">
        + Nueva sesión
      </button>
      <button
        onclick={() => activeTab = 'link'}
        class="flex-1 py-2.5 text-xs font-semibold border-b-2 transition-colors
          {activeTab === 'link' ? 'border-green-600 text-green-700 bg-white' : 'border-transparent text-gray-400 hover:text-gray-600'}">
        🔗 Vincular existente
      </button>
    </div>

    <!-- Content -->
    <div class="max-h-[70vh] overflow-y-auto">

      {#if activeTab === 'new'}
        <!-- New session form -->
        <form method="post" action="?/addSession" use:enhance={withToast(() => { open = false })}
          class="p-5 space-y-4">
          <div class="grid grid-cols-2 gap-3">
            <div>
              <label class="block text-xs text-gray-500 mb-1">Fecha</label>
              <input name="sessionDate" type="date" bind:value={newDate} required class="input text-sm w-full" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Hora</label>
              <input name="sessionTime" type="time" bind:value={newTime} class="input text-sm w-full" />
            </div>
            <div>
              <label class="block text-xs text-gray-500 mb-1">Duración (min)</label>
              <input name="sessionDuration" type="number" min="15" step="15" bind:value={newDuration} class="input text-sm w-full" />
            </div>
          </div>
          {#if instructors.length > 0}
            <div>
              <div class="text-xs text-gray-500 mb-2">Instructor</div>
              <div class="space-y-1.5">
                {#each instructors as inst (inst.id)}
                  <label class="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" name="sessionInstructorId" value={inst.id}
                      class="h-3.5 w-3.5 accent-green-600" />
                    <span class="text-sm text-gray-700">{inst.name}</span>
                  </label>
                {/each}
              </div>
            </div>
          {/if}
          <button type="submit" class="btn-primary btn-block">Crear sesión</button>
        </form>

      {:else}
        <!-- Link existing -->
        <div class="bg-gray-100 p-3 flex flex-col gap-3">
          {#if availableSessions.length === 0}
            <p class="px-2 py-4 text-center text-sm text-gray-400">No hay sesiones disponibles.</p>
          {/if}
          {#each availableSessions as s (s.id)}
            {@const taken = s.participants.length}
            {@const cap = capacity}
            {@const wouldBe = taken + incomingParticipantCount}
            {@const over = cap != null && wouldBe > cap}

            <div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
              <!-- Session header -->
              <div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
                <span class="text-xs font-bold text-gray-800">
                  {new Date(s.date + 'T00:00:00').toLocaleDateString('es', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {s.time ? ' · ' + s.time.slice(0,5) : ''}
                  {s.instructors.length > 0 ? ' · ' + s.instructors.map(i => i.instructorName).join(', ') : ''}
                </span>
                {#if over}
                  <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
                    ⚠ Llena {taken}/{cap}
                  </span>
                {:else}
                  <span class="rounded-full bg-gray-200 px-2 py-0.5 text-[9px] text-gray-500">
                    {taken}{cap != null ? `/${cap}` : ''}
                  </span>
                {/if}
              </div>

              <div class="p-3">
                <!-- Enrolled groups -->
                {#if s.participantGroupsForModal.length > 0}
                  <div class="text-[9px] font-bold uppercase tracking-wide text-gray-400 mb-2">Inscritos</div>
                  <div class="flex flex-col gap-2 mb-3">
                    {#each s.participantGroupsForModal as g (g.bookingId)}
                      <div class="rounded-lg bg-gray-50 px-3 py-2">
                        <div class="text-[10px] font-semibold text-gray-600 mb-1.5">{g.clientName}</div>
                        <div class="flex flex-wrap gap-1">
                          {#each g.participants as p (p.id)}
                            <span class="rounded-full bg-gray-200 px-2 py-0.5 text-[9px] text-gray-600">{p.name}</span>
                          {/each}
                        </div>
                      </div>
                    {/each}
                  </div>
                {:else}
                  <p class="mb-3 text-[11px] italic text-gray-400">Sin inscritos aún.</p>
                {/if}

                <!-- Impact -->
                <p class="mb-2 text-[10px] text-gray-500">
                  Vincular añade {incomingParticipantCount} participante{incomingParticipantCount !== 1 ? 's' : ''} →
                  <strong class="{over ? 'text-amber-600' : 'text-green-600'}">{wouldBe}{cap != null ? `/${cap}` : ''}</strong>
                </p>

                {#if over}
                  <div class="mb-2 rounded-md bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
                    ⚠ Vinculando se superaría el aforo máximo de {cap}.
                  </div>
                  <form method="post" action="?/assignToSession" use:enhance={withToast(() => { open = false })}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button type="submit" class="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 text-xs text-gray-500 hover:bg-gray-100">
                      Vincular de todos modos (override)
                    </button>
                  </form>
                {:else}
                  <form method="post" action="?/assignToSession" use:enhance={withToast(() => { open = false })}>
                    <input type="hidden" name="sessionId" value={s.id} />
                    <button type="submit" class="w-full rounded-lg bg-green-600 py-2 text-xs font-bold text-white hover:bg-green-700">
                      Vincular a esta sesión
                    </button>
                  </form>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
{/if}
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/sessions/SessionPickerModal.svelte
git commit -m "feat(component): add SessionPickerModal with new/link tabs and capacity warnings"
```

---

## Task 7: Rebuild +page.svelte — mobile-first grid

**Files:**
- Modify: `src/routes/(app)/bookings/[id]/+page.svelte`

This task replaces the entire page. Build section by section, mobile-first (single column default, grid at `md:`).

- [ ] **Step 1: Replace the page with the new structure**

Replace `src/routes/(app)/bookings/[id]/+page.svelte` entirely:

```svelte
<script lang="ts">
  import { enhance } from '$app/forms'
  import { goto } from '$app/navigation'
  import { page } from '$app/stores'
  import { withToast } from '$lib/utils/enhance'
  import { DOT_COLORS } from '$lib/features/services/colors'
  import type { ServiceColorKey } from '$lib/features/services/colors'
  import type { ActionData, PageData } from './$types'
  import { getLocale } from '$lib/paraglide/runtime'

  import SessionCard from '$lib/components/sessions/SessionCard.svelte'
  import SessionPickerModal from '$lib/components/sessions/SessionPickerModal.svelte'
  import CreditsCard from '$lib/modules/credits/BookingDetailCard.svelte'
  import PaymentCard from '$lib/modules/payment/BookingDetailCard.svelte'

  let { data, form }: { data: PageData; form: ActionData } = $props()

  const modules = $derived(data.booking.serviceModules ?? {})
  const hasSessions = $derived('sessions' in modules || 'editions' in modules)
  const hasInventory = $derived('inventory' in modules)
  const hasCredits = $derived('credits' in modules)
  const canSeeFinancials = $derived(data.canSeeFinancials)
  const isPricedPerPersonPerSession = $derived(data.service?.pricingMode === 'per_person_per_session')

  // The single booking client (contract holder)
  const bookingClient = $derived(data.booking.clients[0])
  const participants = $derived(
    bookingClient ? (data.participantsByEnrollment[bookingClient.id] ?? []) : []
  )

  const statusColors: Record<string, string> = {
    confirmed: 'bg-green-100 text-green-700',
    pending: 'bg-amber-100 text-amber-700',
    cancelled: 'bg-red-100 text-red-600'
  }

  const shortId = $derived(data.booking.id.slice(0, 8).toUpperCase())

  // Participant CRUD state
  let bulkAddOpen = $state(false)
  let bulkNames = $state('')
  let removingParticipantId = $state<string | null>(null)
  let editingParticipantId = $state<string | null>(null)
  let editingParticipantName = $state('')
  let removalImpact = $state<{ sessionCount: number; allocationCount: number } | null>(null)

  // Payment state
  let expandedPaymentId = $state<string | null>(null)

  // Session picker modal
  let sessionModalOpen = $state(false)

  // Notes
  let editingNotes = $state(false)
  let editNotesValue = $state(data.booking.notes ?? '')

  // Compute participant groups for session cards (booking mode)
  // For now: all participants belong to the single bookingClient → one group
  const participantGroupsForSessions = $derived(
    bookingClient
      ? [{
          bookingId: data.booking.id,
          clientName: `${bookingClient.clientFirstName} ${bookingClient.clientLastName}`.trim(),
          isCurrentBooking: true,
          participants: sessions.flatMap(s =>
            s.participants.filter(sp =>
              participants.some(p => p.id === sp.bookingParticipantId || p.name === sp.name)
            ).map(sp => ({ id: sp.id, name: sp.name, bookingParticipantId: sp.bookingParticipantId }))
          )
        }]
      : []
  )

  const sessions = $derived(data.sessions ?? [])

  function fmtDate(d: Date | string) {
    const date = typeof d === 'string' ? new Date(d) : d
    return date.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  }
</script>

<div class="mx-auto max-w-5xl space-y-4 p-3 md:p-6">

  <!-- HEADER -->
  <div class="flex items-start gap-3">
    <button
      onclick={() => history.length > 1 ? history.back() : goto('/bookings')}
      class="btn-ghost btn-sm mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-0">←</button>
    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2">
        <span class="inline-block h-3 w-3 shrink-0 rounded-full"
          style="background-color: {DOT_COLORS[(data.booking.serviceColor ?? 'ocean') as ServiceColorKey] ?? DOT_COLORS['ocean']}"></span>
        <h1 class="truncate text-xl font-bold text-navy">{data.booking.serviceName ?? 'Reserva'}</h1>
      </div>
      <p class="mt-0.5 text-sm text-muted">{data.booking.date}</p>
    </div>
    <span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium {statusColors[data.booking.status]}">
      {data.booking.status}
    </span>
  </div>

  <!-- META STRIP -->
  <div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-(--radius-card) bg-sand px-4 py-2.5 text-[11px] text-muted">
    <span class="font-mono font-semibold tracking-widest">#{shortId}</span>
    <span class="text-border">·</span>
    <span>Creada {fmtDate(data.booking.createdAt)}</span>
    <button type="button" onclick={() => { editNotesValue = data.booking.notes ?? ''; editingNotes = !editingNotes }}
      class="ml-auto text-[11px] font-medium text-ocean hover:underline">
      {data.booking.notes ? '📝 Notas' : '📝 Añadir nota'}
    </button>
  </div>

  <!-- Inline notes -->
  {#if editingNotes}
    <form method="post" action="?/updateNotes" use:enhance={withToast(() => { editingNotes = false })}
      class="rounded-(--radius-card) bg-surface p-4 ring-1 ring-ocean/30">
      <textarea name="notes" rows="3" bind:value={editNotesValue} autofocus
        placeholder="Notas internas..."
        class="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-ocean focus:outline-none"></textarea>
      <div class="mt-2 flex gap-2">
        <button type="submit" class="btn-primary btn-sm text-xs">Guardar</button>
        <button type="button" onclick={() => editingNotes = false} class="text-xs text-muted hover:text-gray-700">Cancelar</button>
      </div>
    </form>
  {:else if data.booking.notes}
    <p class="rounded-(--radius-card) bg-sand px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">{data.booking.notes}</p>
  {/if}

  <!-- TOP ROW: Service | Client + Participants | Payment -->
  <!-- Mobile: stacked. Desktop: 3-col grid -->
  <div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.6fr_1fr]">

    <!-- SERVICE CARD -->
    <div class="rounded-(--radius-card) border border-blue-100 bg-blue-50 p-4">
      <div class="mb-3 text-[10px] font-bold uppercase tracking-wider text-blue-700">📋 Servicio</div>
      {#if data.booking.serviceId && data.booking.serviceName}
        <div class="flex items-center gap-2 mb-3">
          <span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
            style="background-color: {DOT_COLORS[(data.booking.serviceColor ?? 'ocean') as ServiceColorKey]}"></span>
          <span class="font-semibold text-gray-900">{data.booking.serviceName}</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          {#each Object.keys(modules) as mod}
            <span class="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-semibold text-blue-700 capitalize">{mod}</span>
          {/each}
        </div>
        <p class="mt-3 text-[9px] italic text-gray-400">Solo lectura. Eliminar reserva para cambiar.</p>
      {:else}
        <p class="text-sm text-muted italic">Sin servicio vinculado.</p>
      {/if}
    </div>

    <!-- CLIENT + PARTICIPANTS CARD -->
    <div class="rounded-(--radius-card) border border-blue-100 bg-white p-4">
      <div class="mb-3 text-[10px] font-bold uppercase tracking-wider text-blue-700">👤 Cliente</div>

      {#if bookingClient}
        <!-- Contract holder -->
        <div class="mb-4 flex items-start justify-between">
          <div>
            <div class="font-semibold text-gray-900">{bookingClient.clientFirstName} {bookingClient.clientLastName}</div>
            {#if bookingClient.clientPhone}
              <div class="text-xs text-muted mt-0.5">{bookingClient.clientPhone}</div>
            {/if}
            {#if bookingClient.clientEmail}
              <div class="text-xs text-muted">{bookingClient.clientEmail}</div>
            {/if}
          </div>
          <div class="flex gap-1.5 shrink-0">
            {#if bookingClient.clientPhone}
              <a href="https://wa.me/{bookingClient.clientPhone.replace(/[\s\-()+]/g,'')}" target="_blank" rel="noopener"
                class="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50">📱</a>
            {/if}
            {#if bookingClient.clientEmail}
              <a href="mailto:{bookingClient.clientEmail}"
                class="rounded border border-gray-200 px-2 py-1 text-[10px] text-gray-500 hover:bg-gray-50">✉</a>
            {/if}
          </div>
        </div>

        <!-- Participants -->
        <div class="border-t border-gray-100 pt-3">
          <div class="mb-2 text-[9px] font-bold uppercase tracking-wider text-gray-400">
            Participantes ({participants.length})
          </div>

          <!-- Participant list -->
          <div class="mb-3 flex flex-col gap-1.5">
            {#each participants as p (p.id)}
              {#if editingParticipantId === p.id}
                <form method="post" action="?/renameParticipant"
                  use:enhance={withToast(() => { editingParticipantId = null })}
                  class="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5">
                  <input type="hidden" name="participantId" value={p.id} />
                  <input name="name" type="text" bind:value={editingParticipantName}
                    class="flex-1 rounded border border-border px-2 py-0.5 text-xs focus:border-ocean focus:outline-none" autofocus />
                  <button type="submit" class="text-[10px] font-semibold text-ocean">✓</button>
                  <button type="button" onclick={() => editingParticipantId = null} class="text-[10px] text-muted">✕</button>
                </form>
              {:else if removingParticipantId === p.id}
                <div class="rounded-lg bg-red-50 border border-red-200 px-3 py-2">
                  <p class="text-[10px] font-semibold text-red-700 mb-1">{p.name}</p>
                  {#if removalImpact}
                    <p class="text-[9px] text-amber-700 mb-2 bg-amber-50 rounded px-2 py-1">
                      ⚠ Se eliminará de {removalImpact.sessionCount} sesión{removalImpact.sessionCount !== 1 ? 'es' : ''}
                      {removalImpact.allocationCount > 0 ? ` y se desasignará el equipo (${removalImpact.allocationCount} asignación${removalImpact.allocationCount !== 1 ? 'es' : ''})` : ''}
                    </p>
                  {/if}
                  <div class="flex gap-2">
                    <form method="post" action="?/removeParticipantCascade" use:enhance={withToast(() => { removingParticipantId = null; removalImpact = null })}>
                      <input type="hidden" name="participantId" value={p.id} />
                      <input type="hidden" name="bookingClientId" value={bookingClient.id} />
                      <button type="submit" class="text-[10px] font-semibold text-red-600 hover:underline">Confirmar eliminar</button>
                    </form>
                    <button type="button" onclick={() => { removingParticipantId = null; removalImpact = null }}
                      class="text-[10px] text-muted hover:text-gray-700">Cancelar</button>
                  </div>
                </div>
              {:else}
                <div class="flex items-center gap-2 rounded-lg bg-blue-50/60 px-2.5 py-1.5">
                  <span class="flex-1 text-xs font-medium text-gray-800">{p.name}</span>
                  <button type="button"
                    onclick={() => { editingParticipantId = p.id; editingParticipantName = p.name }}
                    class="text-[10px] text-muted hover:text-ocean">✎</button>
                  <button type="button"
                    onclick={async () => {
                      removingParticipantId = p.id
                      // Fetch impact via form action — simple approach: POST then read response
                      const fd = new FormData()
                      fd.set('participantId', p.id)
                      const res = await fetch('?/getRemovalImpact', { method: 'POST', body: fd })
                      const data = await res.json()
                      removalImpact = data?.data?.impact ?? null
                    }}
                    class="text-[10px] text-red-400 hover:text-red-600">✕</button>
                </div>
              {/if}
            {/each}
          </div>

          <!-- Bulk add -->
          {#if bulkAddOpen}
            <form method="post" action="?/bulkAddParticipants"
              use:enhance={withToast(() => { bulkAddOpen = false; bulkNames = '' })}
              class="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-3">
              <div class="mb-1 text-[9px] font-bold text-blue-700">Un nombre por línea</div>
              <textarea name="names" bind:value={bulkNames} rows="3"
                placeholder="Emma Müller&#10;Leon Müller&#10;Sofia Müller"
                class="w-full rounded border border-blue-200 bg-white px-2 py-1.5 text-xs focus:border-ocean focus:outline-none resize-none"></textarea>
              <input type="hidden" name="bookingClientId" value={bookingClient.id} />
              <input type="hidden" name="syncToSessions" value="true" />
              <div class="mt-2 flex items-center justify-between">
                <span class="text-[9px] text-muted">También se añadirán a sesiones existentes</span>
                <div class="flex gap-2">
                  <button type="button" onclick={() => bulkAddOpen = false} class="text-[10px] text-muted">Cancelar</button>
                  <button type="submit" class="btn-primary btn-sm text-[10px]">Añadir todos</button>
                </div>
              </div>
            </form>
          {:else}
            <button type="button" onclick={() => bulkAddOpen = true}
              class="w-full rounded-lg border border-dashed border-blue-200 bg-blue-50/40 py-2 text-[10px] font-medium text-blue-600 hover:bg-blue-50">
              + Añadir participante(s)
            </button>
          {/if}
        </div>
      {:else}
        <p class="text-sm italic text-muted">Sin cliente vinculado.</p>
      {/if}
    </div>

    <!-- PAYMENT CARD -->
    <div class="rounded-(--radius-card) border border-gray-200 bg-white p-4">
      <div class="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">💳 Pago</div>

      {#if canSeeFinancials && bookingClient}
        {#if isPricedPerPersonPerSession}
          <!-- Per-participant breakdown -->
          <div class="mb-1 text-[9px] text-muted">por sesión × participante</div>
          <div class="mb-3 flex flex-col gap-1.5">
            {#each participants as p (p.id)}
              {@const amountDue = parseFloat(bookingClient.amountDue) / Math.max(participants.length, 1)}
              <div class="overflow-hidden rounded-lg border border-gray-100">
                <div class="flex items-center justify-between px-3 py-2">
                  <span class="text-xs font-semibold text-gray-800">{p.name}</span>
                  <div class="flex items-center gap-2">
                    <span class="text-xs text-gray-600">€{p.amountPaid}</span>
                    <span class="rounded-full px-1.5 py-0.5 text-[8px] font-semibold
                      {p.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                       p.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700' :
                       'bg-gray-100 text-gray-500'}">
                      {p.paymentStatus}
                    </span>
                    <button type="button" onclick={() => expandedPaymentId = expandedPaymentId === p.id ? null : p.id}
                      class="text-[10px] text-muted hover:text-gray-700">✎</button>
                  </div>
                </div>
                {#if expandedPaymentId === p.id}
                  <form method="post" action="?/updateParticipantPayment"
                    use:enhance={withToast(() => { expandedPaymentId = null })}
                    class="border-t border-gray-100 bg-gray-50 px-3 py-2 space-y-2">
                    <input type="hidden" name="participantId" value={p.id} />
                    <input type="hidden" name="amountDue" value={amountDue.toFixed(2)} />
                    <div class="flex items-center gap-2">
                      <label class="shrink-0 text-[9px] text-muted w-16">Pagado €</label>
                      <input name="amountPaid" type="number" step="0.01" min="0"
                        value={p.amountPaid}
                        class="w-20 rounded border border-border px-2 py-0.5 text-xs focus:border-ocean focus:outline-none" />
                    </div>
                    <div class="flex gap-2">
                      <button type="submit" class="btn-primary btn-sm text-[10px]">Guardar</button>
                      <button type="button" onclick={() => expandedPaymentId = null} class="text-[10px] text-muted">Cancelar</button>
                    </div>
                  </form>
                {/if}
              </div>
            {/each}
          </div>
        {:else}
          <!-- Flat client payment -->
          <div class="mb-3">
            <div class="flex items-center justify-between px-2 py-1.5">
              <span class="text-xs font-semibold text-gray-800">
                {bookingClient.clientFirstName} {bookingClient.clientLastName}
              </span>
              <span class="rounded-full px-2 py-0.5 text-[9px] font-semibold
                {bookingClient.paymentStatus === 'paid' ? 'bg-green-100 text-green-700' :
                 bookingClient.paymentStatus === 'partial' ? 'bg-amber-100 text-amber-700' :
                 'bg-gray-100 text-gray-500'}">
                €{bookingClient.amountPaid} / €{bookingClient.amountDue}
              </span>
            </div>
            <form method="post" action="?/updatePayment" use:enhance={withToast()} class="mt-1 flex items-center gap-2 px-2">
              <input type="hidden" name="bookingClientId" value={bookingClient.id} />
              <input type="hidden" name="amountDue" value={bookingClient.amountDue} />
              <input name="amountPaid" type="number" step="0.01" min="0"
                value={bookingClient.amountPaid} placeholder="0"
                class="w-20 rounded border border-border px-2 py-0.5 text-xs focus:border-ocean focus:outline-none" />
              <button type="submit" class="text-xs text-ocean hover:underline">Guardar</button>
            </form>
          </div>
        {/if}

        <!-- Totals -->
        <div class="border-t border-gray-100 pt-2 space-y-1">
          <div class="flex justify-between text-xs font-bold text-gray-900">
            <span>Total</span><span>€{bookingClient.amountDue}</span>
          </div>
          <div class="flex justify-between text-[11px] text-muted">
            <span>Cobrado</span><span>€{bookingClient.amountPaid}</span>
          </div>
          <div class="flex justify-between text-[11px] {parseFloat(bookingClient.amountDue) - parseFloat(bookingClient.amountPaid) > 0 ? 'text-red-500' : 'text-muted'}">
            <span>Pendiente</span>
            <span>€{(parseFloat(bookingClient.amountDue) - parseFloat(bookingClient.amountPaid)).toFixed(2)}</span>
          </div>
        </div>
      {:else if !canSeeFinancials}
        <p class="text-xs italic text-muted">Sin acceso a datos financieros.</p>
      {/if}
    </div>
  </div>

  <!-- SESSIONS SECTION -->
  {#if hasSessions}
    <div class="rounded-(--radius-card) border border-green-100 bg-green-50/40 p-4">
      <div class="mb-4 flex items-center justify-between">
        <div class="text-[10px] font-bold uppercase tracking-wider text-green-700">
          ⏱ Sesiones · {sessions.filter(s => s.status !== 'cancelled').length} activas
        </div>
        {#if data.booking.status !== 'cancelled'}
          <div class="flex gap-2">
            <button type="button" onclick={() => { sessionModalOpen = true }}
              class="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-green-700 hover:bg-green-50">
              + Nueva sesión
            </button>
            <button type="button" onclick={() => { sessionModalOpen = true }}
              class="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-green-700 hover:bg-green-50">
              🔗 Vincular
            </button>
          </div>
        {/if}
      </div>

      <!-- Session cards: 1 col mobile, 2 col desktop -->
      {#if sessions.length === 0}
        <p class="text-sm italic text-muted">Sin sesiones. Usa los botones para crear o vincular.</p>
      {:else}
        <div class="grid grid-cols-1 gap-4 md:grid-cols-2">
          {#each sessions as session (session.id)}
            <SessionCard
              {session}
              mode="booking"
              participantPool={participants}
              {instructors}
              bookingId={data.booking.id}
              bookingStatus={data.booking.status}
              capacity={data.booking.serviceMaxCapacity}
            />
          {/each}
        </div>
      {/if}
    </div>

    <!-- Session picker modal -->
    <SessionPickerModal
      bind:open={sessionModalOpen}
      bookingId={data.booking.id}
      bookingStatus={data.booking.status}
      incomingParticipantCount={participants.length}
      capacity={data.booking.serviceMaxCapacity}
      availableSessions={[]}
      instructors={data.instructors}
      bookingDate={data.booking.date}
    />
  {/if}

  <!-- INVENTORY SECTION -->
  {#if hasInventory && data.serviceInventoryLinks.length > 0}
    <div class="rounded-(--radius-card) border border-gray-200 bg-white p-4">
      <div class="mb-4 text-[10px] font-bold uppercase tracking-wider text-gray-500">🎒 Inventario — por participante</div>

      <!-- Mobile: stacked rows. Desktop: table-like grid -->
      <div class="flex flex-col gap-2">
        {#each participants as p (p.id)}
          {@const pAllocs = data.booking.allocations.filter(a => a.bookingParticipantId === p.id)}
          <div class="rounded-lg bg-gray-50 px-3 py-2.5">
            <!-- Participant name -->
            <div class="mb-2 text-xs font-semibold text-gray-800">{p.name}</div>
            <!-- Item slots -->
            <div class="flex flex-wrap gap-2">
              {#each data.serviceInventoryLinks as link (link.id)}
                {@const alloc = pAllocs.find(a => a.itemTypeId === link.itemTypeId)}
                {#if alloc}
                  <div class="flex items-center gap-1.5 rounded-md bg-white border border-gray-200 px-2.5 py-1">
                    <span class="text-[10px] text-gray-700">{alloc.itemTypeName ?? link.itemTypeId}</span>
                    {#if alloc.itemName}
                      <span class="text-[9px] text-muted">· {alloc.itemName}</span>
                    {/if}
                    <span class="rounded-full px-1.5 py-0.5 text-[8px] font-semibold
                      {alloc.status === 'allocated' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}">
                      {alloc.status === 'allocated' ? 'listo' : alloc.status}
                    </span>
                  </div>
                {:else}
                  <form method="post" action="?/addAlloc" use:enhance={withToast()}>
                    <input type="hidden" name="bookingParticipantId" value={p.id} />
                    <input type="hidden" name="itemTypeId" value={link.itemTypeId} />
                    <input type="hidden" name="quantity" value="1" />
                    <button type="submit"
                      class="rounded-md border border-dashed border-gray-300 px-2.5 py-1 text-[9px] text-gray-400 hover:border-gray-400 hover:text-gray-600">
                      + {link.itemTypeName ?? 'artículo'}
                    </button>
                  </form>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- CREDITS -->
  {#if hasCredits}
    <CreditsCard booking={data.booking} {modules}
      quantity={data.booking.quantity}
      creditsUsed={data.creditsUsedFromThisBooking}
      bookingDate={data.booking.date} />
  {/if}

  <!-- CANCEL / DELETE -->
  {#if data.booking.status !== 'cancelled' && data.userRole !== 'staff'}
    <div class="flex flex-col gap-2 sm:flex-row">
      <form method="POST" action="?/cancel" use:enhance={withToast()} class="flex-1">
        <button type="submit" class="btn-secondary btn-block text-amber-700">Cancelar reserva</button>
      </form>
      {#if data.userRole === 'owner' || data.userRole === 'admin'}
        <form method="POST" action="?/delete"
          use:enhance={({ cancel }) => {
            if (!confirm('¿Eliminar esta reserva?')) { cancel(); return }
            return withToast(() => goto('/bookings'))()
          }}
          class="flex-1">
          <button type="submit" class="btn-secondary btn-block text-red-600">Eliminar reserva</button>
        </form>
      {/if}
    </div>
  {/if}

</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/(app)/bookings/[id]/+page.svelte
git commit -m "feat(ui): rebuild booking detail page with mobile-first grid layout"
```

---

## Task 8: Update services sessions page to use SessionCard

**Files:**
- Modify: `src/routes/(app)/services/[id]/sessions/+page.svelte`

- [ ] **Step 1: Read the current file first**

```bash
cat src/routes/(app)/services/\[id\]/sessions/+page.svelte
```

- [ ] **Step 2: Replace session list rendering with SessionCard (mode=service)**

Find the loop that renders individual sessions. Replace the inline session rendering with:

```svelte
<script lang="ts">
  // Add import at top:
  import SessionCard from '$lib/components/sessions/SessionCard.svelte'
</script>

<!-- Replace the existing session card markup inside the loop with: -->
{#each sessions as session (session.id)}
  <SessionCard
    {session}
    mode="service"
    instructors={data.instructors ?? []}
    capacity={data.service?.maxCapacity ?? null}
  />
{/each}
```

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/services/\[id\]/sessions/+page.svelte
git commit -m "refactor(sessions): reuse SessionCard component on service sessions page"
```

---

## Task 9: Update sessions BookingDetailCard to delegate to SessionCard

**Files:**
- Modify: `src/lib/modules/sessions/BookingDetailCard.svelte`

- [ ] **Step 1: Replace booking-mode session rendering**

In `src/lib/modules/sessions/BookingDetailCard.svelte`, find the `{#if !sessionOwnerType || sessionOwnerType === 'booking'}` block. Replace the inner session card markup with `SessionCard`:

```svelte
<script lang="ts">
  // Add at top:
  import SessionCard from '$lib/components/sessions/SessionCard.svelte'
</script>

<!-- Replace the session loop inside the booking context block: -->
<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
  {#each Object.values(sessionsByDate()).flat() as session (session.id)}
    <SessionCard
      {session}
      mode="booking"
      participantPool={allParticipants}
      {instructors}
      bookingId={booking.id}
      bookingStatus={booking.status}
    />
  {/each}
</div>
```

The service-mode and edition-mode blocks at the bottom of the file stay unchanged for now.

- [ ] **Step 2: Commit**

```bash
git add src/lib/modules/sessions/BookingDetailCard.svelte
git commit -m "refactor(sessions): delegate booking-mode rendering to SessionCard component"
```

---

## Task 10: Wire up load function for inventory per-participant

The `addAlloc` action in `+page.server.ts` needs to accept and pass through `bookingParticipantId`. The inventory section in the page uses `data.booking.allocations` which comes from `getBooking`.

- [ ] **Step 1: Check that getBooking returns allocations with bookingParticipantId**

```bash
grep -n 'bookingParticipantId\|allocations' src/lib/features/bookings/queries.ts | head -20
```

- [ ] **Step 2: If missing, update the allocation select in queries.ts**

Find the query that loads `booking.allocations` and add the new column:

```ts
// In the allocations select, add:
bookingParticipantId: inventoryAllocations.bookingParticipantId,
```

And update `InventoryAllocationWithDetails` in `src/lib/features/inventory/types.ts` to include it (already done in Task 3).

- [ ] **Step 3: Update addAlloc action to accept bookingParticipantId**

In `src/routes/(app)/bookings/[id]/+page.server.ts`, in the `addAlloc` action, add:

```ts
const bookingParticipantId = form.get('bookingParticipantId')?.toString() || null
// Pass it through to createAllocation:
await createAllocation({
  bookingId: params.id,
  bookingParticipantId,   // ← add this
  itemTypeId,
  // ...rest unchanged
})
```

- [ ] **Step 4: Commit**

```bash
git add src/lib/features/bookings/queries.ts src/lib/features/inventory/types.ts src/routes/(app)/bookings/[id]/+page.server.ts
git commit -m "feat(inventory): thread bookingParticipantId through allocation load and create"
```

---

## Task 11: Manual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev
```

- [ ] **Step 2: Test mobile layout**

Open a booking at `/bookings/[id]`. In browser devtools, toggle mobile viewport (375px). Verify:
- Cards stack in single column
- Session cards stack (date above, participants below)
- No horizontal overflow

- [ ] **Step 3: Test desktop layout**

Switch to desktop viewport (1280px). Verify:
- Top row shows 3 columns (Service | Client | Payment)
- Session cards appear in 2-column grid
- Inventory per-participant rows

- [ ] **Step 4: Test participant CRUD**

1. Bulk add names → all appear in participant list
2. Edit a name → saves correctly
3. Remove a participant with sessions → warning shows counts → confirm removes from sessions too

- [ ] **Step 5: Test payment per participant**

If service uses `per_person_per_session` pricing: expand per-participant payment rows, update amount paid, verify status badge updates.

- [ ] **Step 6: Test session modal**

Click "+ Nueva sesión" → modal opens, "New session" tab shows form, close ✕ works.
Click "🔗 Vincular" → "Link existing" tab shows available sessions with participant counts.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: booking detail redesign complete — mobile-first grid, SessionCard, per-participant model"
```

---

## Notes

- `per_person_per_session` already exists in `pricingModeEnum` — no new enum value needed.
- The unique partial index on `booking_clients` (`WHERE status = 'enrolled'`) allows a booking to have one active client but retains historical cancelled rows safely.
- `SessionPickerModal` receives `availableSessions=[]` in the initial page build — Task 10 extension: load service sessions in the `load` function filtered by date range, structured as `ModalSession[]`. This can be a follow-up if the modal's link tab needs to be fully populated.
- The `getRemovalImpact` action uses a raw `fetch` in the Svelte component to avoid a full page reload just to show the warning. This is intentional.
