# UI Full Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete UI consistency — unified SessionCard component, full StatusBadge coverage for roles/tracking modes, client-grouped participant display, all inline badge maps replaced.

**Architecture:** Six tasks in dependency order: StatusBadge variants first (no deps), then query type extensions, then unified SessionCard component, then consumer migration, then deletion, then page cleanups.

**Tech Stack:** SvelteKit 2 + Svelte 5 (runes), TypeScript, Tailwind CSS v4, Drizzle ORM + PostgreSQL, `use:enhance` + `withToast()` for form submissions.

---

## Context for implementers

### Design system tokens
- `text-navy`, `text-ocean`, `text-muted`, `border-border`, `bg-surface`, `bg-sand`
- `rounded-(--radius-card)` for cards
- `btn-primary btn-sm` for action buttons
- `input` class for form inputs

### Component locations
- `src/lib/components/ui/StatusBadge.svelte` — badge component
- `src/lib/components/sessions/SessionCard.svelte` — existing (to be rewritten)
- `src/lib/components/sessions/SessionListCard.svelte` — existing (to be deleted)
- `src/lib/features/sessions/types.ts` — Session, SessionSurface, etc.
- `src/lib/features/sessions/queries.ts` — all session DB queries

### Key types
```typescript
// Session — base session from DB (has .participants: SessionParticipant[])
// SessionSurface — enriched session used by agenda/calendar (has .participantNames, .firstClientName)
// AgendaSession extends SessionSurface — used by listSessionsForDateRange
// SessionForDay extends SessionSurface — used by calendar
```

### Existing attachment helpers pattern (in queries.ts)
```typescript
// Pattern: attachX takes rows with .id, does batch query, returns rows + new field
async function attachInstructors<T extends { id: string }>(rows: T[]): Promise<(T & { instructors: SessionInstructor[] })[]>
async function attachParticipants<T extends { id: string }>(rows: T[]): Promise<(T & { participants: SessionParticipant[] })[]>
// You will add: attachClientGroups<T extends { id: string; participants: SessionParticipant[] }>(rows: T[])
```

### DB schema FK chain for clientGroups
`session_participants.bookingParticipantId → booking_participants.id → booking_participants.bookingClientId → booking_clients.id → booking_clients.clientId → clients.id`

### withToast + enhance pattern
```typescript
import { enhance } from '$app/forms';
import { withToast } from '$lib/utils/enhance';
// Usage: use:enhance={withToast()} or use:enhance={withToast(() => { callback(); })}
```

---

## Task 1: StatusBadge — 7 new variants

**Files:**
- Modify: `src/lib/components/ui/StatusBadge.svelte`

- [ ] **Step 1: Add new variants**

Replace the existing file content. Add 7 variants to the union type and both maps:

```svelte
<!-- src/lib/components/ui/StatusBadge.svelte -->
<script lang="ts">
	export type StatusVariant =
		| 'confirmed' | 'pending' | 'cancelled'
		| 'paid' | 'partial'
		| 'active' | 'completed' | 'unscheduled'
		| 'beginner' | 'intermediate' | 'advanced'
		| 'admin' | 'owner' | 'manager' | 'instructor' | 'banned'
		| 'pool' | 'specific';

	const COLORS: Record<StatusVariant, string> = {
		confirmed:    'bg-green-100 text-green-700',
		paid:         'bg-green-100 text-green-700',
		advanced:     'bg-green-100 text-green-700',
		completed:    'bg-green-100 text-green-700',
		instructor:   'bg-green-100 text-green-700',
		pending:      'bg-amber-100 text-amber-700',
		partial:      'bg-amber-100 text-amber-700',
		intermediate: 'bg-amber-100 text-amber-700',
		unscheduled:  'bg-amber-100 text-amber-700',
		cancelled:    'bg-red-100 text-red-600',
		banned:       'bg-red-100 text-red-600',
		admin:        'bg-red-100 text-red-700',
		active:       'bg-blue-100 text-blue-700',
		beginner:     'bg-blue-100 text-blue-700',
		owner:        'bg-blue-100 text-blue-700',
		pool:         'bg-blue-100 text-blue-700',
		manager:      'bg-purple-100 text-purple-700',
		specific:     'bg-emerald-100 text-emerald-700',
	};

	const DEFAULT_LABELS: Record<StatusVariant, string> = {
		confirmed:    'confirmado',
		pending:      'pendiente',
		cancelled:    'cancelado',
		paid:         'pagado',
		partial:      'parcial',
		active:       'activa',
		completed:    'completada',
		unscheduled:  'sin horario',
		beginner:     'principiante',
		intermediate: 'intermedio',
		advanced:     'avanzado',
		admin:        'administrador',
		owner:        'propietario',
		manager:      'gestor',
		instructor:   'instructor',
		banned:       'bloqueado',
		pool:         'piscina',
		specific:     'específico',
	};

	let {
		variant,
		label,
		class: className = ''
	}: {
		variant: StatusVariant | string;
		label?: string;
		class?: string;
	} = $props();

	const colorClass = $derived(COLORS[variant as StatusVariant] ?? 'bg-gray-100 text-gray-500');
	const displayLabel = $derived(label ?? DEFAULT_LABELS[variant as StatusVariant] ?? variant);
</script>

<span class="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold {colorClass} {className}">
	{displayLabel}
</span>
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/ui/StatusBadge.svelte
git commit -m "feat(ui): extend StatusBadge with role and tracking mode variants"
```

---

## Task 2: ClientGroup type + attachClientGroups query helper

**Files:**
- Modify: `src/lib/features/sessions/types.ts`
- Modify: `src/lib/features/sessions/queries.ts`

- [ ] **Step 1: Add ClientGroup and SessionWithGroups to types.ts**

