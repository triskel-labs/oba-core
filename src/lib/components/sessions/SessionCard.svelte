<script lang="ts">
	import type { Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import type { Session, ClientGroup } from '$lib/features/sessions/types';
	import type { BookingParticipant } from '$lib/features/bookings/types';
	import { attendanceBadgeForParticipant } from '$lib/features/bookings/statusBadges';
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
			? []
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
		'scheduled'
	);

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
	<div class="flex w-18 shrink-0 flex-col items-center justify-center border-r border-gray-100 bg-gray-50/60 py-3">
		{#if showDate && mode === 'list'}
			<p class="text-[9px] font-medium text-muted">{fmtDateShort(session.date)}</p>
		{/if}
		{#if mode === 'booking'}
			<p class="text-[9px] font-bold uppercase tracking-wide text-muted">{fmtDateShort(session.date)}</p>
		{/if}
		{#if session.time}
			<p class="text-[15px] font-bold leading-none text-gray-900">{fmtTime(session.time)}</p>
			{#if dur}
				<p class="mt-0.5 text-[10px] text-gray-500">→ {endTime(session.time, dur)}</p>
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
				{#each participantPool as bp (bp.id)}
					{@const inSess = isInSession(bp)}
					{@const spId = sessionParticipantId(bp)}
					{@const attendanceBadge = attendanceBadgeForParticipant(session.status, inSess)}
					{#if inSess}
						<div class="mb-1 flex items-center justify-between rounded bg-green-50 px-2 py-1">
							<div class="min-w-0">
								<span class="block truncate text-[11px] font-medium text-gray-900">✓ {bp.name}</span>
								<StatusBadge variant={attendanceBadge.variant} label={attendanceBadge.label} class="mt-0.5 px-1.5 text-[8px]" />
							</div>
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
							class="mb-1 flex items-center justify-between rounded px-2 py-1 hover:bg-green-50/40">
							<input type="hidden" name="sessionId" value={session.id} />
							<input type="hidden" name="participantName" value={bp.name} />
							<input type="hidden" name="bookingParticipantId" value={bp.id} />
							<div class="min-w-0">
								<span class="block truncate text-[11px] text-gray-400">○ {bp.name}</span>
								<StatusBadge variant={attendanceBadge.variant} label={attendanceBadge.label} class="mt-0.5 px-1.5 text-[8px]" />
							</div>
							<button type="submit"
								onclick={(e) => e.stopPropagation()}
								class="text-[9px] font-semibold text-green-600">add</button>
						</form>
					{:else}
						<div class="mb-1 rounded bg-gray-50 px-2 py-1">
							<span class="block truncate text-[11px] text-gray-400">○ {bp.name}</span>
							<StatusBadge variant={attendanceBadge.variant} label={attendanceBadge.label} class="mt-0.5 px-1.5 text-[8px]" />
						</div>
					{/if}
				{/each}
				{#if participantPool.length === 0}
					<p class="text-[11px] italic text-gray-400">Sin participantes configurados.</p>
				{/if}
			{:else}
				<div class="flex flex-wrap gap-1">
					{#each group.participants as p}
						<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-medium text-blue-700">{p.name}</span>
					{/each}
				</div>
			{/if}
		</div>
	{/each}
{/snippet}

{#snippet cardFooter()}
	<div class="relative z-10 flex items-center justify-between border-t border-gray-100 bg-gray-50/40 px-3 py-1.5">
		<StatusBadge variant={sessionStatusVariant} />
		<div class="flex items-center gap-3">
			{#if onLink}
				<button type="button" onclick={() => onLink!(session.id)}
					class="rounded-md bg-green-600 px-3 py-1 text-[10px] font-bold text-white hover:bg-green-700">
					Vincular
				</button>
			{:else}
				{#if !isCancelled}
					<button type="button" onclick={(e) => { e.preventDefault(); editing = !editing; }}
						class="text-[10px] text-gray-400 hover:text-gray-700">Editar</button>
				{/if}
				{#if !isCancelled}
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
			class="relative z-10 grid grid-cols-2 gap-2 border-t border-gray-100 bg-gray-50 px-3 py-3">
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
	{#snippet listBody()}
		<div class="flex items-stretch">
			{#if color}
				<div class="w-1 shrink-0 rounded-l-(--radius-card) {color.bg}"></div>
			{/if}
			{@render timeBlock()}
			<div class="relative z-10 min-w-0 flex-1 p-3">
				{#if children}
					<div class="mb-2">
						{@render children()}
					</div>
				{/if}
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
				{#if clientGroups && clientGroups.length > 0}
					{@render clientGroupBoxes(clientGroups, false)}
				{:else if chips.length > 0}
					<div class="flex flex-wrap gap-1">
						{#each chips as name}
							<span class="rounded-full bg-blue-50 px-2 py-0.5 text-[9px] font-medium text-blue-700">{name}</span>
						{/each}
					</div>
				{/if}
				{#if session.notes}
					<p class="mt-1 truncate text-[10px] italic text-gray-400">{session.notes}</p>
				{/if}
			</div>
		</div>
		{#if extraContent}
			{@render extraContent()}
		{/if}
		{@render cardFooter()}
		{@render editForm()}
	{/snippet}

	<div class="relative overflow-hidden rounded-(--radius-card) border {isCancelled ? 'border-red-100 opacity-60' : 'border-gray-200'} bg-white shadow-sm {openHref ? 'cursor-pointer transition-all hover:border-ocean/30 hover:shadow-md' : ''}">
		{#if openHref}
			<a href={openHref} class="absolute inset-0 z-0" aria-label="Abrir sesión"></a>
		{/if}
		{@render listBody()}
	</div>

<!-- ════════════════════════════════════════════════════════ BOOKING MODE -->
{:else if mode === 'booking'}
	{#snippet bookingBody()}
		<div class="relative z-10 flex">
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
				{#if bookingClientName}
					{@render clientGroupBoxes([{ clientName: bookingClientName, bookingId, participants: [] }], true)}
				{:else if participantPool.length > 0}
					{@render clientGroupBoxes([{ clientName: 'Participantes', bookingId, participants: [] }], true)}
				{/if}
				{#if clientGroups && clientGroups.length > 0}
					{@render clientGroupBoxes(clientGroups.filter(g => g.bookingId !== bookingId), false)}
				{/if}
			</div>
		</div>
		{#if extraContent}
			{@render extraContent()}
		{/if}
		{@render cardFooter()}
		{@render editForm()}
	{/snippet}

	<div class="relative overflow-hidden rounded-(--radius-card) border {isCancelled ? 'border-red-100 opacity-60' : 'border-gray-200'} bg-white shadow-sm {openHref ? 'cursor-pointer transition-all hover:border-ocean/30 hover:shadow-md' : ''}">
		{#if openHref}
			<a href={openHref} class="absolute inset-0 z-0" aria-label="Abrir sesión"></a>
		{/if}
		{@render bookingBody()}
	</div>
{/if}
