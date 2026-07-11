# UI Design System + Page Rebuilds — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the booking detail card vocabulary into 5 reusable Svelte components, then apply them across every page that touches client/participant/session data for visual consistency, DRY rendering, and complete navigation between entities.

**Architecture:** Design-system-first (CardShell + StatusBadge + EnrollmentGroup as atoms), then page-by-page rebuilds using those atoms. `/bookings/[id]` is the north star — it already assembles the full domain chain correctly. Sessions detail gets a sidebar+main rebuild; clients detail gets a sidebar+main rebuild. All other pages get lighter consistency passes. `ClientParticipants.svelte` is retired once `EnrollmentGroup` absorbs it.

**Tech Stack:** SvelteKit 2, Svelte 5 (runes — use `$props()`, `$derived`, `$state`, `{@render snippet()}`), TypeScript, Tailwind CSS v4, Drizzle ORM + PostgreSQL, Lucide Svelte icons.

---

## File Map

**New files:**
- `src/lib/components/ui/CardShell.svelte`
- `src/lib/components/ui/StatusBadge.svelte`
- `src/lib/components/bookings/EnrollmentGroup.svelte`
- `src/lib/components/bookings/BookingMiniRow.svelte`
- `src/lib/components/sessions/SessionTimelineRow.svelte`

**Modified files:**
- `src/lib/features/bookings/queries.ts` — extend `getBookingsForClient` to include color + payment
- `src/lib/features/sessions/queries.ts` — add `listSessionsForClient`
- `src/lib/features/bookings/types.ts` — update `ClientBookingSummary` type
- `src/routes/(app)/sessions/[id]/+page.svelte` — full rebuild
- `src/routes/(app)/clients/[id]/+page.svelte` — full rebuild
- `src/routes/(app)/clients/[id]/+page.server.ts` — add session history load
- `src/routes/(app)/services/[id]/roster/+page.svelte` — swap ClientParticipants → EnrollmentGroup
- `src/lib/components/sessions/SessionListCard.svelte` — add participant count + StatusBadge
- `src/routes/(app)/clients/+page.svelte` — add outstanding balance badge
- `src/routes/(app)/bookings/+page.svelte` — StatusBadge consistency
- `src/routes/(app)/services/[id]/sessions/+page.svelte` — StatusBadge consistency
- `src/routes/(app)/bookings/new/+page.svelte` — CardShell consistency

**Deleted files:**
- `src/lib/components/clients/ClientParticipants.svelte` (Task 10)

---

## Task 1: CardShell.svelte

**Files:**
- Create: `src/lib/components/ui/CardShell.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/ui/CardShell.svelte -->
<script lang="ts">
	import type { Component, Snippet } from 'svelte';

	let {
		label,
		icon: Icon,
		class: className = '',
		children,
		footer
	}: {
		label: string;
		icon?: Component<{ size?: number; class?: string }>;
		class?: string;
		children?: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<div class="overflow-hidden rounded-(--radius-card) border border-border bg-white shadow-sm {className}">
	<div class="flex items-center gap-1.5 border-b border-border bg-gray-50/60 px-4 py-2.5">
		{#if Icon}
			<Icon size={12} class="shrink-0 text-muted" />
		{/if}
		<span class="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span>
	</div>
	<div class="p-4">
		{@render children?.()}
	</div>
	{#if footer}
		<div class="border-t border-border px-4 py-2.5">
			{@render footer?.()}
		</div>
	{/if}
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/ui/CardShell.svelte
git commit -m "feat(ui): add CardShell component"
```

---

## Task 2: StatusBadge.svelte

**Files:**
- Create: `src/lib/components/ui/StatusBadge.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/ui/StatusBadge.svelte -->
<script lang="ts">
	export type StatusVariant =
		| 'confirmed' | 'pending' | 'cancelled'
		| 'paid' | 'partial'
		| 'active' | 'completed' | 'unscheduled'
		| 'beginner' | 'intermediate' | 'advanced';

	const COLORS: Record<StatusVariant, string> = {
		confirmed:    'bg-green-100 text-green-700',
		paid:         'bg-green-100 text-green-700',
		advanced:     'bg-green-100 text-green-700',
		completed:    'bg-green-100 text-green-700',
		pending:      'bg-amber-100 text-amber-700',
		partial:      'bg-amber-100 text-amber-700',
		intermediate: 'bg-amber-100 text-amber-700',
		unscheduled:  'bg-amber-100 text-amber-700',
		cancelled:    'bg-red-100 text-red-600',
		active:       'bg-blue-100 text-blue-700',
		beginner:     'bg-blue-100 text-blue-700',
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

<span class="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold capitalize {colorClass} {className}">
	{displayLabel}
</span>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/ui/StatusBadge.svelte
git commit -m "feat(ui): add StatusBadge component"
```

---

## Task 3: EnrollmentGroup.svelte

This component absorbs `ClientParticipants.svelte` and adds a client header with a booking link. Read `src/lib/components/clients/ClientParticipants.svelte` before editing — its full CRUD logic (rename, remove with cascade impact, bulk-add) is transferred here verbatim.