In `src/lib/features/sessions/types.ts`, add these two interfaces after the `ClientSessionSummary` interface (after line 79):

```typescript
export interface ClientGroup {
	clientName: string;        // always "First Last", never "Last, First"
	bookingId: string;
	participants: { id: string; name: string }[];
}

export interface SessionWithGroups extends Session {
	clientGroups: ClientGroup[];
	participantNames: string[];
}
```

Also add `clientGroups: ClientGroup[]` to the `SessionSurface` interface. The interface currently ends with `totalAmountPaid: number;`. Add after that line:

```typescript
clientGroups: ClientGroup[];
```

- [ ] **Step 2: Import ClientGroup in queries.ts**

At the top of `src/lib/features/sessions/queries.ts`, add `ClientGroup` and `SessionWithGroups` to the existing type import block:

```typescript
import type {
	AgendaSession,
	BaseSessionInput,
	BookingEnrollment,
	BookingSessionContext,
	BulkGenOptions,
	ClientGroup,
	ClientSessionSummary,
	CreateParticipantInput,
	CreateSessionInput,
	Session,
	SessionContext,
	SessionForDay,
	SessionInstructor,
	SessionOwnerType,
	SessionParticipant,
	SessionWithGroups,
	UpdateSessionInput
} from './types';
```

- [ ] **Step 3: Add attachClientGroups helper to queries.ts**

Add this function after `attachParticipants` (after line ~113 in queries.ts, before the `BookingClientRow` type):

```typescript
async function attachClientGroups<T extends { id: string; participants: SessionParticipant[] }>(
	sessionRows: T[]
): Promise<(T & { clientGroups: ClientGroup[]; participantNames: string[] })[]> {
	if (sessionRows.length === 0)
		return sessionRows.map((s) => ({ ...s, clientGroups: [], participantNames: [] }));

	// Collect all bookingParticipantIds that are linked
	const linkedPairs: { sessionId: string; bpId: string }[] = [];
	for (const s of sessionRows) {
		for (const p of s.participants) {
			if (p.bookingParticipantId) linkedPairs.push({ sessionId: s.id, bpId: p.bookingParticipantId });
		}
	}

	const bpIds = [...new Set(linkedPairs.map((lp) => lp.bpId))];

	if (bpIds.length === 0) {
		return sessionRows.map((s) => ({
			...s,
			clientGroups: [],
			participantNames: s.participants.map((p) => p.name).filter(Boolean)
		}));
	}

	const rows = await db
		.select({
			bookingParticipantId: bookingParticipants.id,
			bookingId: bookingClients.bookingId,
			clientFirstName: clients.firstName,
			clientLastName: clients.lastName
		})
		.from(bookingParticipants)
		.innerJoin(bookingClients, eq(bookingParticipants.bookingClientId, bookingClients.id))
		.innerJoin(clients, eq(bookingClients.clientId, clients.id))
		.where(inArray(bookingParticipants.id, bpIds));

	// Map: bookingParticipantId → { bookingId, clientName }
	const bpMeta = new Map<string, { bookingId: string; clientName: string }>();
	for (const row of rows) {
		bpMeta.set(row.bookingParticipantId, {
			bookingId: row.bookingId,
			clientName: [row.clientFirstName, row.clientLastName].filter(Boolean).join(' ') || 'Desconocido'
		});
	}

	return sessionRows.map((s) => {
		// Group participants by bookingId
		const byBooking = new Map<string, { clientName: string; participants: { id: string; name: string }[] }>();
		const unlinkedNames: string[] = [];

		for (const p of s.participants) {
			if (p.bookingParticipantId && bpMeta.has(p.bookingParticipantId)) {
				const meta = bpMeta.get(p.bookingParticipantId)!;
				const group = byBooking.get(meta.bookingId) ?? { clientName: meta.clientName, participants: [] };
				group.participants.push({ id: p.id, name: p.name });
				byBooking.set(meta.bookingId, group);
			} else {
				unlinkedNames.push(p.name);
			}
		}

		const clientGroups: ClientGroup[] = [...byBooking.entries()].map(([bookingId, group]) => ({
			clientName: group.clientName,
			bookingId,
			participants: group.participants
		}));

		const participantNames = [
			...clientGroups.flatMap((g) => g.participants.map((p) => p.name)),
			...unlinkedNames
		].filter(Boolean);

		return { ...s, clientGroups, participantNames };
	});
}
```

- [ ] **Step 4: Update listSessionsForService to return SessionWithGroups[]**

Find `listSessionsForService` (around line 274). Change its return type and add `attachClientGroups` call:

```typescript
export async function listSessionsForService(
	serviceId: string,
	from?: string,
	to?: string
): Promise<SessionWithGroups[]> {
	const conditions = [eq(sessions.serviceId, serviceId), eq(sessions.ownerType, 'service')];
	if (from) conditions.push(gte(sessions.date, from));
	if (to) conditions.push(lte(sessions.date, to));
	const rows = await db
		.select(SESSION_COLS)
		.from(sessions)
		.where(and(...conditions))
		.orderBy(sessions.date, sessions.sortOrder, sessions.time);
	const wi = await attachInstructors(rows as Omit<Session, 'instructors' | 'participants'>[]);
	const wb = await attachParticipants(wi);
	return attachClientGroups(wb);
}
```

- [ ] **Step 5: Update listSessionsForEdition to return SessionWithGroups[]**

Find `listSessionsForEdition` (around line 291). Change return type and add `attachClientGroups`:

