<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import { getServiceColor } from '$lib/features/services/colors';
	import { Calendar, User, Waves, CreditCard, Users } from 'lucide-svelte';
	import type { PageData } from './$types';
	import CardShell from '$lib/components/ui/CardShell.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import EnrollmentGroup from '$lib/components/bookings/EnrollmentGroup.svelte';

	let { data }: { data: PageData } = $props();

	const color = $derived(getServiceColor(data.serviceColor ?? ''));
	const isCancelled = $derived(data.session.status === 'cancelled');
	const activeEnrollments = $derived(data.enrollments.filter(e => e.status !== 'cancelled'));

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

	function ownerLabel() {
		if (data.session.ownerType === 'service') return 'Clase de grupo';
		if (data.session.ownerType === 'edition') return 'Campamento';
		return 'Clase privada';
	}

	const sessionStatusVariant = $derived(
		data.session.status === 'cancelled'   ? 'cancelled'   :
		data.session.status === 'completed'   ? 'completed'   :
		data.session.status === 'unscheduled' ? 'unscheduled' :
		'active'
	);

	// Edit state
	let editingSession = $state(false);
	let editTime = $state(data.session.time?.slice(0, 5) ?? '');
	let editDuration = $state(data.session.effectiveDuration ?? 60);
	let editLevel = $state(data.session.skillLevel ?? '');

	$effect(() => {
		if (!editingSession) {
			editTime = data.session.time?.slice(0, 5) ?? '';
			editDuration = data.session.effectiveDuration ?? 60;
			editLevel = data.session.skillLevel ?? '';
		}
	});

	// Session-level participant CRUD state
	let editingParticipantId = $state<string | null>(null);
	let editingParticipantName = $state('');
	let removingParticipantId = $state<string | null>(null);
	let addOpen = $state(false);
	let addName = $state('');

	function startEdit(p: { id: string; name: string }) {
		editingParticipantId = p.id;
		editingParticipantName = p.name;
		removingParticipantId = null;
	}
	function startRemove(id: string) {
		removingParticipantId = id;
		editingParticipantId = null;
	}
	function cancelParticipantEdit() {
		editingParticipantId = null;
		removingParticipantId = null;
	}

	// Inventory helpers (booking sessions only)
	function allocsForParticipant(bookingParticipantId: string | null) {
		return data.bookingAllocations.filter(a =>
			(a.bookingParticipantId ?? null) === bookingParticipantId
		);
	}
	function missingTypes() {
		const assignedTypeIds = new Set(data.bookingAllocations.map(a => a.itemTypeId));
		return data.serviceInventoryLinks.filter(l => !assignedTypeIds.has(l.itemTypeId));
	}

	// Group sessions: participant list per bookingId for EnrollmentGroup
	const participantsByBookingId = $derived.by(() => {
		const map = new Map<string, { id: string; name: string }[]>();
		for (const p of data.participants) {
			if (!p.bookingId) continue;
			const bucket = map.get(p.bookingId) ?? [];
			bucket.push({ id: p.id, name: p.name });
			map.set(p.bookingId, bucket);
		}
		return map;
	});

	// Group sessions: aggregate payment totals across all active enrollments
	const totalDue = $derived(
		activeEnrollments.reduce((s, e) => s + (parseFloat(e.amountDue) || 0), 0)
	);
	const totalPaid = $derived(
		activeEnrollments.reduce((s, e) => s + (parseFloat(e.amountPaid) || 0), 0)
	);

	function enrollmentPaymentVariant(e: { amountDue: string; amountPaid: string }): 'paid' | 'partial' | 'pending' | undefined {
		const due = parseFloat(e.amountDue);
		const paid = parseFloat(e.amountPaid);
		if (isNaN(due) || isNaN(paid) || due <= 0) return undefined;
		if (paid >= due) return 'paid';
		if (paid > 0) return 'partial';
		return 'pending';
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<!-- TOP BANNER: service name + date + status (details moved to sidebar) -->
	<div class="border-b border-l-4 {color.border} {color.bg} px-4 py-3 sm:px-6">
		<div class="flex items-start justify-between gap-3">
			<div class="min-w-0">
				<div class="mb-1 flex items-center gap-2">
					<a href={data.backLink} class="text-xs text-muted hover:text-navy">← {data.backLabel}</a>
					<StatusBadge variant={sessionStatusVariant} />
					<span class="text-[10px] font-medium text-muted">{ownerLabel()}</span>
				</div>
				<p class="text-lg font-bold text-navy">{data.serviceName ?? '—'}</p>
				<p class="text-sm text-gray-600">
					{new Date(data.session.date + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
				</p>
			</div>

			{#if !isCancelled}
				<div class="flex shrink-0 flex-col items-end gap-1.5">
					<button type="button" onclick={() => editingSession = !editingSession}
						class="btn-primary btn-sm text-xs">
						{editingSession ? 'Cerrar' : 'Editar'}
					</button>
					<form method="POST" action="?/cancelSession" use:enhance={withToast()}>
						<button type="submit" class="text-[10px] text-amber-600 hover:underline">Cancelar sesión</button>
					</form>
					<form method="POST" action="?/deleteSession" use:enhance>
						<input type="hidden" name="backLink" value={data.backLink} />
						<button type="submit"
							onclick={(e) => { if (!confirm('¿Eliminar esta sesión permanentemente?')) e.preventDefault(); }}
							class="text-[10px] text-red-500 hover:underline">Eliminar</button>
					</form>
				</div>
			{/if}
		</div>
	</div>

	<!-- EDIT FORM -->
	{#if editingSession}
		<div class="border-b border-border bg-gray-50 px-4 py-4 sm:px-6">
			<form method="POST" action="?/updateSession"
				use:enhance={withToast(() => { editingSession = false; })}
				class="grid grid-cols-2 gap-3 md:grid-cols-4">
				<div>
					<label class="label text-xs">Hora</label>
					<input name="time" type="time" bind:value={editTime} class="input text-sm w-full" />
				</div>
				<div>
					<label class="label text-xs">Duración (min)</label>
					<input name="durationMinutes" type="number" min="1" bind:value={editDuration} class="input text-sm w-full" />
				</div>
				<div class="col-span-2">
					<label class="label text-xs">Notas</label>
					<input name="notes" type="text" value={data.session.notes ?? ''} class="input text-sm w-full" />
				</div>
				<div class="col-span-2 md:col-span-4">
					<label class="label text-xs mb-1 block">Instructor</label>
					<div class="flex flex-wrap gap-3">
						{#each data.instructors as inst}
							<label class="flex cursor-pointer items-center gap-1.5">
								<input type="checkbox" name="instructorId" value={inst.id}
									checked={data.session.instructors.some(i => i.instructorId === inst.id)}
									class="h-3.5 w-3.5 accent-ocean" />
								<span class="text-xs text-gray-700">{inst.name}</span>
							</label>
						{/each}
					</div>
				</div>
				{#if data.session.ownerType === 'booking'}
					<div class="col-span-2 md:col-span-4">
						<label class="label text-xs mb-1 block">Nivel</label>
						<div class="flex gap-1.5">
							{#each [{ v: 'beginner', l: 'Principiante' }, { v: 'intermediate', l: 'Intermedio' }, { v: 'advanced', l: 'Avanzado' }] as lvl}
								<button type="button" onclick={() => editLevel = editLevel === lvl.v ? '' : lvl.v}
									class="rounded border px-3 py-1 text-xs font-medium transition-colors
										{editLevel === lvl.v ? 'border-ocean bg-ocean/10 text-ocean' : 'border-border text-muted hover:border-gray-400'}">
									{lvl.l}
								</button>
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

	<!-- MAIN CONTENT: sidebar + main -->
	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		<div class="grid grid-cols-1 gap-4 md:grid-cols-[280px_1fr]">

			<!-- SIDEBAR -->
			<div class="space-y-4">
				<!-- Session info -->
				<CardShell label="Sesión" icon={Calendar}>
					<dl class="space-y-2 text-sm">
						<div class="flex items-center justify-between">
							<dt class="text-xs text-muted">Hora</dt>
							<dd class="font-semibold text-gray-900">{timeRange}</dd>
						</div>
						{#if data.session.effectiveDuration}
							<div class="flex items-center justify-between">
								<dt class="text-xs text-muted">Duración</dt>
								<dd class="text-gray-700">{data.session.effectiveDuration} min</dd>
							</div>
						{/if}
						{#if data.session.skillLevel}
							<div class="flex items-center justify-between">
								<dt class="text-xs text-muted">Nivel</dt>
								<dd><StatusBadge variant={data.session.skillLevel} /></dd>
							</div>
						{/if}
						{#if data.session.notes}
							<div class="border-t border-border pt-2">
								<p class="text-xs italic text-muted">{data.session.notes}</p>
							</div>
						{/if}
					</dl>
				</CardShell>

				<!-- Instructor -->
				<CardShell label="Monitor" icon={Waves}>
					{#if data.session.instructors.length > 0}
						<ul class="space-y-2">
							{#each data.session.instructors as inst}
								<li class="flex items-center gap-2">
									<div class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
										{inst.instructorName?.charAt(0) ?? '?'}
									</div>
									<span class="text-sm font-medium text-gray-800">{inst.instructorName ?? '—'}</span>
								</li>
							{/each}
						</ul>
					{:else}
						<p class="text-xs text-muted">Sin monitor asignado</p>
					{/if}
				</CardShell>

				<!-- Payment totals (group/edition sessions with amounts) -->
				{#if data.session.ownerType !== 'booking' && activeEnrollments.length > 0 && totalDue > 0}
					<CardShell label="Pagos" icon={CreditCard}>
						<dl class="space-y-2 text-sm">
							<div class="flex items-center justify-between">
								<dt class="text-xs text-muted">Total</dt>
								<dd class="font-semibold text-gray-900">€{totalDue.toFixed(0)}</dd>
							</div>
							<div class="flex items-center justify-between">
								<dt class="text-xs text-muted">Cobrado</dt>
								<dd class="text-green-700">€{totalPaid.toFixed(0)}</dd>
							</div>
							{#if totalDue - totalPaid > 0}
								<div class="flex items-center justify-between border-t border-border pt-2">
									<dt class="text-xs font-semibold text-red-600">Pendiente</dt>
									<dd class="font-bold text-red-600">€{(totalDue - totalPaid).toFixed(0)}</dd>
								</div>
							{/if}
						</dl>
					</CardShell>
				{/if}
			</div>

			<!-- MAIN AREA -->
			<div class="space-y-4">

				{#if data.session.ownerType === 'booking'}
					<!-- ── BOOKING SESSION ── -->
					{@const missing = missingTypes()}

					<!-- Missing inventory alert -->
					{#if missing.length > 0 && !isCancelled}
						<div class="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
							<p class="text-xs font-semibold text-amber-800">⚠ Equipo pendiente de asignar</p>
							<p class="mt-0.5 text-xs text-amber-700">
								{missing.map(l => l.itemType.name).join(' · ')}
							</p>
							{#if data.backLink.startsWith('/bookings/')}
								<a href="{data.backLink}#inventory" class="mt-1.5 block text-xs font-medium text-amber-700 hover:underline">
									Asignar en la reserva →
								</a>
							{/if}
						</div>
					{/if}

					<!-- Client info -->
					{#if data.bookingClientName}
						<CardShell label="Cliente" icon={User}>
							<div class="flex items-center justify-between">
								<span class="text-sm font-semibold text-navy">{data.bookingClientName}</span>
								<a href={data.backLink} class="text-xs text-ocean hover:underline">Ver reserva →</a>
							</div>
						</CardShell>
					{/if}

					<!-- Inventory per participant -->
					{#if data.bookingAllocations.length > 0 || data.serviceInventoryLinks.length > 0}
						<div class="overflow-hidden rounded-xl border border-orange-100 bg-white shadow-sm">
							<div class="border-b border-orange-100 bg-orange-50 px-4 py-2.5">
								<span class="text-xs font-bold uppercase tracking-wide text-orange-700">🎒 Equipamiento</span>
							</div>

							{#if data.participants.length > 0}
								<div class="divide-y divide-gray-50">
									{#each data.participants as p}
										{@const allocs = allocsForParticipant(p.bookingParticipantId ?? null)}
										<div class="px-4 py-3">
											<p class="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-blue-700">{p.name}</p>
											{#if allocs.length > 0}
												<div class="flex flex-wrap gap-1.5">
													{#each allocs as a}
														<div class="rounded-lg border px-2.5 py-1.5
															{a.itemId === null ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}">
															<p class="text-[11px] font-semibold {a.itemId === null ? 'text-amber-800' : 'text-emerald-800'}">
																{a.itemId === null ? '⚠' : '✓'} {a.itemTypeName}
															</p>
															{#if a.attributeFilter && Object.keys(a.attributeFilter).length > 0}
																<p class="text-[9px] {a.itemId === null ? 'text-amber-600' : 'text-emerald-600'}">
																	{Object.values(a.attributeFilter).join(' · ')}
																</p>
															{/if}
														</div>
													{/each}
												</div>
											{:else}
												<p class="text-[11px] text-gray-300">Sin equipo asignado</p>
											{/if}
										</div>
									{/each}

									<!-- Booking-level (no participant) allocations -->
									{#each [allocsForParticipant(null)] as bookingAllocs}
										{#if bookingAllocs.length > 0}
											<div class="px-4 py-3">
												<p class="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-gray-400">Sin asignar</p>
												<div class="flex flex-wrap gap-1.5">
													{#each bookingAllocs as a}
														<div class="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-1.5">
															<p class="text-[11px] font-semibold text-gray-700">{a.itemTypeName}</p>
															{#if a.attributeFilter && Object.keys(a.attributeFilter).length > 0}
																<p class="text-[9px] text-gray-500">{Object.values(a.attributeFilter).join(' · ')}</p>
															{/if}
														</div>
													{/each}
												</div>
											</div>
										{/if}
									{/each}
								</div>
							{:else if data.bookingAllocations.length > 0}
								<div class="flex flex-wrap gap-1.5 px-4 py-3">
									{#each data.bookingAllocations as a}
										<div class="rounded-lg border px-2.5 py-1.5
											{a.itemId === null ? 'border-amber-200 bg-amber-50' : 'border-emerald-200 bg-emerald-50'}">
											<p class="text-[11px] font-semibold {a.itemId === null ? 'text-amber-800' : 'text-emerald-800'}">
												{a.itemId === null ? '⚠' : '✓'} {a.itemTypeName}
											</p>
										</div>
									{/each}
								</div>
							{/if}

							{#if !isCancelled}
								<div class="border-t border-orange-100 px-4 py-2">
									<a href="{data.backLink}#inventory" class="text-xs text-orange-600 hover:underline">
										Gestionar equipamiento →
									</a>
								</div>
							{/if}
						</div>
					{/if}

					<!-- Session participants -->
					{@render participantsModule()}

				{:else}
					<!-- ── GROUP / EDITION SESSION ── -->

					<!-- Enrolled bookings with one EnrollmentGroup per enrollment -->
					<CardShell label="{data.session.ownerType === 'edition' ? 'Inscripciones' : 'Reservas'} · {activeEnrollments.length}" icon={Users}>
						{#snippet footer()}
							{#if data.serviceId && !isCancelled}
								<a href="/bookings/new?serviceId={data.serviceId}&date={data.session.date}"
									class="text-xs font-medium text-ocean hover:underline">+ Nueva reserva</a>
							{/if}
						{/snippet}

						{#if activeEnrollments.length === 0}
							<p class="text-sm text-muted">Sin reservas asignadas.</p>
						{:else}
							<div class="space-y-2">
								{#each activeEnrollments as e}
									<EnrollmentGroup
										clientName={`${e.firstName ?? ''} ${e.lastName ?? ''}`.trim() || '—'}
										bookingId={e.bookingId}
										participants={participantsByBookingId.get(e.bookingId) ?? []}
										paymentStatus={enrollmentPaymentVariant(e)}
										amountPaid={e.amountPaid}
										amountDue={e.amountDue}
										canEdit={false}
									/>
								{/each}
							</div>
						{/if}
					</CardShell>

					<!-- Assign existing booking (service sessions only) -->
					{#if data.assignableBookings.length > 0 && data.session.ownerType === 'service'}
						<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
							<details>
								<summary class="flex cursor-pointer select-none items-center justify-between gap-2 px-4 py-3 hover:bg-gray-50">
									<span class="text-xs font-bold uppercase tracking-wide text-gray-500">Asignar reserva existente</span>
									<span class="text-xs text-muted">{data.assignableBookings.length} disponible{data.assignableBookings.length !== 1 ? 's' : ''}</span>
								</summary>
								<ul class="divide-y divide-gray-100 border-t border-gray-100">
									{#each data.assignableBookings as u}
										<li class="flex items-center justify-between gap-3 px-4 py-2.5">
											<div class="min-w-0 flex-1">
												<a href="/bookings/{u.bookingId}" class="block truncate text-sm font-medium text-navy hover:underline">
													{u.firstName ?? ''} {u.lastName ?? ''}
												</a>
												{#if u.currentSessionId}
													<p class="text-[10px] text-amber-600">Ya asignada a otra sesión</p>
												{:else}
													<p class="text-[10px] text-muted">Sin sesión</p>
												{/if}
											</div>
											<form method="POST" action="?/assignBooking" use:enhance={withToast()}>
												<input type="hidden" name="bookingId" value={u.bookingId} />
												<button type="submit"
													class="shrink-0 rounded-lg bg-ocean px-3 py-1 text-xs font-medium text-white hover:bg-ocean/90">
													{u.currentSessionId ? 'Reasignar' : 'Asignar'}
												</button>
											</form>
										</li>
									{/each}
								</ul>
							</details>
						</div>
					{/if}

					<!-- Session-level participant CRUD -->
					{@render participantsModule()}
				{/if}

			</div>
		</div>
	</div>
</div>

{#snippet participantsModule()}
<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
	<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50/60 px-4 py-2.5">
		<span class="text-xs font-bold uppercase tracking-wide text-gray-500">Participantes</span>
		<span class="text-xs text-muted">{data.participants.length}</span>
	</div>

	{#if data.participants.length === 0}
		<p class="px-4 py-3 text-xs text-muted">Sin participantes nombrados.</p>
	{:else}
		<ul class="divide-y divide-gray-50">
			{#each data.participants as p}
				<li class="px-4 py-2.5">
					{#if editingParticipantId === p.id}
						<form method="POST" action="?/renameParticipant"
							use:enhance={withToast(() => { editingParticipantId = null; })}
							class="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5">
							<input type="hidden" name="participantId" value={p.id} />
							<input name="name" type="text" bind:value={editingParticipantName}
								class="flex-1 rounded border border-border px-2 py-0.5 text-xs focus:border-ocean focus:outline-none"
								autofocus />
							<button type="submit" class="text-[10px] font-semibold text-ocean">✓</button>
							<button type="button" onclick={cancelParticipantEdit} class="text-[10px] text-muted">✕</button>
						</form>
					{:else if removingParticipantId === p.id}
						<div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
							<p class="mb-1.5 text-[10px] font-semibold text-red-700">¿Eliminar a {p.name}?</p>
							<div class="flex gap-2">
								<form method="POST" action="?/removeParticipant"
									use:enhance={withToast(() => { removingParticipantId = null; })}>
									<input type="hidden" name="participantId" value={p.id} />
									<button type="submit" class="text-[10px] font-semibold text-red-600 hover:underline">Confirmar</button>
								</form>
								<button type="button" onclick={cancelParticipantEdit}
									class="text-[10px] text-muted hover:text-gray-700">Cancelar</button>
							</div>
						</div>
					{:else}
						<div class="flex items-center gap-2">
							<div class="min-w-0 flex-1">
								<span class="text-sm font-medium text-gray-800">{p.name}</span>
								{#if p.bookingId && p.clientFirstName}
									<a href="/bookings/{p.bookingId}" class="ml-2 text-[10px] text-ocean hover:underline">
										{p.clientFirstName} {p.clientLastName ?? ''} →
									</a>
								{/if}
							</div>
							{#if !isCancelled}
								<button type="button" onclick={() => startEdit(p)}
									class="shrink-0 text-[10px] text-muted hover:text-ocean">✎</button>
								<button type="button" onclick={() => startRemove(p.id)}
									class="shrink-0 text-[10px] text-red-300 hover:text-red-600">✕</button>
							{/if}
						</div>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}

	{#if !isCancelled}
		<div class="border-t border-gray-100 px-4 py-3">
			{#if addOpen}
				<form method="POST" action="?/addParticipant"
					use:enhance={withToast(() => { addOpen = false; addName = ''; })}
					class="flex gap-2">
					<input name="participantName" bind:value={addName}
						placeholder="Nombre del participante…"
						class="input text-sm flex-1" autofocus />
					<button type="submit" class="btn-primary btn-sm shrink-0">Añadir</button>
					<button type="button" onclick={() => { addOpen = false; addName = ''; }}
						class="btn-ghost btn-sm shrink-0">✕</button>
				</form>
			{:else}
				<button type="button" onclick={() => addOpen = true}
					class="w-full rounded-lg border border-dashed border-blue-200 bg-blue-50/40 py-2 text-[10px] font-medium text-blue-600 hover:bg-blue-50">
					+ Añadir participante
				</button>
			{/if}
		</div>
	{/if}
</div>
{/snippet}