**Files:**
- Create: `src/lib/components/bookings/EnrollmentGroup.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/bookings/EnrollmentGroup.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import type { StatusVariant } from '$lib/components/ui/StatusBadge.svelte';

	let {
		clientName,
		bookingId,
		bookingClientId = '',
		participants,
		paymentStatus,
		amountPaid,
		amountDue,
		canEdit = false,
		bulkAdd = false,
		syncToSessions = false,
		renameAction = '',
		removeAction = '',
		addAction = '',
		impactAction = ''
	}: {
		clientName: string;
		bookingId: string;
		bookingClientId?: string;
		participants: { id: string; name: string }[];
		paymentStatus?: string;
		amountPaid?: string;
		amountDue?: string;
		canEdit?: boolean;
		bulkAdd?: boolean;
		syncToSessions?: boolean;
		renameAction?: string;
		removeAction?: string;
		addAction?: string;
		impactAction?: string;
	} = $props();

	// CRUD state (only used when canEdit=true)
	let editingId = $state<string | null>(null);
	let editingName = $state('');
	let removingId = $state<string | null>(null);
	let impact = $state<{ sessionCount: number; allocationCount: number } | null>(null);
	let addOpen = $state(false);
	let addValue = $state('');

	function startEdit(p: { id: string; name: string }) {
		editingId = p.id;
		editingName = p.name;
		removingId = null;
		addOpen = false;
	}

	async function startRemove(id: string) {
		removingId = id;
		editingId = null;
		impact = null;
		if (impactAction) {
			try {
				const fd = new FormData();
				fd.set('participantId', id);
				const res = await fetch(impactAction, { method: 'POST', body: fd });
				const json = await res.json();
				impact = json?.data?.impact ?? null;
			} catch {
				impact = { sessionCount: 0, allocationCount: 0 };
			}
		}
	}

	function cancel() {
		editingId = null;
		removingId = null;
		impact = null;
		addOpen = false;
		addValue = '';
	}

	const pendingAmount = $derived(
		amountDue && amountPaid
			? parseFloat(amountDue) - parseFloat(amountPaid)
			: null
	);
	const derivedPaymentVariant = $derived(
		paymentStatus === 'paid' ? 'paid'
		: paymentStatus === 'partial' ? 'partial'
		: pendingAmount != null ? 'pending'
		: undefined
	);
</script>

<div class="overflow-hidden rounded-lg border border-blue-100">
	<!-- Group header: client name + payment badge + booking link -->
	<div class="flex items-center justify-between gap-2 bg-blue-50/60 px-3 py-2">
		<div class="flex items-center gap-2 min-w-0">
			<span class="truncate text-[11px] font-bold text-navy">{clientName}</span>
			{#if derivedPaymentVariant}
				<StatusBadge variant={derivedPaymentVariant as StatusVariant} />
			{/if}
		</div>
		<a
			href="/bookings/{bookingId}"
			class="shrink-0 text-[10px] font-medium text-ocean hover:underline"
		>
			ver reserva →
		</a>
	</div>

	<!-- Participant rows -->
	<div class="space-y-1 p-2">
		{#each participants as p (p.id)}
			{#if canEdit && editingId === p.id}
				<form
					method="POST"
					action={renameAction}
					use:enhance={withToast(() => { editingId = null; })}
					class="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5"
				>
					<input type="hidden" name="participantId" value={p.id} />
					<input
						name="name"
						type="text"
						bind:value={editingName}
						autofocus
						class="flex-1 rounded border border-border px-2 py-0.5 text-xs focus:border-ocean focus:outline-none"
					/>
					<button type="submit" class="text-[10px] font-semibold text-ocean">✓</button>
					<button type="button" onclick={cancel} class="text-[10px] text-muted">✕</button>
				</form>
			{:else if canEdit && removingId === p.id}
				<div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
					<p class="mb-1 text-[10px] font-semibold text-red-700">{p.name}</p>
					{#if impact}
						<p class="mb-2 rounded bg-amber-50 px-2 py-1 text-[9px] text-amber-700">
							⚠ Se eliminará de {impact.sessionCount} sesión{impact.sessionCount !== 1 ? 'es' : ''}
							{impact.allocationCount > 0 ? ` · equipo desasignado (${impact.allocationCount})` : ''}
						</p>
					{:else if impactAction}
						<p class="mb-2 text-[9px] text-muted">Calculando impacto…</p>
					{/if}
					<div class="flex gap-2">
						<form
							method="POST"
							action={removeAction}
							use:enhance={withToast(() => { removingId = null; impact = null; })}
						>
							<input type="hidden" name="participantId" value={p.id} />
							<input type="hidden" name="bookingClientId" value={bookingClientId} />
							<button type="submit" class="text-[10px] font-semibold text-red-600 hover:underline">
								Confirmar eliminar
							</button>
						</form>
						<button type="button" onclick={cancel} class="text-[10px] text-muted hover:text-gray-700">
							Cancelar
						</button>
					</div>
				</div>
			{:else}
				<div class="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">
					<span class="flex-1 text-xs font-medium text-gray-800">{p.name}</span>
					{#if canEdit}
						<button
							type="button"
							onclick={() => startEdit(p)}
							class="text-[10px] text-muted opacity-0 transition-opacity hover:text-ocean group-hover:opacity-100"
						>✎</button>
						<button
							type="button"
							onclick={() => startRemove(p.id)}
							class="text-[10px] text-red-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
						>✕</button>
					{/if}
				</div>
			{/if}
		{/each}

		{#if participants.length === 0}
			<p class="px-2.5 py-1 text-xs italic text-muted">Sin participantes.</p>
		{/if}

		{#if canEdit}
			{#if addOpen}
				<form
					method="POST"
					action={addAction}
					use:enhance={withToast(() => { addOpen = false; addValue = ''; })}
					class="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-2.5"
				>
					<input type="hidden" name="bookingClientId" value={bookingClientId} />
					{#if syncToSessions}
						<input type="hidden" name="syncToSessions" value="true" />
					{/if}
					{#if bulkAdd}
						<p class="mb-1 text-[9px] font-bold text-blue-700">Un nombre por línea</p>
						<textarea
							name="names"
							bind:value={addValue}
							rows="3"
							placeholder={"Emma\nLeon\nSofia"}
							class="w-full resize-none rounded border border-blue-200 bg-white px-2 py-1.5 text-xs focus:border-ocean focus:outline-none"
						></textarea>
					{:else}
						<input
							name="name"
							type="text"
							bind:value={addValue}
							placeholder="Nombre del participante"
							autofocus
							class="w-full rounded border border-blue-200 bg-white px-2 py-1.5 text-xs focus:border-ocean focus:outline-none"
						/>
					{/if}
					<div class="mt-2 flex justify-end gap-2">
						<button type="button" onclick={cancel} class="text-[10px] text-muted">Cancelar</button>
						<button type="submit" class="btn-primary btn-sm text-[10px]">Añadir</button>
					</div>
				</form>
			{:else}
				<button
					type="button"
					onclick={() => { addOpen = true; addValue = ''; }}
					class="w-full rounded-lg border border-dashed border-blue-200 py-1.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
				>
					+ {bulkAdd ? 'Añadir participante(s)' : 'Añadir participante'}
				</button>
			{/if}
		{/if}
	</div>
</div>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/bookings/EnrollmentGroup.svelte
git commit -m "feat(bookings): add EnrollmentGroup component"
```

---

## Task 4: BookingMiniRow.svelte