```typescript
export async function listSessionsForEdition(editionId: string): Promise<SessionWithGroups[]> {
	const rows = await db
		.select(SESSION_COLS)
		.from(sessions)
		.where(and(eq(sessions.serviceEditionId, editionId), eq(sessions.ownerType, 'edition')))
		.orderBy(sessions.date, sessions.sortOrder, sessions.time);
	const wi = await attachInstructors(rows as Omit<Session, 'instructors' | 'participants'>[]);
	const wb = await attachParticipants(wi);
	return attachClientGroups(wb);
}
```

- [ ] **Step 6: Add clientGroups to enrichBookingOwnedForAgenda**

Find `enrichBookingOwnedForAgenda` (search for the function name). It returns `AgendaSession[]`. After building `wb` (the sessions with participants attached), add `attachClientGroups` and spread the result:

Inside the function, find where it maps `rows` to build the final `AgendaSession` objects and adds `participantNames`. Add `clientGroups` to each return object:

```typescript
// After: const wb = await attachParticipants(wi);
// Add:
const wg = await attachClientGroups(wb);
// Then in the .map(), use wg instead of wb/rows, and spread clientGroups:
return wg.map((s) => {
    // ... existing spread ...
    return {
        ...s,
        // ... existing fields ...
        clientGroups: s.clientGroups,   // add this line
    } satisfies AgendaSession;
});
```

Note: `enrichBookingOwnedForAgenda`, `enrichServiceOwnedForAgenda`, and `enrichEditionOwnedForAgenda` all need this treatment. Find each one by searching for `satisfies AgendaSession` in queries.ts. For each, add `attachClientGroups` after `attachParticipants` and add `clientGroups: s.clientGroups` to the returned object.

- [ ] **Step 7: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors. If AgendaSession errors about `clientGroups` missing, verify you added it to `SessionSurface` in types.ts in Step 1.

- [ ] **Step 8: Commit**

```bash
git add src/lib/features/sessions/types.ts src/lib/features/sessions/queries.ts
git commit -m "feat(queries): add ClientGroup type and attachClientGroups helper to session queries"
```

---

## Task 3: Unified SessionCard component

**Files:**
- Modify: `src/lib/components/sessions/SessionCard.svelte` — full rewrite

This replaces BOTH the old `SessionCard.svelte` (288 lines, booking detail) AND `SessionListCard.svelte` (198 lines, session lists) with a single unified component.

**Design rules (from spec):**
- Card frame: `rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden`
- When `openHref` is set, wrap entire card in `<a>` tag (no separate "Abrir" link)
- Time block: neutral `text-gray-900` bold, shows start + end + duration in ALL modes
- Footer: `<StatusBadge>` left · Edit + Cancel text buttons right
- Client groups: `bg-gray-50 border border-gray-200 rounded-lg p-2` box per client; client name as "First Last" + optional link to `/bookings/[bookingId]`; participant chips/rows inside
- List mode: `color-bar (w-1) | time-block (w-[72px]) | body | footer`
- Booking mode: `left-panel (w-[36%]) | right-panel (flex-1) | footer`

- [ ] **Step 1: Write the new unified SessionCard**

Replace the entire contents of `src/lib/components/sessions/SessionCard.svelte`:

```svelte
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import { User } from 'lucide-svelte';
	import type { Session, ClientGroup } from '$lib/features/sessions/types';
	import type { BookingParticipant } from '$lib/features/bookings/types';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	interface ServiceColor {
		bg: string;
		border: string;
		text?: string;
	}

	interface Instructor {
		id: string;
		name: string;
	}

	let {
		session,
		mode = 'list',
		// list mode
		color,
		openHref,
		showDate = false,
		hiddenFields = {},
		updateAction = '?/updateSession',
		cancelAction = '?/cancelSession',
		deleteAction,
		// booking mode
		canEditInstructors = false,
		participantPool = [],
		bookingId = '',
		bookingStatus = 'confirmed',
		bookingClientName = '',
		capacity = null,
		onLink,
		// shared
		clientGroups,
		participantNames,
		instructors = [],
		children,
		extraContent
	}: {
		session: Session;
		mode?: 'list' | 'booking';
		// list
		color?: ServiceColor;
		openHref?: string;
		showDate?: boolean;
		hiddenFields?: Record<string, string>;
		updateAction?: string;
		cancelAction?: string;
		deleteAction?: string;
		// booking
		canEditInstructors?: boolean;
		participantPool?: BookingParticipant[];
		bookingId?: string;
		bookingStatus?: string;
		bookingClientName?: string;
		capacity?: number | null;
		onLink?: (sessionId: string) => void;
		// shared
		clientGroups?: ClientGroup[];
		participantNames?: string[];
		instructors?: Instructor[];
		children?: Snippet;
		extraContent?: Snippet;
	} = $props();

	const isCancelled = $derived(
		session.status === 'cancelled' || bookingStatus === 'cancelled'
	);
	const dur = $derived(
		(session as any).effectiveDuration ?? session.durationMinutes
	);
	const takenCount = $derived(session.participants.length);
	const fillPct = $derived(capacity ? Math.min(100, (takenCount / capacity) * 100) : 0);
	const capacityColor = $derived(
		fillPct >= 100 ? 'bg-red-500' : fillPct >= 75 ? 'bg-amber-400' : 'bg-green-500'
	);

	const chips = $derived(
		clientGroups && clientGroups.length > 0
			? []  // groups shown as boxes, not flat chips
			: (participantNames ?? session.participants.map((p) => p.name))
	);

	let editing = $state(false);

	function fmtTime(t: string | null) { return t?.slice(0, 5) ?? '—'; }
	function fmtDateShort(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
			weekday: 'short', day: 'numeric', month: 'short'
		});
	}
	function endTime(t: string, mins: number) {
		const [h, min] = t.split(':').map(Number);
		const total = h * 60 + min + mins;
		return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
	}

	const sessionStatusVariant = $derived(
		session.status === 'cancelled'   ? 'cancelled'   :
		session.status === 'completed'   ? 'completed'   :
		session.status === 'unscheduled' ? 'unscheduled' :
		'active'
	);

	// Booking mode: which pool participants are already in this session
	function isInSession(bp: BookingParticipant): boolean {
		return session.participants.some(
			(sp) => sp.bookingParticipantId === bp.id || sp.name === bp.name
		);
	}
	function sessionParticipantId(bp: BookingParticipant): string | undefined {
		return session.participants.find(
			(sp) => sp.bookingParticipantId === bp.id || sp.name === bp.name
		)?.id;
	}
</script>

{#snippet timeBlock()}
	<div class="flex w-[72px] shrink-0 flex-col items-center justify-center border-r border-gray-100 bg-gray-50/60 py-3">
		{#if showDate && mode === 'list'}
			<p class="text-[9px] font-medium text-muted">{fmtDateShort(session.date)}</p>
		{/if}
		{#if mode === 'booking'}
			<p class="text-[9px] font-bold uppercase tracking-wide text-muted">{fmtDateShort(session.date)}</p>
		{/if}
		{#if session.time}
			<p class="text-[15px] font-bold leading-none text-gray-900">{fmtTime(session.time)}</p>
			{#if dur}
				<p class="mt-0.5 text-[10px] text-gray-500">→ {endTime(fmtTime(session.time), dur)}</p>
				<p class="mt-0.5 text-[9px] text-gray-400">{dur} min</p>
			{/if}
		{:else}
			<p class="mt-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700">sin hora</p>
		{/if}
	</div>
{/snippet}

{#snippet clientGroupBoxes(groups: ClientGroup[], editable: boolean)}
	{#each groups as group}
		<div class="mb-1.5 rounded-lg border border-gray-200 bg-gray-50 p-2 last:mb-0">
			<div class="mb-1.5 flex items-center gap-1.5">
				{#if group.bookingId}
					<a href="/bookings/{group.bookingId}"
						class="text-[10px] font-semibold text-navy hover:underline"
						onclick={(e) => e.stopPropagation()}>
						{group.clientName}
					</a>
				{:else}
					<span class="text-[10px] font-semibold text-navy">{group.clientName}</span>
				{/if}
			</div>
			{#if editable}
				<!-- Booking mode: participant rows with add/remove -->
				{#each participantPool as bp (bp.id)}
					{@const inSess = isInSession(bp)}
					{@const spId = sessionParticipantId(bp)}
					{#if inSess}
						<div class="flex items-center justify-between rounded bg-green-50 px-2 py-1 mb-1">
							<span class="text-[11px] font-medium text-gray-900">✓ {bp.name}</span>
							{#if !isCancelled}
								<form method="post" action="?/removeParticipant" use:enhance={withToast()}>
									<input type="hidden" name="participantId" value={spId} />
									<button type="submit"
										onclick={(e) => e.stopPropagation()}
										class="text-[9px] text-gray-300 hover:text-red-400">remove</button>
								</form>
							{/if}
						</div>
					{:else if !isCancelled}
						<form method="post" action="?/addParticipant" use:enhance={withToast()}
							class="flex items-center justify-between rounded px-2 py-1 mb-1 hover:bg-green-50/40">
							<input type="hidden" name="sessionId" value={session.id} />
							<input type="hidden" name="participantName" value={bp.name} />
							<input type="hidden" name="bookingParticipantId" value={bp.id} />
							<span class="text-[11px] text-gray-400">○ {bp.name}</span>
							<button type="submit"
								onclick={(e) => e.stopPropagation()}
								class="text-[9px] font-semibold text-green-600">add</button>
						</form>
					{:else}
						<div class="rounded bg-gray-50 px-2 py-1 mb-1">
							<span class="text-[11px] text-gray-400">○ {bp.name}</span>
						</div>
					{/if}
				{/each}
				{#if participantPool.length === 0}
					<p class="text-[11px] italic text-gray-400">Sin participantes configurados.</p>
				{/if}
			{:else}
				<!-- List mode: read-only participant chips -->
				<div class="flex flex-wrap gap-1">
					{#each group.participants as p}
						<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-medium text-blue-700">{p.name}</span>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
{/snippet}

{#snippet footer()}
	<div class="flex items-center justify-between border-t border-gray-100 bg-gray-50/40 px-3 py-1.5">
		<StatusBadge variant={sessionStatusVariant} />
		<div class="flex items-center gap-3">
			{#if mode === 'modal' && onLink}
				<button type="button" onclick={() => onLink!(session.id)}
					class="rounded-md bg-green-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-green-700">
					Vincular
				</button>
			{:else}
				{#if !isCancelled}
					<button type="button" onclick={(e) => { e.preventDefault(); editing = !editing; }}
						class="text-[10px] text-gray-400 hover:text-gray-700">Editar</button>
				{/if}
				{#if !isCancelled && session.status !== 'cancelled'}
					<form method="POST" action={cancelAction} use:enhance={withToast()}>
						{#each Object.entries(hiddenFields) as [k, v]}
							<input type="hidden" name={k} value={v} />
						{/each}
						<button type="submit"
							onclick={(e) => { e.stopPropagation(); if (!confirm('¿Cancelar sesión?')) e.preventDefault(); }}
							class="text-[10px] text-red-400 hover:text-red-600">Cancelar</button>
					</form>
				{/if}
				{#if deleteAction}
					<form method="POST" action={deleteAction} use:enhance={withToast()}>
						{#each Object.entries(hiddenFields) as [k, v]}
							<input type="hidden" name={k} value={v} />
						{/each}
						<button type="submit"
							onclick={(e) => { e.stopPropagation(); if (!confirm('¿Eliminar sesión?')) e.preventDefault(); }}
							class="text-[10px] text-gray-300 hover:text-red-500">Eliminar</button>
					</form>
				{/if}
			{/if}
		</div>
	</div>
{/snippet}

{#snippet editForm()}
	{#if editing}
		<form method="POST" action={updateAction}
			use:enhance={withToast(() => { editing = false; })}
			class="grid grid-cols-2 gap-2 border-t border-gray-100 bg-gray-50 px-3 py-3">
			{#each Object.entries(hiddenFields) as [k, v]}
				<input type="hidden" name={k} value={v} />
			{/each}
			{#if mode === 'booking'}
				<input type="hidden" name="sessionId" value={session.id} />
			{/if}
			<div>
				<label class="mb-0.5 block text-[10px] text-muted">Hora</label>
				<input name={mode === 'booking' ? 'sessionTime' : 'time'} type="time"
					value={session.time ?? ''} class="input w-full text-xs" />
			</div>
			<div>
				<label class="mb-0.5 block text-[10px] text-muted">Duración (min)</label>
				<input name={mode === 'booking' ? 'sessionDuration' : 'durationMinutes'}
					type="number" min="1" value={dur ?? ''} class="input w-full text-xs" />
			</div>
			{#if instructors.length > 0 && mode !== 'booking'}
				<div class="col-span-2">
					<label class="mb-0.5 block text-[10px] text-muted">Monitor</label>
					<select name="instructorId" class="input w-full text-xs">
						<option value="">Sin asignar</option>
						{#each instructors as inst}
							<option value={inst.id} selected={session.instructors.some(i => i.instructorId === inst.id)}>
								{inst.name}
							</option>
						{/each}
					</select>
				</div>
			{/if}
			{#if mode !== 'booking'}
				<div class="col-span-2">
					<label class="mb-0.5 block text-[10px] text-muted">Notas</label>
					<input name="notes" type="text" value={session.notes ?? ''} class="input w-full text-xs" />
				</div>
			{/if}
			<div class="col-span-2 flex gap-2">
				<button type="submit" class="btn-primary btn-sm text-xs">Guardar</button>
				<button type="button" onclick={() => editing = false} class="text-xs text-muted">Cancelar</button>
			</div>
		</form>
	{/if}
{/snippet}

<!-- ═══════════════════════════════════════════════════════════ LIST MODE -->
{#if mode === 'list'}
	{@const cardContent}
		<div class="flex items-stretch">
			{#if color}
				<div class="w-1 shrink-0 rounded-l-xl {color.bg}"></div>
			{/if}
			{@render timeBlock()}
			<div class="min-w-0 flex-1 p-3">
				<!-- Header slot -->
				{#if children}
					<div class="mb-2">
						{@render children()}
					</div>
				{/if}
				<!-- Instructor row -->
				{#if session.instructors.length > 0}
					<p class="mb-2 flex items-center gap-1 text-[10px] text-muted">
						<span class="text-gray-400">Instructor:</span>
						<span class="text-gray-700">
							{session.instructors.map(i => i.instructorName?.split(' ')[0]).filter(Boolean).join(', ')}
						</span>
					</p>
				{:else if instructors.length === 0}
					<p class="mb-2 text-[10px] text-gray-300">Sin instructor</p>
				{/if}
				<!-- Client groups or flat chips -->
				{#if clientGroups && clientGroups.length > 0}
					{@render clientGroupBoxes(clientGroups, false)}
				{:else if chips.length > 0}
					<div class="flex flex-wrap gap-1">
						{#each chips as name}
							<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-medium text-blue-700">{name}</span>
						{/each}
					</div>
				{/if}
				<!-- Notes -->
				{#if session.notes}
					<p class="mt-1 truncate text-[10px] italic text-gray-400">{session.notes}</p>
				{/if}
			</div>
		</div>
		<!-- Extra content (e.g. enrollment list for group sessions) -->
		{#if extraContent}
			{@render extraContent()}
		{/if}
		{@render footer()}
		{@render editForm()}
	{/@const}

	{#if openHref}
		<a href={openHref}
			class="block overflow-hidden rounded-xl border {isCancelled ? 'border-red-100 opacity-60' : 'border-gray-200'} bg-white shadow-sm transition-all hover:border-ocean/30 hover:shadow-md">
			{@render cardContent}
		</a>
	{:else}
		<div class="overflow-hidden rounded-xl border {isCancelled ? 'border-red-100 opacity-60' : 'border-gray-200'} bg-white shadow-sm">
			{@render cardContent}
		</div>
	{/if}

<!-- ════════════════════════════════════════════════════════ BOOKING MODE -->
{:else if mode === 'booking'}
	{@const bookingGroup: ClientGroup = {
		clientName: bookingClientName,
		bookingId: bookingId,
		participants: []  // not used in editable mode — participantPool drives rendering
	}}

	{@const cardContent}
		<div class="flex">
			<!-- Left panel: date + time + instructors -->
			<div class="w-[36%] border-r border-gray-100 bg-gray-50/60 p-3">
				{@render timeBlock()}
				{#if instructors.length > 0}
					<div class="mt-3 border-t border-gray-100 pt-3">
						<div class="mb-1.5 text-[9px] font-bold uppercase tracking-wide text-gray-400">Instructor</div>
						{#each instructors as inst (inst.id)}
							{@const assigned = session.instructors.some(si => si.instructorId === inst.id)}
							<label class="mb-1 flex cursor-pointer items-center gap-1.5">
								{#if canEditInstructors && !isCancelled}
									<form method="post" action="?/updateSession" use:enhance={withToast()}>
										<input type="hidden" name="sessionId" value={session.id} />
										<input type="checkbox" name="sessionInstructorId" value={inst.id}
											checked={assigned} class="h-3 w-3 accent-green-600"
											onchange={(e) => { e.stopPropagation(); (e.target as HTMLInputElement).form?.requestSubmit(); }} />
									</form>
								{:else}
									<input type="checkbox" checked={assigned} disabled class="h-3 w-3 accent-green-600" />
								{/if}
								<span class="text-[11px] text-gray-700">{inst.name}</span>
							</label>
						{/each}
					</div>
				{:else if session.instructors.length > 0}
					<div class="mt-2 text-[10px] text-gray-500">
						{session.instructors.map(i => i.instructorName).filter(Boolean).join(', ')}
					</div>
				{/if}
			</div>

			<!-- Right panel: participants -->
			<div class="flex-1 p-3">
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
				<!-- Current booking's client group with add/remove -->
				{#if bookingClientName}
					{@render clientGroupBoxes([{ clientName: bookingClientName, bookingId, participants: [] }], true)}
				{:else if participantPool.length > 0}
					{@render clientGroupBoxes([{ clientName: 'Participantes', bookingId, participants: [] }], true)}
				{/if}
				<!-- Other groups (read-only) from clientGroups prop -->
				{#if clientGroups && clientGroups.length > 0}
					{@render clientGroupBoxes(clientGroups.filter(g => g.bookingId !== bookingId), false)}
				{/if}
			</div>
		</div>
		{#if extraContent}
			{@render extraContent()}
		{/if}
		{@render footer()}
		{@render editForm()}
	{/@const}

	{#if openHref}
		<a href={openHref}
			class="block overflow-hidden rounded-xl border {isCancelled ? 'border-red-100 opacity-60' : 'border-gray-200'} bg-white shadow-sm transition-all hover:border-ocean/30 hover:shadow-md">
			{@render cardContent}
		</a>
	{:else}
		<div class="overflow-hidden rounded-xl border {isCancelled ? 'border-red-100 opacity-60' : 'border-gray-200'} bg-white shadow-sm">
			{@render cardContent}
		</div>
	{/if}
{/if}
```

**Note on `{@const}` + `{@render}` pattern:** Svelte 5 does not support `{@const cardContent}` with `{@render}`. Instead, extract the shared card body into a snippet at the top of the component. The correct pattern is:

```svelte
{#snippet cardBody()}
  <!-- all content here -->
{/snippet}

{#if openHref}
  <a href={openHref} class="...">
    {@render cardBody()}
  </a>
{:else}
  <div class="...">
    {@render cardBody()}
  </div>
{/if}
```

Apply this pattern for both `mode="list"` and `mode="booking"` sections.

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Fix any type errors before proceeding.

- [ ] **Step 3: Commit**

```bash
git add src/lib/components/sessions/SessionCard.svelte
git commit -m "feat(sessions): unified SessionCard component (list + booking modes)"
```

---

## Task 4: Migrate all SessionListCard consumers

**Files:**
- Modify: `src/routes/(app)/sessions/+page.svelte`
- Modify: `src/routes/(app)/services/[id]/sessions/+page.svelte`
- Modify: `src/routes/(app)/services/[id]/roster/+page.svelte`
- Modify: `src/routes/(app)/bookings/[id]/+page.svelte`

### 4a: sessions/+page.svelte

- [ ] **Step 1: Update import**

In `src/routes/(app)/sessions/+page.svelte`, change line 5:
```svelte
<!-- remove: -->
import SessionListCard from '$lib/components/sessions/SessionListCard.svelte';
<!-- add: -->
import SessionCard from '$lib/components/sessions/SessionCard.svelte';
```