**Files:**
- Create: `src/lib/components/bookings/BookingMiniRow.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/bookings/BookingMiniRow.svelte -->
<script lang="ts">
	import { DOT_COLORS } from '$lib/features/services/colors';
	import type { ServiceColorKey } from '$lib/features/services/colors';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	let {
		bookingId,
		serviceName,
		serviceColor,
		date,
		status,
		participantCount,
		amountDue,
		amountPaid
	}: {
		bookingId: string;
		serviceName: string | null;
		serviceColor: string | null;
		date: string;
		status: string;
		participantCount: number;
		amountDue: string;
		amountPaid: string;
	} = $props();

	const dotColor = $derived(
		DOT_COLORS[(serviceColor ?? 'ocean') as ServiceColorKey] ?? DOT_COLORS['ocean']
	);
	const pending = $derived(parseFloat(amountDue) - parseFloat(amountPaid));
</script>

<a
	href="/bookings/{bookingId}"
	class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50"
>
	<span
		class="h-2.5 w-2.5 shrink-0 rounded-full"
		style="background-color: {dotColor}"
	></span>
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-semibold text-gray-900">{serviceName ?? '—'}</p>
		<p class="text-xs text-muted">
			{date}
			{#if participantCount > 1}· {participantCount} participantes{/if}
		</p>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		{#if pending > 0}
			<span class="text-xs font-semibold text-red-500">€{pending.toFixed(0)} pend.</span>
		{/if}
		<StatusBadge variant={status} />
	</div>
</a>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/bookings/BookingMiniRow.svelte
git commit -m "feat(bookings): add BookingMiniRow component"
```

---

## Task 5: SessionTimelineRow.svelte

**Files:**
- Create: `src/lib/components/sessions/SessionTimelineRow.svelte`

- [ ] **Step 1: Create the component**

```svelte
<!-- src/lib/components/sessions/SessionTimelineRow.svelte -->
<script lang="ts">
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	let {
		sessionId,
		date,
		serviceName,
		instructorName,
		status
	}: {
		sessionId: string;
		date: string;
		serviceName: string | null;
		instructorName?: string | null;
		status: string;
	} = $props();

	function fmtDate(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<a
	href="/sessions/{sessionId}"
	class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-gray-50"
>
	<span class="w-[72px] shrink-0 text-xs text-muted">{fmtDate(date)}</span>
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm text-gray-800">{serviceName ?? '—'}</p>
		{#if instructorName}
			<p class="text-xs text-muted">{instructorName}</p>
		{/if}
	</div>
	<StatusBadge variant={status} class="shrink-0" />
</a>
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/components/sessions/SessionTimelineRow.svelte
git commit -m "feat(sessions): add SessionTimelineRow component"
```

---

## Task 6: Server queries — extend getBookingsForClient + add listSessionsForClient

**Files:**
- Modify: `src/lib/features/bookings/queries.ts`
- Modify: `src/lib/features/bookings/types.ts`
- Modify: `src/lib/features/sessions/queries.ts`

- [ ] **Step 1: Update ClientBookingSummary type in `src/lib/features/bookings/types.ts`**

Find the `ClientBookingSummary` interface and replace it:

```typescript
export interface ClientBookingSummary {
	id: string;
	date: string;
	time: string | null;
	serviceId: string | null;
	serviceName: string | null;
	serviceColor: string | null;
	status: BookingStatus;
	participantCount: number;
	amountDue: string;
	amountPaid: string;
	paymentStatus: PaymentStatus;
}
```

- [ ] **Step 2: Update getBookingsForClient in `src/lib/features/bookings/queries.ts`**

Find `getBookingsForClient` and update the select to include the new fields:

```typescript
export async function getBookingsForClient(clientId: string): Promise<ClientBookingSummary[]> {
	const rows = await db
		.select({
			id: bookings.id,
			date: bookings.date,
			time: bookings.time,
			serviceId: bookings.serviceId,
			serviceName: services.name,
			serviceColor: services.color,
			status: bookings.status,
			participantCount: bookingClients.participantCount,
			amountDue: bookingClients.amountDue,
			amountPaid: bookingClients.amountPaid,
			paymentStatus: bookingClients.paymentStatus
		})
		.from(bookingClients)
		.innerJoin(bookings, eq(bookingClients.bookingId, bookings.id))
		.leftJoin(services, eq(bookings.serviceId, services.id))
		.where(and(eq(bookingClients.clientId, clientId), eq(bookingClients.status, 'enrolled')))
		.orderBy(desc(bookings.date));
	return rows as ClientBookingSummary[];
}
```

- [ ] **Step 3: Add listSessionsForClient to `src/lib/features/sessions/queries.ts`**

Add this function near the end of the file, before the last closing lines. It requires `alias` from drizzle — check the imports at the top of the file first. If `alias` is not imported, add it: `import { alias } from 'drizzle-orm/pg-core';`

```typescript
export async function listSessionsForClient(clientId: string) {
	const bookingService = alias(services, 'bookingService');
	return db
		.selectDistinct({
			sessionId: sessions.id,
			date: sessions.date,
			status: sessions.status,
			serviceName: sql<string | null>`COALESCE(${services.name}, ${bookingService.name})`,
		})
		.from(sessions)
		.innerJoin(sessionParticipants, eq(sessionParticipants.sessionId, sessions.id))
		.innerJoin(
			bookingParticipants,
			eq(bookingParticipants.id, sessionParticipants.bookingParticipantId)
		)
		.innerJoin(bookingClients, eq(bookingClients.id, bookingParticipants.bookingClientId))
		.leftJoin(services, eq(services.id, sessions.serviceId))
		.leftJoin(bookings, eq(bookings.id, sessions.bookingId))
		.leftJoin(bookingService, eq(bookingService.id, bookings.serviceId))
		.where(eq(bookingClients.clientId, clientId))
		.orderBy(desc(sessions.date))
		.limit(20);
}
```