- [ ] **Step 2: Update SessionListCard usage → SessionCard**

Find the `<SessionListCard` usage in the template (around line 65) and replace with `<SessionCard`. The props map directly:

```svelte
<SessionCard
    session={s}
    {color}
    openHref="/sessions/{s.id}"
    updateAction="?/updateSession"
    cancelAction="?/cancelSession"
    hiddenFields={{ sessionId: s.id }}
    clientGroups={s.clientGroups}
    participantNames={s.participantNames}
>
    {#snippet children()}
        <p class="truncate text-sm font-semibold text-gray-900">{s.serviceName ?? '—'}</p>
        {#if s.ownerType === 'booking' && s.firstClientName}
            <p class="text-xs font-medium text-ocean">
                <a href="/bookings/{s.bookingId}" class="hover:underline">{s.firstClientName}</a>
            </p>
        {:else if (s.enrolledCount ?? 0) > 0}
            <p class="text-xs text-muted">{s.enrolledCount} inscrito{s.enrolledCount !== 1 ? 's' : ''}</p>
        {/if}
    {/snippet}
</SessionCard>
```

Note: `s.clientGroups` is available because `listSessionsForDateRange` → `enrichBookingOwnedForAgenda` now attaches clientGroups (from Task 2 Step 6).

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

### 4b: services/[id]/sessions/+page.svelte

- [ ] **Step 4: Update import**

```svelte
<!-- remove: -->
import SessionListCard from '$lib/components/sessions/SessionListCard.svelte';
<!-- add: -->
import SessionCard from '$lib/components/sessions/SessionCard.svelte';
```

- [ ] **Step 5: Update SessionListCard usage → SessionCard**

Find the `<SessionListCard` usage (around line 184) and replace:

```svelte
<SessionCard
    session={s}
    {color}
    openHref="/sessions/{s.id}"
    updateAction="?/updateSession"
    cancelAction="?/cancelSession"
    deleteAction="?/deleteSession"
    instructors={data.instructors}
    hiddenFields={{ sessionId: s.id }}
    clientGroups={s.clientGroups}
    participantNames={s.participantNames}
>
    {#snippet children()}
        {#if activeEnrollments.length > 0}
            <p class="text-[11px] text-muted">
                {activeEnrollments.length} inscripción{activeEnrollments.length !== 1 ? 'es' : ''}
            </p>
        {/if}
    {/snippet}
    {#snippet extraContent()}
        {#if activeEnrollments.length > 0 && data.hasGroupSessions}
            <div class="border-t border-gray-100 px-3 py-2.5">
                <p class="mb-1.5 text-[10px] font-bold uppercase tracking-wide text-gray-400">Reservas</p>
                <ul class="space-y-1.5">
                    {#each activeEnrollments as e}
                        {@const paidAmt = parseFloat(e.amountPaid)}
                        {@const dueAmt = parseFloat(e.amountDue)}
                        <li class="flex items-center justify-between gap-2 text-xs">
                            <div class="flex items-center gap-2 min-w-0">
                                <a href="/bookings/{e.bookingId}" class="truncate font-medium text-navy hover:underline">
                                    {e.firstName ?? ''} {e.lastName ?? ''}
                                </a>
                                {#if paidAmt >= dueAmt && dueAmt > 0}
                                    <StatusBadge variant="paid" />
                                {:else if paidAmt > 0}
                                    <StatusBadge variant="partial" />
                                {:else}
                                    <StatusBadge variant="pending" />
                                {/if}
                            </div>
                            {#if s.status !== 'cancelled'}
                                <form method="POST" action="?/unassignFromSession" use:enhance={withToast()}>
                                    <input type="hidden" name="bookingId" value={e.bookingId} />
                                    <button type="submit" title="Desasignar"
                                        class="shrink-0 text-[10px] text-gray-300 hover:text-red-500">✕</button>
                                </form>
                            {/if}
                        </li>
                    {/each}
                </ul>
            </div>
        {/if}
    {/snippet}
</SessionCard>
```

Note: `s.clientGroups` is available because `listSessionsForService`/`listSessionsForEdition` now return `SessionWithGroups[]` (Task 2).

### 4c: services/[id]/roster/+page.svelte

- [ ] **Step 6: Update import**

```svelte
<!-- remove: -->
import SessionListCard from '$lib/components/sessions/SessionListCard.svelte';
<!-- add: -->
import SessionCard from '$lib/components/sessions/SessionCard.svelte';
```

- [ ] **Step 7: Update SessionListCard usage → SessionCard**

Find the `<SessionListCard` usage (in the edition sessions section) and replace with:

```svelte
<SessionCard
    session={s}
    {color}
    openHref="/sessions/{s.id}?from={encodeURIComponent('/services/' + data.service.id + '/roster?run=' + activeEditionId)}"
    updateAction="?/updateEditionSession"
    cancelAction="?/cancelEditionSession"
    deleteAction="?/deleteEditionSession"
    instructors={data.instructors}
    hiddenFields={{ sessionId: s.id, editionId: activeEditionId }}
    showDate={true}
    clientGroups={s.clientGroups}
>
    {#snippet children()}
        {#if s.participants.length > 0}
            <p class="text-[10px] text-muted">{s.participants.length} participante{s.participants.length !== 1 ? 's' : ''}</p>
        {:else}
            <p class="text-[10px] text-gray-300">Sin participantes</p>
        {/if}
    {/snippet}
</SessionCard>
```

### 4d: bookings/[id]/+page.svelte

- [ ] **Step 8: Update booking detail to use new SessionCard API**

In `src/routes/(app)/bookings/[id]/+page.svelte`:

1. The import is already `import SessionCard from '$lib/components/sessions/SessionCard.svelte'` — no change needed.

2. Add a derived for `bookingClientName` after the existing `bookingClient` derived (around line 36):

```typescript
const bookingClientName = $derived(
    bookingClient
        ? `${bookingClient.clientFirstName ?? ''} ${bookingClient.clientLastName ?? ''}`.trim()
        : ''
);
```

3. Find the `<SessionCard` usage (around line 459) and update props:

```svelte
<SessionCard
    {session}
    mode="booking"
    participantPool={participants}
    bookingClientName={bookingClientName}
    bookingId={data.booking.id}
    bookingStatus={data.booking.status}
    canEditInstructors={data.booking.status !== 'cancelled'}
    instructors={data.instructors}
    capacity={data.booking.serviceMaxCapacity}
    openHref="/sessions/{session.id}?from=/bookings/{data.booking.id}"
/>
```

- [ ] **Step 9: Type-check all four files**

```bash
npx tsc --noEmit
```

Fix any errors before committing.

- [ ] **Step 10: Commit**

```bash
git add "src/routes/(app)/sessions/+page.svelte" \
    "src/routes/(app)/services/[id]/sessions/+page.svelte" \
    "src/routes/(app)/services/[id]/roster/+page.svelte" \
    "src/routes/(app)/bookings/[id]/+page.svelte"
git commit -m "feat(sessions): migrate all SessionListCard consumers to unified SessionCard"
```

---

## Task 5: Delete SessionListCard.svelte

**Files:**
- Delete: `src/lib/components/sessions/SessionListCard.svelte`

- [ ] **Step 1: Verify zero remaining usages**

```bash
grep -r "SessionListCard" src/ --include="*.svelte" --include="*.ts"
```

Expected: no output. If any files still reference it, migrate them before deleting.

- [ ] **Step 2: Delete the file**

```bash
rm src/lib/components/sessions/SessionListCard.svelte
```

- [ ] **Step 3: Type-check**

```bash
npx tsc --noEmit
```