- [ ] **Step 4: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Fix any type errors before continuing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/features/bookings/queries.ts src/lib/features/bookings/types.ts src/lib/features/sessions/queries.ts
git commit -m "feat(queries): extend getBookingsForClient with payment+color, add listSessionsForClient"
```

---

## Task 7: Rebuild /sessions/[id]

**Files:**
- Modify: `src/routes/(app)/sessions/[id]/+page.svelte`

The new layout replaces the current `grid-cols-1 lg:grid-cols-[1fr_1.5fr]` with a `grid-cols-1 md:grid-cols-[280px_1fr]` sidebar+main, using `CardShell` cards in the sidebar and `EnrollmentGroup` per booking in the main area.

The server data shape is unchanged — this is a pure UI rebuild. Key data used:
- `data.session` — `{ date, time, effectiveDuration, skillLevel, notes, status, ownerType }`
- `data.session.instructors` — `[{ instructorId, instructorName }]`
- `data.enrollments` — `BookingEnrollment[]` with `{ bookingId, firstName, lastName, amountDue, amountPaid, status }`
- `data.participants` — `ParticipantWithContext[]` with `{ id, name, bookingId, clientFirstName, clientLastName }`
- `data.serviceName`, `data.backLink`, `data.backLabel`

- [ ] **Step 1: Replace the full page file**

```svelte
<!-- src/routes/(app)/sessions/[id]/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import { getServiceColor } from '$lib/features/services/colors';
	import { Calendar, Waves, CreditCard, Users } from 'lucide-svelte';
	import type { PageData } from './$types';
	import CardShell from '$lib/components/ui/CardShell.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import EnrollmentGroup from '$lib/components/bookings/EnrollmentGroup.svelte';

	let { data }: { data: PageData } = $props();

	const color = $derived(getServiceColor(data.serviceColor ?? ''));
	const isCancelled = $derived(data.session.status === 'cancelled');

	function fmtTime(t: string | null) { return t?.slice(0, 5) ?? '—'; }

	function addMins(t: string, m: number) {
		const [h, min] = t.split(':').map(Number);
		const total = h * 60 + min + m;
		return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
	}

	const timeRange = $derived(
		data.session.time && data.session.effectiveDuration
			? `${fmtTime(data.session.time)} – ${addMins(fmtTime(data.session.time), data.session.effectiveDuration)}`
			: fmtTime(data.session.time)
	);

	const statusMap: Record<string, string> = {
		cancelled: 'cancelled', completed: 'completed', unscheduled: 'unscheduled'
	};
	const statusVariant = $derived(statusMap[data.session.status] ?? 'active');

	const skillLabels: Record<string, string> = {
		beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado'
	};

	// Edit state
	let editingSession = $state(false);
	let editTime = $state(data.session.time?.slice(0, 5) ?? '');
	let editDuration = $state(data.session.effectiveDuration ?? 60);
	let editNotes = $state(data.session.notes ?? '');
	let editLevel = $state(data.session.skillLevel ?? '');

	$effect(() => {
		if (!editingSession) {
			editTime = data.session.time?.slice(0, 5) ?? '';
			editDuration = data.session.effectiveDuration ?? 60;
			editNotes = data.session.notes ?? '';
			editLevel = data.session.skillLevel ?? '';
		}
	});

	// Group participants by booking for EnrollmentGroup
	const participantGroups = $derived(() => {
		const groups = new Map<string, {
			bookingId: string;
			clientName: string;
			participants: { id: string; name: string }[];
			paymentStatus?: string;
			amountPaid?: string;
			amountDue?: string;
		}>();
		for (const p of data.participants) {
			if (!p.bookingId) continue;
			if (!groups.has(p.bookingId)) {
				const enrollment = data.enrollments.find(e => e.bookingId === p.bookingId);
				groups.set(p.bookingId, {
					bookingId: p.bookingId,
					clientName: [p.clientFirstName, p.clientLastName].filter(Boolean).join(' ') || '—',
					participants: [],
					paymentStatus: enrollment?.status,
					amountPaid: enrollment?.amountPaid,
					amountDue: enrollment?.amountDue,
				});
			}
			groups.get(p.bookingId)!.participants.push({ id: p.id, name: p.name });
		}
		return [...groups.values()];
	});

	// Payment totals across all enrollments
	const paymentTotals = $derived(() => {
		const active = data.enrollments.filter(e => e.status !== 'cancelled');
		const due = active.reduce((s, e) => s + parseFloat(e.amountDue ?? '0'), 0);
		const paid = active.reduce((s, e) => s + parseFloat(e.amountPaid ?? '0'), 0);
		return { due, paid, pending: due - paid };
	});

	function fmtDateLong(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
			weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
		});
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<!-- TOP BANNER -->
	<div class="border-b border-l-4 {color.border} {color.bg} px-4 py-3 sm:px-6">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<div class="mb-1 flex items-center gap-2">
					<a href={data.backLink} class="text-xs text-muted hover:text-navy">← {data.backLabel}</a>
					<StatusBadge variant={statusVariant} />
				</div>
				<p class="text-lg font-bold text-navy">{data.serviceName ?? '—'}</p>
				<p class="text-sm text-gray-600">{fmtDateLong(data.session.date)}</p>
				{#if data.session.time}
					<p class="mt-1 text-sm font-semibold text-gray-800">{timeRange}
						{#if data.session.effectiveDuration}
							<span class="ml-1 text-xs font-normal text-muted">{data.session.effectiveDuration} min</span>
						{/if}
					</p>
				{/if}
			</div>
			{#if !isCancelled}
				<div class="flex shrink-0 flex-col items-end gap-1.5">
					<button
						type="button"
						onclick={() => editingSession = !editingSession}
						class="btn-primary btn-sm text-xs"
					>{editingSession ? 'Cerrar' : 'Editar'}</button>
					<form method="POST" action="?/cancelSession" use:enhance={withToast()}>
						<button type="submit" class="text-[10px] text-amber-600 hover:underline">Cancelar sesión</button>
					</form>
					<form method="POST" action="?/deleteSession" use:enhance>
						<input type="hidden" name="backLink" value={data.backLink} />
						<button
							type="submit"
							onclick={(e) => { if (!confirm('¿Eliminar esta sesión permanentemente?')) e.preventDefault(); }}
							class="text-[10px] text-red-500 hover:underline"
						>Eliminar</button>
					</form>
				</div>
			{/if}
		</div>
	</div>

	<!-- EDIT FORM -->
	{#if editingSession}
		<div class="border-b border-border bg-gray-50 px-4 py-4 sm:px-6">
			<form
				method="POST"
				action="?/updateSession"
				use:enhance={withToast(() => { editingSession = false; })}
				class="grid grid-cols-2 gap-3 md:grid-cols-4"
			>
				<div>
					<label class="label text-xs">Hora</label>
					<input name="time" type="time" bind:value={editTime} class="input w-full text-sm" />
				</div>
				<div>
					<label class="label text-xs">Duración (min)</label>
					<input name="durationMinutes" type="number" min="1" bind:value={editDuration} class="input w-full text-sm" />
				</div>
				<div class="col-span-2">
					<label class="label text-xs">Notas</label>
					<input name="notes" type="text" bind:value={editNotes} class="input w-full text-sm" />
				</div>
				<div class="col-span-2 md:col-span-4">
					<label class="label mb-1 block text-xs">Instructor</label>
					<div class="flex flex-wrap gap-3">
						{#each data.instructors as inst}
							<label class="flex cursor-pointer items-center gap-1.5">
								<input
									type="checkbox"
									name="instructorId"
									value={inst.id}
									checked={data.session.instructors.some(i => i.instructorId === inst.id)}
									class="h-3.5 w-3.5 accent-ocean"
								/>
								<span class="text-xs text-gray-700">{inst.name}</span>
							</label>
						{/each}
					</div>
				</div>
				{#if data.session.ownerType === 'booking'}
					<div class="col-span-2 md:col-span-4">
						<label class="label mb-1 block text-xs">Nivel</label>
						<div class="flex gap-1.5">
							{#each [{ v: 'beginner', l: 'Principiante' }, { v: 'intermediate', l: 'Intermedio' }, { v: 'advanced', l: 'Avanzado' }] as lvl}
								<button
									type="button"
									onclick={() => editLevel = editLevel === lvl.v ? '' : lvl.v}
									class="rounded border px-3 py-1 text-xs font-medium transition-colors
										{editLevel === lvl.v ? 'border-ocean bg-ocean/10 text-ocean' : 'border-border text-muted hover:border-gray-400'}"
								>{lvl.l}</button>
							{/each}
						</div>
						<input type="hidden" name="skillLevel" value={editLevel} />
					</div>
				{/if}
				<div class="col-span-2 flex gap-2 md:col-span-4">
					<button type="submit" class="btn-primary btn-sm">Guardar</button>
					<button type="button" onclick={() => editingSession = false} class="btn-ghost btn-sm">Cancelar</button>
				</div>
			</form>
		</div>
	{/if}

	<!-- MAIN CONTENT -->
	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">

			<!-- SIDEBAR -->
			<div class="space-y-4">

				<!-- Session info card -->
				<CardShell label="Sesión" icon={Calendar}>
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-muted">Fecha</span>
							<span class="font-medium text-gray-900">
								{new Date(data.session.date + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
							</span>
						</div>
						{#if data.session.time}
							<div class="flex justify-between">
								<span class="text-muted">Hora</span>
								<span class="font-medium text-gray-900">{timeRange}</span>
							</div>
						{:else}
							<div class="flex justify-between">
								<span class="text-muted">Hora</span>
								<StatusBadge variant="unscheduled" />
							</div>
						{/if}
						{#if data.session.skillLevel}
							<div class="flex justify-between">
								<span class="text-muted">Nivel</span>
								<StatusBadge variant={data.session.skillLevel} />
							</div>
						{/if}
						{#if data.session.notes}
							<p class="border-t border-border pt-2 text-xs italic text-gray-500">{data.session.notes}</p>
						{/if}
					</div>
				</CardShell>

				<!-- Instructor card -->
				<CardShell label="Monitor" icon={Waves}>
					{#if data.session.instructors.length > 0}
						<div class="space-y-1.5">
							{#each data.session.instructors as inst}
								<div class="flex items-center gap-2">
									<div class="flex h-7 w-7 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
										{inst.instructorName?.charAt(0) ?? '?'}
									</div>
									<span class="text-sm font-medium text-gray-800">{inst.instructorName ?? '—'}</span>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-xs italic text-muted">Sin monitor asignado.</p>
					{/if}
					{#snippet footer()}
						{#if !isCancelled}
							<button type="button" onclick={() => editingSession = true} class="text-xs text-ocean hover:underline">
								Editar →
							</button>
						{/if}
					{/snippet}
				</CardShell>

				<!-- Payment totals card -->
				{#if paymentTotals().due > 0}
					<CardShell label="Pago" icon={CreditCard}>
						<div class="space-y-1.5 text-sm">
							<div class="flex justify-between font-bold text-gray-900">
								<span>Total</span><span>€{paymentTotals().due.toFixed(2)}</span>
							</div>
							<div class="flex justify-between text-muted">
								<span>Cobrado</span><span>€{paymentTotals().paid.toFixed(2)}</span>
							</div>
							{#if paymentTotals().pending > 0}
								<div class="flex justify-between font-semibold text-red-500">
									<span>Pendiente</span><span>€{paymentTotals().pending.toFixed(2)}</span>
								</div>
							{/if}
						</div>
					</CardShell>
				{/if}

			</div>

			<!-- MAIN: participants grouped by booking -->
			<div>
				<CardShell label="Participantes · {data.participants.length}" icon={Users}>
					{#if participantGroups().length === 0}
						<p class="text-sm italic text-muted">Sin participantes en esta sesión.</p>
					{:else}
						<div class="space-y-3">
							{#each participantGroups() as group (group.bookingId)}
								<EnrollmentGroup
									clientName={group.clientName}
									bookingId={group.bookingId}
									participants={group.participants}
									paymentStatus={group.paymentStatus}
									amountPaid={group.amountPaid}
									amountDue={group.amountDue}
									canEdit={false}
								/>
							{/each}
						</div>
					{/if}
				</CardShell>
			</div>

		</div>
	</div>
</div>
```

- [ ] **Step 2: Run the dev server and navigate to a session detail page**

```bash
npm run dev
```

Navigate to `/sessions` → click a session. Verify:
- Top banner shows service name, date, status badge
- Sidebar shows session info card, instructor card
- Main shows participants grouped by booking with "ver reserva →" links
- Edit form works (click Editar, change time, save)
- Mobile: resize to < 768px — sidebar stacks above participants

- [ ] **Step 3: Commit**

```bash
git add src/routes/(app)/sessions/[id]/+page.svelte
git commit -m "feat(sessions): rebuild session detail with sidebar+main layout and EnrollmentGroup"
```

---

## Task 8: Rebuild /clients/[id]

**Files:**
- Modify: `src/routes/(app)/clients/[id]/+page.server.ts`
- Modify: `src/routes/(app)/clients/[id]/+page.svelte`

- [ ] **Step 1: Update the server load function**

Replace the full content of `src/routes/(app)/clients/[id]/+page.server.ts`:

```typescript
import { error, fail, redirect } from '@sveltejs/kit';
import { deleteClient, getClient, updateClient } from '$lib/features/clients/queries';
import { getBookingsForClient } from '$lib/features/bookings/queries';
import { listSessionsForClient } from '$lib/features/sessions/queries';
import type { SkillLevel } from '$lib/features/clients/types';
import type { Actions, PageServerLoad } from './$types';
import { requireRole } from '$lib/server/permissions';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRole(locals, 'admin', 'owner', 'manager');
	const client = await getClient(params.id);
	if (!client) error(404, 'Client not found');
	const [bookings, sessions] = await Promise.all([
		getBookingsForClient(params.id),
		listSessionsForClient(params.id)
	]);
	return { client, bookings, sessions };
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const firstName = form.get('firstName')?.toString().trim() ?? '';
		const lastName = form.get('lastName')?.toString().trim() ?? '';
		if (!firstName || !lastName) return fail(400, { error: 'Name required' });
		await updateClient(params.id, {
			firstName,
			lastName,
			phone: form.get('phone')?.toString().trim() || undefined,
			email: form.get('email')?.toString().trim() || undefined,
			nationality: form.get('nationality')?.toString().trim() || undefined,
			skillLevel: (form.get('skillLevel')?.toString() || undefined) as SkillLevel | undefined,
			notes: form.get('notes')?.toString().trim() || undefined
		});
		return { error: null };
	},

	delete: async ({ params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const result = await deleteClient(params.id);
		if (!result.deleted) {
			return fail(409, { error: 'This client has booking history and cannot be deleted. Remove them from all bookings first.' });
		}
		redirect(302, '/clients');
	}
};
```

- [ ] **Step 2: Replace the full page component**

```svelte
<!-- src/routes/(app)/clients/[id]/+page.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import { User, CreditCard, Calendar, Clock, Phone, Mail } from 'lucide-svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import CardShell from '$lib/components/ui/CardShell.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import BookingMiniRow from '$lib/components/bookings/BookingMiniRow.svelte';
	import SessionTimelineRow from '$lib/components/sessions/SessionTimelineRow.svelte';
	import * as m from '$lib/paraglide/messages';
	import type { ActionData, PageData } from './$types';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let editing = $state(false);

	const skillLabels: Record<string, string> = {
		beginner: 'Principiante',
		intermediate: 'Intermedio',
		advanced: 'Avanzado'
	};

	const activeBookings = $derived(data.bookings.filter(b => b.status !== 'cancelled'));

	const paymentTotals = $derived(() => {
		const due = activeBookings.reduce((s, b) => s + parseFloat(b.amountDue ?? '0'), 0);
		const paid = activeBookings.reduce((s, b) => s + parseFloat(b.amountPaid ?? '0'), 0);
		return { due, paid, pending: due - paid };
	});
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<PageHeader
		title="{data.client.firstName} {data.client.lastName}"
		backHref="/clients"
		subtitle={data.client.skillLevel ? (skillLabels[data.client.skillLevel] ?? data.client.skillLevel) : undefined}
	>
		{#snippet children()}
			<div class="flex items-center gap-2">
				<button onclick={() => (editing = !editing)} class="btn-secondary btn-sm">
					{editing ? m.common_cancel() : m.common_edit()}
				</button>
				<form
					method="post"
					action="?/delete"
					use:enhance
					onsubmit={(e) => {
						if (!confirm(`Eliminar ${data.client.firstName} ${data.client.lastName}? No se puede deshacer.`))
							e.preventDefault();
					}}
				>
					<button type="submit" class="btn-destructive btn-sm">{m.common_delete()}</button>
				</form>
			</div>
		{/snippet}
	</PageHeader>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">

		<!-- Edit form (shown inline when editing) -->
		{#if editing}
			<div class="mb-6 overflow-hidden rounded-(--radius-card) border border-border bg-white shadow-sm">
				<div class="border-b border-border bg-gray-50/60 px-4 py-2.5">
					<span class="text-[10px] font-bold uppercase tracking-wider text-muted">Editar cliente</span>
				</div>
				<form
					method="post"
					action="?/update"
					class="space-y-4 p-4"
					use:enhance={() => {
						return async ({ update }) => {
							editing = false;
							update();
						};
					}}
				>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="label">{m.client_new_first_name()}</label>
							<input name="firstName" required value={data.client.firstName} class="input" />
						</div>
						<div>
							<label class="label">{m.client_new_last_name()}</label>
							<input name="lastName" required value={data.client.lastName} class="input" />
						</div>
						<div>
							<label class="label">{m.client_new_phone()}</label>
							<input name="phone" type="tel" value={data.client.phone ?? ''} class="input" />
						</div>
						<div>
							<label class="label">{m.client_new_email()}</label>
							<input name="email" type="email" value={data.client.email ?? ''} class="input" />
						</div>
						<div>
							<label class="label">Nivel</label>
							<select name="skillLevel" class="input">
								<option value="">Sin especificar</option>
								<option value="beginner" selected={data.client.skillLevel === 'beginner'}>Principiante</option>
								<option value="intermediate" selected={data.client.skillLevel === 'intermediate'}>Intermedio</option>
								<option value="advanced" selected={data.client.skillLevel === 'advanced'}>Avanzado</option>
							</select>
						</div>
						<div>
							<label class="label">Notas</label>
							<input name="notes" value={data.client.notes ?? ''} class="input" />
						</div>
					</div>
					<div class="flex gap-2">
						<button type="submit" class="btn-primary btn-sm">Guardar</button>
						<button type="button" onclick={() => editing = false} class="btn-ghost btn-sm">Cancelar</button>
					</div>
					{#if form?.error}
						<p class="text-sm text-red-600">{form.error}</p>
					{/if}
				</form>
			</div>
		{/if}

		<!-- SIDEBAR + MAIN GRID -->
		<div class="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">

			<!-- SIDEBAR -->
			<div class="space-y-4">

				<!-- Client info -->
				<CardShell label="Info" icon={User}>
					<div class="space-y-2">
						{#if data.client.phone}
							<div class="flex items-center gap-2 text-sm">
								<Phone size={13} class="shrink-0 text-muted" />
								<a href="tel:{data.client.phone}" class="text-gray-800 hover:text-ocean">{data.client.phone}</a>
							</div>
						{/if}
						{#if data.client.email}
							<div class="flex items-center gap-2 text-sm">
								<Mail size={13} class="shrink-0 text-muted" />
								<a href="mailto:{data.client.email}" class="truncate text-gray-800 hover:text-ocean">{data.client.email}</a>
							</div>
						{/if}
						{#if data.client.skillLevel}
							<div class="flex items-center gap-2">
								<span class="text-sm text-muted">Nivel</span>
								<StatusBadge variant={data.client.skillLevel} />
							</div>
						{/if}
						{#if data.client.nationality}
							<p class="text-sm text-muted">{data.client.nationality}</p>
						{/if}
					</div>
				</CardShell>

				<!-- Payment overview -->
				{#if paymentTotals().due > 0}
					<CardShell label="Pagos" icon={CreditCard}>
						<div class="space-y-1.5 text-sm">
							<div class="flex justify-between font-bold text-gray-900">
								<span>Total</span><span>€{paymentTotals().due.toFixed(2)}</span>
							</div>
							<div class="flex justify-between text-muted">
								<span>Cobrado</span><span>€{paymentTotals().paid.toFixed(2)}</span>
							</div>
							{#if paymentTotals().pending > 0}
								<div class="flex justify-between font-semibold text-red-500">
									<span>Pendiente</span><span>€{paymentTotals().pending.toFixed(2)}</span>
								</div>
							{/if}
						</div>
					</CardShell>
				{/if}

			</div>

			<!-- MAIN -->
			<div class="space-y-4">

				<!-- Active bookings -->
				<CardShell label="Reservas activas" icon={Calendar}>
					{#if activeBookings.length === 0}
						<p class="text-sm italic text-muted">Sin reservas activas.</p>
					{:else}
						<div class="-mx-4 -mb-4 divide-y divide-border">
							{#each activeBookings as booking (booking.id)}
								<BookingMiniRow
									bookingId={booking.id}
									serviceName={booking.serviceName}
									serviceColor={booking.serviceColor}
									date={booking.date}
									status={booking.status}
									participantCount={booking.participantCount}
									amountDue={booking.amountDue}
									amountPaid={booking.amountPaid}
								/>
							{/each}
						</div>
					{/if}
					{#snippet footer()}
						<a href="/bookings/new?clientId={data.client.id}" class="text-xs font-medium text-ocean hover:underline">
							+ Nueva reserva
						</a>
					{/snippet}
				</CardShell>

				<!-- Session timeline -->
				<CardShell label="Historial de sesiones" icon={Clock}>
					{#if data.sessions.length === 0}
						<p class="text-sm italic text-muted">Sin sesiones registradas.</p>
					{:else}
						<div class="-mx-4 -mb-4 divide-y divide-border">
							{#each data.sessions as session (session.sessionId)}
								<SessionTimelineRow
									sessionId={session.sessionId}
									date={session.date}
									serviceName={session.serviceName}
									status={session.status}
								/>
							{/each}
						</div>
					{/if}
				</CardShell>

			</div>
		</div>
	</div>
</div>
```

- [ ] **Step 3: Run the dev server and navigate to a client detail page**

```bash
npm run dev
```

Navigate to `/clients` → click a client. Verify:
- Sidebar shows client info (phone, email, skill level) + payment totals if any active bookings
- Main shows active bookings list with color dot + service name + payment pending badge
- Each booking row links to `/bookings/[id]`
- Session timeline shows last 20 sessions with date + service + status badge
- Edit form toggles on "Editar" click
- Mobile: sidebar stacks above bookings + timeline

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/clients/[id]/+page.server.ts src/routes/(app)/clients/[id]/+page.svelte
git commit -m "feat(clients): rebuild client detail with sidebar+main, BookingMiniRow, SessionTimelineRow"
```

---

## Task 9: /services/[id]/roster — swap ClientParticipants → EnrollmentGroup

**Files:**
- Modify: `src/routes/(app)/services/[id]/roster/+page.svelte`

The roster page shows bookings grouped by edition. Each booking currently uses `ClientParticipants`. Replace with `EnrollmentGroup`. The data shape from the server is `data.bookingsByEdition[editionId]` — each booking has the client name and a `participants` array.

- [ ] **Step 1: Read the current roster page bottom half**

Read `src/routes/(app)/services/[id]/roster/+page.svelte` from line 80 onwards to understand the current per-booking loop structure.

- [ ] **Step 2: Replace ClientParticipants import with EnrollmentGroup**

In the `<script>` block, remove:
```svelte
import ClientParticipants from '$lib/components/clients/ClientParticipants.svelte';
```

Add:
```svelte
import EnrollmentGroup from '$lib/components/bookings/EnrollmentGroup.svelte';
import CardShell from '$lib/components/ui/CardShell.svelte';
import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
import { Users } from 'lucide-svelte';
```

- [ ] **Step 3: In the booking list loop, replace ClientParticipants with EnrollmentGroup**

Find the section that renders each booking's participants (look for `<ClientParticipants`) and replace with:

```svelte
<EnrollmentGroup
  clientName="{booking.clientFirstName} {booking.clientLastName}"
  bookingId={booking.bookingId}
  bookingClientId={booking.bookingClientId}
  participants={booking.participants}
  paymentStatus={booking.paymentStatus}
  amountPaid={booking.amountPaid}
  amountDue={booking.amountDue}
  canEdit={true}
  bulkAdd={true}
  syncToSessions={true}
  renameAction="?/renameParticipant"
  removeAction="?/removeParticipantCascade"
  addAction="?/bulkAddParticipants"
  impactAction="?/getRemovalImpact"
/>
```

Note: the exact prop names from the server data (`booking.bookingClientId`, etc.) depend on what `data.bookingsByEdition` returns. Read the roster `+page.server.ts` to confirm field names before writing.

- [ ] **Step 4: Wrap edition summary card in CardShell**

Find the edition summary div (`rounded-(--radius-card) bg-surface p-4 ring-1 ring-border`) and replace with:

```svelte
<CardShell label="Edición" icon={Users}>
  <!-- existing content stays inside -->
</CardShell>
```

- [ ] **Step 5: Verify roster page works**

Navigate to a service with editions → Roster tab. Verify:
- Edition summary shows in CardShell
- Each booking shows client name header + "ver reserva →" link + participant list
- Add/rename/remove participant actions still work

- [ ] **Step 6: Commit**

```bash
git add src/routes/(app)/services/[id]/roster/+page.svelte
git commit -m "feat(roster): replace ClientParticipants with EnrollmentGroup"
```

---

## Task 10: Delete ClientParticipants.svelte

All usages are now migrated (booking detail uses EnrollmentGroup via inline pattern — verify booking detail still works first).

- [ ] **Step 1: Verify no remaining imports**

```bash
grep -r "ClientParticipants" src/
```

Expected output: only `src/routes/(app)/bookings/[id]/+page.svelte`. That page uses it with `bookingClient.id` as `bookingClientId`. Update it to use `EnrollmentGroup`:

In `src/routes/(app)/bookings/[id]/+page.svelte`, find the `<ClientParticipants` usage and replace:

```svelte
<EnrollmentGroup
  clientName="{bookingClient.clientFirstName} {bookingClient.clientLastName}"
  bookingId={data.booking.id}
  bookingClientId={bookingClient.id}
  participants={participants}
  canEdit={data.booking.status !== 'cancelled'}
  bulkAdd={true}
  syncToSessions={true}
  renameAction="?/renameParticipant"
  removeAction="?/removeParticipantCascade"
  addAction="?/bulkAddParticipants"
  impactAction="?/getRemovalImpact"
/>
```

Also remove the old import line:
```svelte
import ClientParticipants from '$lib/components/clients/ClientParticipants.svelte';
```

And add:
```svelte
import EnrollmentGroup from '$lib/components/bookings/EnrollmentGroup.svelte';
```

- [ ] **Step 2: Verify booking detail participant section still works**

Navigate to `/bookings/[id]`. Verify:
- Client + participants card shows EnrollmentGroup with rename/remove/bulk-add working
- "ver reserva →" link is present but points to current page — this is a known self-link; it can be hidden when `bookingId === current booking id` if desired (optional improvement)

- [ ] **Step 3: Delete the old component**

```bash
rm src/lib/components/clients/ClientParticipants.svelte
```

- [ ] **Step 4: Verify no remaining references**

```bash
grep -r "ClientParticipants" src/
```

Expected output: empty.

- [ ] **Step 5: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: replace ClientParticipants with EnrollmentGroup everywhere, delete old component"
```

---

## Task 11: /sessions list — add participant count + StatusBadge to SessionListCard

**Files:**
- Modify: `src/lib/components/sessions/SessionListCard.svelte`

- [ ] **Step 1: Read the current SessionListCard**

Read `src/lib/components/sessions/SessionListCard.svelte` to understand its current props and markup.

- [ ] **Step 2: Add StatusBadge import and replace inline status spans**

Add to script imports:
```svelte
import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
```

Find any inline status span patterns like:
```svelte
<span class="bg-green-100 text-green-700 ...">confirmed</span>
```
Replace with `<StatusBadge variant="confirmed" />` (matching the actual status value).

- [ ] **Step 3: Add participant count if available in props**

If `SessionListCard` already has a `participantCount` prop or it can be derived from `session.participants.length`, add it to the card display:

```svelte
{#if participantCount > 0}
  <span class="text-xs text-muted">{participantCount} participante{participantCount !== 1 ? 's' : ''}</span>
{/if}
```

If the prop doesn't exist, add it to the props interface and pass it from `/sessions/+page.svelte`.

- [ ] **Step 4: Verify sessions list page**

Navigate to `/sessions`. Verify session cards show status badge consistently and participant count where available.

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/sessions/SessionListCard.svelte src/routes/(app)/sessions/+page.svelte
git commit -m "feat(sessions-list): add StatusBadge and participant count to SessionListCard"
```

---

## Task 12: /clients list — add outstanding balance badge

**Files:**
- Modify: `src/routes/(app)/clients/+page.svelte`

- [ ] **Step 1: Read the current clients list page**

Read `src/routes/(app)/clients/+page.svelte` to understand the current client row structure.

- [ ] **Step 2: Add StatusBadge import**

```svelte
import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
```

- [ ] **Step 3: Each client row — add active booking count**

The clients list data likely comes from `data.clients`. Each client may or may not have booking counts. If the server doesn't provide `activeBookingCount`, this step is deferred — don't add a server query here, just apply StatusBadge to any existing status indicators.

If `data.clients` already includes `activeBookingCount` or `outstandingBalance`, add a visual indicator per row:

```svelte
{#if client.outstandingBalance > 0}
  <span class="text-xs font-semibold text-red-500">€{client.outstandingBalance.toFixed(0)} pend.</span>
{/if}
```

- [ ] **Step 4: Commit**

```bash
git add src/routes/(app)/clients/+page.svelte
git commit -m "feat(clients-list): add StatusBadge consistency pass"
```

---

## Task 13: Consistency passes — bookings list, services/sessions, bookings/new, agenda

**Files:**
- Modify: `src/routes/(app)/bookings/+page.svelte`
- Modify: `src/routes/(app)/services/[id]/sessions/+page.svelte`
- Modify: `src/routes/(app)/bookings/new/+page.svelte`
- Modify: `src/routes/(app)/agenda/+page.svelte`

For each file:

- [ ] **Step 1: bookings/+page.svelte — replace inline status pills with StatusBadge**

```svelte
import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
```

Find patterns like `bg-confirmed/15 text-green-700` or `bg-pending/30 text-amber-700` and replace the spans with `<StatusBadge variant={booking.status} />`.

- [ ] **Step 2: services/[id]/sessions/+page.svelte — same StatusBadge pass**

Import `StatusBadge` and replace inline status spans. `SessionCard` is already used here so sessions themselves are consistent — focus on any page-level status indicators.

- [ ] **Step 3: bookings/new/+page.svelte — wrap form sections in CardShell**

Import `CardShell`. The page already has a 3-col grid. Find the individual card divs (`rounded-(--radius-card) border ... p-4`) and wrap their content in `<CardShell label="..." icon={...}>`. Keep the same grid structure.

- [ ] **Step 4: agenda/+page.svelte — add service color dot + participant count to calendar event cards**

Read the agenda page. Find the event/session card markup. Add a service color dot if not present:
```svelte
<span class="h-2 w-2 shrink-0 rounded-full" style="background-color: {dotColor}"></span>
```

Add participant count if available from the event data.

- [ ] **Step 5: Commit all**

```bash
git add src/routes/(app)/bookings/+page.svelte src/routes/(app)/services/[id]/sessions/+page.svelte src/routes/(app)/bookings/new/+page.svelte src/routes/(app)/agenda/+page.svelte
git commit -m "feat(ui): StatusBadge + CardShell consistency pass across remaining pages"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] CardShell → Task 1
- [x] StatusBadge → Task 2
- [x] EnrollmentGroup (absorbs ClientParticipants) → Task 3
- [x] BookingMiniRow → Task 4
- [x] SessionTimelineRow → Task 5
- [x] Extend getBookingsForClient → Task 6
- [x] listSessionsForClient → Task 6
- [x] /sessions/[id] rebuild (sidebar+main) → Task 7
- [x] /clients/[id] rebuild (sidebar+main) → Task 8
- [x] /services/[id]/roster vocabulary update → Task 9
- [x] Delete ClientParticipants → Task 10
- [x] /sessions list consistency → Task 11
- [x] /clients list consistency → Task 12
- [x] Consistency passes (bookings, services/sessions, bookings/new, agenda) → Task 13
- [x] Mobile-first (all grids use grid-cols-1 md:grid-cols-[...]) → Tasks 7, 8
- [x] DRY — EnrollmentGroup used in booking detail, session detail, roster → Tasks 7, 9, 10

**Type consistency:**
- `StatusVariant` exported from `StatusBadge.svelte` and imported by `EnrollmentGroup.svelte`
- `ClientBookingSummary` updated in `types.ts` and used in `BookingMiniRow` props
- `listSessionsForClient` returns `{ sessionId, date, status, serviceName }[]` — matches `SessionTimelineRow` props

**Known edge cases:**
- `listSessionsForClient` uses `COALESCE` for serviceName — booking-owned sessions without a direct `serviceId` on the session get their service name via the booking join. If both are null, `serviceName` is null — `SessionTimelineRow` renders `'—'`.
- `EnrollmentGroup` "ver reserva →" on the booking detail page self-links (bookingId === current booking). This is harmless but could be hidden with `{#if bookingId !== currentBookingId}` as an optional improvement.