Expected: no errors related to SessionListCard.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(sessions): delete SessionListCard.svelte — absorbed into unified SessionCard"
```

---

## Task 6: Page cleanups

**Files:**
- Modify: `src/routes/(app)/staff/+page.svelte`
- Modify: `src/routes/(app)/inventory/+page.svelte`
- Modify: `src/routes/(app)/bookings/+page.svelte`
- Modify: `src/routes/(app)/bookings/[id]/+page.svelte`

### 6a: /staff/+page.svelte

- [ ] **Step 1: Replace ROLE_COLORS and banned span**

In `src/routes/(app)/staff/+page.svelte`:

Remove from script block:
```typescript
const ROLE_COLORS: Record<string, string> = {
    admin:      'bg-red-50 text-red-700',
    owner:      'bg-ocean/10 text-ocean',
    manager:    'bg-purple-50 text-purple-700',
    instructor: 'bg-green-50 text-green-700'
};
const ROLE_LABELS: Record<string, string> = {
    admin: 'Admin', owner: 'Owner', manager: 'Manager', instructor: 'Instructor'
};
```

Add import:
```svelte
import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
```

In template, replace the role span:
```svelte
<!-- remove: -->
<span class="rounded-full px-2 py-0.5 text-[10px] font-medium {ROLE_COLORS[r] ?? 'bg-gray-100 text-gray-600'}">
    {ROLE_LABELS[r] ?? r}
</span>
<!-- add: -->
<StatusBadge variant={r} />
```

Replace the banned span:
```svelte
<!-- remove: -->
<span class="rounded-full bg-red-50 px-2 py-0.5 text-[10px] text-red-600">{m.common_banned()}</span>
<!-- add: -->
<StatusBadge variant="banned" />
```

### 6b: /inventory/+page.svelte

- [ ] **Step 2: Replace tracking mode span**

In `src/routes/(app)/inventory/+page.svelte`:

Add import (after existing imports):
```svelte
import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
```

Replace the tracking mode span (line 45):
```svelte
<!-- remove: -->
<span class="rounded-full px-2 py-0.5 text-[10px] font-medium {type.trackingMode === 'pool' ? 'bg-blue-50 text-blue-700' : 'bg-emerald-50 text-emerald-700'}">
    {type.trackingMode === 'pool' ? m.inventory_badge_pool() : m.inventory_badge_specific()}
</span>
<!-- add: -->
<StatusBadge variant={type.trackingMode} />
```

### 6c: /bookings/+page.svelte

- [ ] **Step 3: Remove booking-type badge**

In `src/routes/(app)/bookings/+page.svelte`, remove from script block:
```typescript
function typeLabel(b: Booking) {
    if (b.serviceHasDateRange) return 'Campamento';
    if (b.serviceHasRoster)   return 'Grupo';
    return 'Privada';
}
function typeBadge(b: Booking) {
    if (b.serviceHasDateRange) return 'bg-purple-100 text-purple-700';
    if (b.serviceHasRoster)   return 'bg-blue-100 text-blue-700';
    return 'bg-gray-100 text-gray-600';
}
```

In template, find the badge span that uses these functions and remove it entirely:
```svelte
<!-- remove entirely: -->
<span class="rounded-full px-1.5 py-0.5 text-[9px] font-medium {typeBadge(b)}">
    {typeLabel(b)}
</span>
```

The service name already identifies the booking type — no replacement needed.

### 6d: /bookings/[id]/+page.svelte

- [ ] **Step 4: Replace booking header status span**

In `src/routes/(app)/bookings/[id]/+page.svelte`:

Remove from script:
```typescript
const statusColors: Record<string, string> = {
    confirmed: 'bg-confirmed/15 text-green-700',
    pending: 'bg-pending/30 text-amber-700',
    cancelled: 'bg-red-100 text-red-600'
};
```

Add import if not present:
```svelte
import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
```

Replace the booking status span (around line 146):
```svelte
<!-- remove: -->
<span class="shrink-0 rounded-full px-2.5 py-1 text-xs font-medium {statusColors[data.booking.status]}">
    {data.booking.status}
</span>
<!-- add: -->
<StatusBadge variant={data.booking.status} />
```

- [ ] **Step 5: Type-check all four files**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add "src/routes/(app)/staff/+page.svelte" \
    "src/routes/(app)/inventory/+page.svelte" \
    "src/routes/(app)/bookings/+page.svelte" \
    "src/routes/(app)/bookings/[id]/+page.svelte"
git commit -m "feat(ui): replace all inline status/role/tracking badge maps with StatusBadge"
```

---

## Self-review checklist

**Spec coverage:**
- [x] Section 1 (unified SessionCard) → Tasks 3, 4, 5
- [x] Section 2 (StatusBadge variants) → Task 1
- [x] Section 3 (clientGroups query) → Task 2
- [x] Section 4 (page cleanups) → Task 6
- [x] All three query functions updated: `listSessionsForDateRange` (via enrich helpers), `listSessionsForService`, `listSessionsForEdition`
- [x] SessionListCard deletion confirmed with grep before delete
- [x] `clientName` always "First Last" (enforced in `attachClientGroups` with `[firstName, lastName].filter(Boolean).join(' ')`)
- [x] Booking link in client groups (via `bookingId` on ClientGroup)
- [x] Card clickable when `openHref` provided (wrapped in `<a>`)

**Type consistency:**
- `ClientGroup` defined in types.ts Task 2 Step 1, used in SessionCard Task 3
- `SessionWithGroups` defined in types.ts Task 2 Step 1, returned by updated query functions Task 2 Steps 4–5
- `clientGroups` added to `SessionSurface` Task 2 Step 1, populated in enrich functions Task 2 Step 6
- `bookingClientName` prop added to SessionCard Task 3, passed from bookings/[id] Task 4 Step 8
