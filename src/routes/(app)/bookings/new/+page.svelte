<script lang="ts">
	import { untrack } from 'svelte';
	import { Zap, User } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import { DOT_COLORS } from '$lib/features/services/colors';
	import type { ServiceColorKey } from '$lib/features/services/colors';
	import { calculateBookingCreateAmount } from '$lib/features/bookings/createPricing';
	import type { PageData } from './$types';
	import type { ServiceEdition } from '$lib/features/services/editions.types';
	import ClientSearchInput from '$lib/components/ClientSearchInput.svelte';

	let { data }: { data: PageData } = $props();
	type AssignableSession = {
		id: string;
		serviceId: string;
		date: string;
		time: string | null;
		durationMinutes: number | null;
		enrolledCount: number;
		maxCapacity: number | null;
		slotsLeft: number | null;
	};
	const dataWithSessions = $derived(data as PageData & { sessionsByServiceId: Record<string, AssignableSession[]> });
	let loading = $state(false);

	// ── Service ───────────────────────────────────────────────────────────────
	let selectedServiceId = $state(data.defaultServiceId || (data.services[0]?.id ?? ''));
	const selectedService = $derived(data.services.find(s => s.id === selectedServiceId));
	const modules = $derived(selectedService?.modules ?? {});
	const selectedWorkflow = $derived(selectedServiceId ? data.workflowByServiceId[selectedServiceId] : undefined);
	const hasEditions   = $derived('editions' in modules);
	const hasSessions   = $derived('sessions' in modules || selectedWorkflow?.archetype === 'private_lesson');
	const hasInventory  = $derived('inventory' in modules);
	const hasInstructor = $derived('instructor' in modules);
	const hasCredits    = $derived('credits' in modules);
	const isPrivateLessonScheduling = $derived(selectedWorkflow?.archetype === 'private_lesson');
	const isGroupSessionBooking = $derived(selectedWorkflow?.archetype === 'group_class');
	const groupSessions = $derived(selectedServiceId ? (dataWithSessions.sessionsByServiceId[selectedServiceId] ?? []) : []);
	let selectedGroupSessionId = $state('');
	let groupSessionMode = $state<'existing' | 'new'>('existing');
	const selectedGroupSession = $derived(groupSessionMode === 'existing' ? groupSessions.find((session) => session.id === selectedGroupSessionId) : undefined);
	const showDateField = $derived(!hasSessions && !hasEditions);
	const showTimeField = $derived(!hasSessions && !hasEditions && !hasInventory);
	const showInstructor = $derived(hasInstructor && !hasSessions);

	// ── Editions ──────────────────────────────────────────────────────────────
	let editions = $state<ServiceEdition[]>(
		selectedServiceId ? (data.editionsByService[selectedServiceId] ?? []) : []
	);
	let editionsLoading = $state(false);
	let selectedEditionId = $state(data.defaultEditionId ?? '');
	const selectedEdition = $derived(editions.find(e => e.id === selectedEditionId));

	let _svcInit = false;
	$effect(() => {
		const svcId = selectedServiceId;
		untrack(() => {
			if (!_svcInit) { _svcInit = true; return; }
			selectedEditionId = '';
			if (!svcId) { editions = []; return; }
			editionsLoading = true;
			fetch(`/bookings/new?serviceId=${svcId}`)
				.then(r => r.json())
				.then((eds: ServiceEdition[]) => { editions = eds; editionsLoading = false; })
				.catch(() => { editionsLoading = false; });
		});
	});

	// ── Dates ─────────────────────────────────────────────────────────────────
	const today = new Date().toISOString().slice(0, 10);
	let date = $state(data.defaultDate || today);
	let time = $state(data.defaultTime ?? '');
	let isFlexible = $state((data.defaultTime ?? '') === '');
	let sessionScheduleMode = $state<'later' | 'scheduled'>('later');
	let sessionModalOpen = $state(false);
	let scheduledSessionDate = $state(data.defaultDate || today);
	let scheduledSessionTime = $state(data.defaultTime ?? '');
	let scheduledSessionDuration = $state(60);
	let scheduledSessionInstructorId = $state('');
	let invCheckIn = $state('');
	let invCheckOut = $state('');

	const inventoryPricingMode = $derived(selectedService?.pricingMode ?? null);
	const inventoryNeedsDateRange = $derived(
		inventoryPricingMode === 'per_night' || inventoryPricingMode === 'per_day' ||
		inventoryPricingMode === 'per_unit_per_day' || inventoryPricingMode === 'per_person_per_day'
	);
	function calcInvUnits(): number {
		if (!inventoryNeedsDateRange || !invCheckIn || !invCheckOut) return 1;
		return Math.max(1, Math.round((new Date(invCheckOut).getTime() - new Date(invCheckIn).getTime()) / 86_400_000));
	}
	const invCalculatedAmount = $derived(calcAmountDue());

	// ── Credits ───────────────────────────────────────────────────────────────
	let packQuantity = $state(1);
	$effect(() => { if (!hasCredits) packQuantity = 1; });
	$effect(() => {
		if (!isPrivateLessonScheduling && !(isGroupSessionBooking && groupSessionMode === 'new')) {
			sessionScheduleMode = 'later';
			sessionModalOpen = false;
		}
		if (!isGroupSessionBooking) {
			selectedGroupSessionId = '';
			groupSessionMode = 'existing';
		} else if (groupSessionMode === 'existing' && selectedGroupSessionId && !groupSessions.some((session) => session.id === selectedGroupSessionId)) {
			selectedGroupSessionId = '';
		}
		if (selectedService?.durationMinutes && sessionScheduleMode === 'later') {
			scheduledSessionDuration = selectedService.durationMinutes;
		}
	});

	// ── Client ────────────────────────────────────────────────────────────────
	let selectedClient = $state<{ clientId: string; name: string } | null>(null);

	// ── Participants ──────────────────────────────────────────────────────────
	let participantCount = $state(1);
	let clientAlsoParticipates = $state(true);

	// ── Price preview ─────────────────────────────────────────────────────────
	function calcAmountDue(): string {
		return calculateBookingCreateAmount({
			basePrice: selectedService?.basePrice,
			pricingMode: selectedService?.pricingMode,
			participantCount,
			sessionsIncluded: selectedService?.defaultSessionsIncluded ?? 1,
			days: hasInventory && inventoryNeedsDateRange ? calcInvUnits() : 1,
			quantity: hasCredits ? packQuantity : 1,
			isCreditsService: hasCredits
		});
	}
	const pricePreview = $derived(calcAmountDue());

	function pricingLabel(mode: string | null | undefined): string {
		switch (mode) {
			case 'flat': return 'precio fijo';
			case 'per_person': return 'por persona';
			case 'per_session': return 'por sesión';
			case 'per_person_per_session': return 'persona/sesión';
			case 'per_day': return 'por día';
			case 'per_night': return 'por noche';
			case 'per_unit': return 'por unidad';
			case 'per_unit_per_day': return 'unidad/día';
			case 'per_person_per_day': return 'persona/día';
			case 'per_hour': return 'por hora';
			case 'per_half_day': return 'medio día';
			default: return 'precio';
		}
	}

	function serviceFacts(service: PageData['services'][number]): string[] {
		const facts = [`€${service.basePrice} ${pricingLabel(service.pricingMode)}`];
		if (service.durationMinutes) facts.push(`${service.durationMinutes} min`);
		if (service.defaultSessionsIncluded) facts.push(`${service.defaultSessionsIncluded} sesión${service.defaultSessionsIncluded !== 1 ? 'es' : ''}`);
		if (service.maxCapacity) facts.push(`${service.maxCapacity} plazas`);
		return facts;
	}
</script>

<div class="w-full space-y-4 p-3 md:p-6">

	<!-- HEADER -->
	<div class="flex items-start gap-3">
		<button onclick={() => history.length > 1 ? history.back() : goto('/bookings')}
			class="btn-ghost btn-sm mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-0">←</button>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				{#if selectedService}
					<span class="inline-block h-3 w-3 shrink-0 rounded-full"
						style="background-color: {DOT_COLORS[(selectedService.color ?? 'ocean') as ServiceColorKey]}"></span>
				{:else}
					<span class="inline-block h-3 w-3 shrink-0 rounded-full bg-gray-300"></span>
				{/if}
				<h1 class="text-xl font-bold text-navy">Nueva reserva</h1>
			</div>
			<p class="mt-0.5 text-sm text-muted">
				{selectedService?.name ?? 'Selecciona un servicio'}
			</p>
		</div>
	</div>

	<form
		method="post"
		use:enhance={() => {
			loading = true;
			return async ({ result, update }) => {
				loading = false;
				if (result.type === 'success' && result.data) {
					const d = result.data as { bookingId?: string; multiDay?: boolean; date?: string; message?: string };
					toast(d.message ?? 'Reserva creada');
					if (d.multiDay) await goto(`/calendar?date=${d.date}`);
					else if (d.bookingId) await goto(`/bookings/${d.bookingId}?new=1`);
				} else if (result.type === 'failure') {
					if ((result.data as { error?: string })?.error)
						toast((result.data as { error: string }).error, 'error');
					await update();
				} else {
					await update();
				}
			};
		}}
	>

	<!-- TOP ROW GRID — same as detail page -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.6fr_1fr]">

		<!-- SERVICE CARD -->
		<div class="rounded-(--radius-card) border border-blue-100 bg-blue-50/60 p-4 space-y-3">
			<div class="flex items-center justify-between gap-2">
				<div>
					<div class="text-[10px] font-bold uppercase tracking-wider text-blue-700">📋 Servicio</div>
					{#if data.services.length > 5}
						<p class="mt-0.5 text-[10px] font-medium text-blue-600">{data.services.length} servicios · desplaza esta lista ↓</p>
					{/if}
				</div>
				{#if selectedService}
					<span class="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-muted ring-1 ring-blue-100">
						€{pricePreview}
					</span>
				{/if}
			</div>

			<input type="hidden" name="serviceId" value={selectedServiceId} />
			<div class="relative">
				<div class="max-h-[26rem] overflow-y-auto rounded-2xl border border-blue-100 bg-white/45 p-1 pr-2 shadow-inner overscroll-contain">
					<div class="grid gap-2 sm:grid-cols-2 md:grid-cols-1">
				{#each data.services as s (s.id)}
					<button
						type="button"
						onclick={() => { selectedServiceId = s.id; }}
						class="w-full rounded-xl border bg-white p-3 text-left transition
							{selectedServiceId === s.id ? 'border-ocean ring-2 ring-ocean/20' : 'border-blue-100 hover:border-ocean/40'}"
					>
						<div class="flex items-start gap-2">
							<span class="mt-0.5 inline-block h-3 w-3 shrink-0 rounded-full"
								style="background-color: {DOT_COLORS[(s.color ?? 'ocean') as ServiceColorKey]}"></span>
							<div class="min-w-0 flex-1">
								<div class="flex items-center justify-between gap-2">
									<p class="truncate text-sm font-bold text-navy">{s.name}</p>
									{#if selectedServiceId === s.id}
										<span class="text-xs font-bold text-ocean">✓</span>
									{/if}
								</div>
								<p class="mt-1 text-[11px] leading-snug text-muted">
									{serviceFacts(s).join(' · ')}
								</p>
							</div>
						</div>
					</button>
						{/each}
					</div>
				</div>
				{#if data.services.length > 5}
					<div class="pointer-events-none absolute inset-x-2 bottom-0 h-8 rounded-b-2xl bg-gradient-to-t from-blue-50/95 to-transparent"></div>
				{/if}
			</div>

			{#if selectedService}
				<p class="rounded-lg bg-white/70 px-3 py-2 text-[11px] leading-snug text-muted ring-1 ring-blue-100">
					Base: €{selectedService.basePrice} · {pricingLabel(selectedService.pricingMode)}{selectedService.durationMinutes ? ` · ${selectedService.durationMinutes} min` : ''}{selectedService.maxCapacity ? ` · ${selectedService.maxCapacity} plazas` : ''}
				</p>
			{/if}

			<!-- Date / edition / time fields go here -->
			{#if hasEditions}
				<div class="border-t border-blue-100 pt-3">
					<p class="mb-1.5 text-[10px] font-semibold text-gray-500">Edición</p>
					{#if editionsLoading}
						<p class="text-xs text-muted">Cargando...</p>
					{:else if editions.length > 0}
						<select name="serviceEditionId" bind:value={selectedEditionId} required
							class="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs focus:border-ocean focus:outline-none">
							<option value="">Seleccionar edición...</option>
							{#each editions as ed (ed.id)}
								<option value={ed.id} disabled={!ed.active}>
									{ed.startDate} → {ed.endDate}{ed.maxCapacity ? ` (${ed.enrolledCount ?? 0}/${ed.maxCapacity})` : ''}{ed.notes ? ` · ${ed.notes}` : ''}
								</option>
							{/each}
						</select>
						{#if selectedEdition}
							<input type="hidden" name="date" value={selectedEdition.startDate} />
							<input type="hidden" name="dateEnd" value={selectedEdition.endDate} />
						{/if}
					{:else}
						<p class="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
							Sin ediciones. <a href="/services/{selectedService?.id}" class="underline">Añadir</a>
						</p>
					{/if}
				</div>


			{:else if isGroupSessionBooking}
				<input type="hidden" name="groupSessionMode" value={groupSessionMode} />
				<input type="hidden" name="date" value={groupSessionMode === 'new' ? scheduledSessionDate : (selectedGroupSession?.date ?? today)} />
				{#if groupSessionMode === 'existing' && selectedGroupSession}
					<input type="hidden" name="sessionId" value={selectedGroupSession.id} />
				{:else if groupSessionMode === 'new'}
					<input type="hidden" name="sessionDate" value={scheduledSessionDate} />
					<input type="hidden" name="sessionTime" value={scheduledSessionTime} />
					<input type="hidden" name="sessionDuration" value={scheduledSessionDuration} />
					{#if scheduledSessionInstructorId}
						<input type="hidden" name="sessionInstructorId" value={scheduledSessionInstructorId} />
					{/if}
				{/if}
				<div class="space-y-3 border-t border-blue-100 pt-3">
					<p class="text-[10px] font-semibold text-gray-500">Sesión de grupo</p>
					<div class="grid grid-cols-2 gap-2">
						<button
							type="button"
							onclick={() => { groupSessionMode = 'existing'; sessionModalOpen = false; }}
							class="rounded-xl border px-3 py-2 text-left text-xs transition
								{groupSessionMode === 'existing' ? 'border-ocean bg-ocean/5 text-ocean ring-2 ring-ocean/15' : 'border-blue-100 bg-white text-muted hover:border-ocean/40'}"
						>
							<span class="block font-bold">Apuntar a sesión existente</span>
							<span class="mt-0.5 block text-[10px] leading-snug opacity-80">Usa un hueco ya abierto.</span>
						</button>
						<button
							type="button"
							onclick={() => { groupSessionMode = 'new'; sessionModalOpen = true; }}
							class="rounded-xl border px-3 py-2 text-left text-xs transition
								{groupSessionMode === 'new' ? 'border-green-600 bg-green-50 text-green-700 ring-2 ring-green-600/15' : 'border-blue-100 bg-white text-muted hover:border-green-400'}"
						>
							<span class="block font-bold">Crear nueva sesión</span>
							<span class="mt-0.5 block text-[10px] leading-snug opacity-80">Abre un hueco reutilizable.</span>
						</button>
					</div>

					{#if groupSessionMode === 'existing'}
						{#if groupSessions.length > 0}
							<select
								bind:value={selectedGroupSessionId}
								required
								class="w-full rounded-lg border border-blue-200 bg-white px-2 py-1.5 text-xs focus:border-ocean focus:outline-none"
							>
								<option value="">Seleccionar sesión...</option>
								{#each groupSessions as session (session.id)}
									<option value={session.id} disabled={session.slotsLeft !== null && session.slotsLeft <= 0}>
										{session.date}{session.time ? ` · ${session.time}` : ''}{session.durationMinutes ? ` · ${session.durationMinutes} min` : ''}{session.maxCapacity !== null ? ` · ${session.enrolledCount}/${session.maxCapacity} plazas` : ''}
									</option>
								{/each}
							</select>
							{#if selectedGroupSession}
								<p class="rounded-lg bg-sand px-3 py-2 text-[11px] text-muted">
									👥 La reserva se asignará a esta sesión y sus participantes contarán contra la capacidad{selectedGroupSession.slotsLeft !== null ? ` (${selectedGroupSession.slotsLeft} libres)` : ''}.
								</p>
							{/if}
						{:else}
							<p class="rounded-lg bg-amber-50 p-2 text-xs text-amber-700">
								No hay sesiones futuras para este servicio. Puedes crear una nueva sesión compartida ahora.
							</p>
						{/if}
					{:else}
						<button
							type="button"
							onclick={() => { sessionModalOpen = true; }}
							class="w-full rounded-lg bg-white px-3 py-2 text-left text-[11px] text-muted ring-1 ring-green-100 hover:ring-green-300"
						>
							<strong class="text-green-700">Nueva sesión:</strong>
							{scheduledSessionDate}{scheduledSessionTime ? ` · ${scheduledSessionTime}` : ''}
							{scheduledSessionDuration ? ` · ${scheduledSessionDuration} min` : ''}
							{scheduledSessionInstructorId ? ' · instructor asignado' : ''}
							<span class="float-right font-semibold text-green-700">Editar</span>
						</button>
					{/if}
				</div>

			{:else if isPrivateLessonScheduling}
				<input type="hidden" name="date" value={sessionScheduleMode === 'scheduled' && scheduledSessionDate ? scheduledSessionDate : today} />
				<input type="hidden" name="sessionScheduleMode" value={sessionScheduleMode} />
				{#if sessionScheduleMode === 'scheduled'}
					<input type="hidden" name="sessionDate" value={scheduledSessionDate} />
					<input type="hidden" name="sessionTime" value={scheduledSessionTime} />
					<input type="hidden" name="sessionDuration" value={scheduledSessionDuration} />
					{#if scheduledSessionInstructorId}
						<input type="hidden" name="sessionInstructorId" value={scheduledSessionInstructorId} />
					{/if}
				{:else}
					<input type="hidden" name="isFlexible" value="on" />
				{/if}

				<div class="border-t border-blue-100 pt-3 space-y-2">
					<p class="text-[10px] font-semibold text-gray-500">¿Cuándo es la clase?</p>
					<div class="grid grid-cols-2 gap-2">
						<button
							type="button"
							onclick={() => { sessionScheduleMode = 'later'; sessionModalOpen = false; }}
							class="rounded-xl border px-3 py-2 text-left text-xs transition
								{sessionScheduleMode === 'later' ? 'border-ocean bg-ocean/5 text-ocean ring-2 ring-ocean/15' : 'border-blue-100 bg-white text-muted hover:border-ocean/40'}"
						>
							<span class="block font-bold">Decidir fecha luego</span>
							<span class="mt-0.5 block text-[10px] leading-snug opacity-80">Queda pendiente para seguimiento.</span>
						</button>
						<button
							type="button"
							onclick={() => { sessionScheduleMode = 'scheduled'; sessionModalOpen = true; }}
							class="rounded-xl border px-3 py-2 text-left text-xs transition
								{sessionScheduleMode === 'scheduled' ? 'border-green-600 bg-green-50 text-green-700 ring-2 ring-green-600/15' : 'border-blue-100 bg-white text-muted hover:border-green-400'}"
						>
							<span class="block font-bold">Programar ahora</span>
							<span class="mt-0.5 block text-[10px] leading-snug opacity-80">Crear la sesión con fecha.</span>
						</button>
					</div>

					{#if sessionScheduleMode === 'scheduled'}
						<button
							type="button"
							onclick={() => { sessionModalOpen = true; }}
							class="w-full rounded-lg bg-white px-3 py-2 text-left text-[11px] text-muted ring-1 ring-green-100 hover:ring-green-300"
						>
							<strong class="text-green-700">Sesión:</strong>
							{scheduledSessionDate}{scheduledSessionTime ? ` · ${scheduledSessionTime}` : ''}
							{scheduledSessionDuration ? ` · ${scheduledSessionDuration} min` : ''}
							{scheduledSessionInstructorId ? ' · instructor asignado' : ''}
							<span class="float-right font-semibold text-green-700">Editar</span>
						</button>
					{:else}
						<p class="rounded-lg bg-sand px-3 py-2 text-[11px] text-muted">
							📅 La sesión queda sin programar y se resuelve desde el detalle.
						</p>
					{/if}
				</div>

			{:else if hasInventory && inventoryNeedsDateRange}
				<div class="border-t border-blue-100 pt-3 space-y-2">
					<div class="grid grid-cols-2 gap-2">
						<div>
							<p class="mb-1 text-[10px] text-gray-500">Check-in</p>
							<input name="date" type="date" required bind:value={invCheckIn} class="input w-full text-xs" />
						</div>
						<div>
							<p class="mb-1 text-[10px] text-gray-500">Check-out</p>
							<input name="dateEnd" type="date" required bind:value={invCheckOut} class="input w-full text-xs" />
						</div>
					</div>
					{#if invCheckIn && invCheckOut && invCheckIn < invCheckOut}
						<p class="text-[11px] text-muted">{calcInvUnits()} {inventoryPricingMode === 'per_night' ? 'noches' : 'días'} × €{selectedService?.basePrice} = <strong>€{invCalculatedAmount}</strong></p>
					{/if}
				</div>

			{:else if hasInventory}
				<div class="border-t border-blue-100 pt-3">
					<p class="mb-1 text-[10px] text-gray-500">Fecha</p>
					<input name="date" type="date" required bind:value={invCheckIn} class="input w-full text-xs" />
				</div>

			{:else if hasSessions}
				<input type="hidden" name="date" value={today} />
				<input type="hidden" name="isFlexible" value="on" />
				<p class="rounded-lg bg-sand px-3 py-2 text-[11px] text-muted">
					📅 Sesiones se programan desde el detalle.
				</p>

			{:else}
				<div class="border-t border-blue-100 pt-3 space-y-2">
					<div class="{showTimeField ? 'grid grid-cols-2 gap-2' : ''}">
						<div>
							<p class="mb-1 text-[10px] text-gray-500">Fecha</p>
							<input type="date" name="date" bind:value={date} required class="input w-full text-xs" />
						</div>
						{#if showTimeField}
							<div>
								<p class="mb-1 text-[10px] text-gray-500">Hora</p>
								<input type="time" name="time" bind:value={time} disabled={isFlexible} class="input w-full text-xs disabled:opacity-40" />
							</div>
						{/if}
					</div>
					{#if showTimeField}
						<label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
							<input type="checkbox" name="isFlexible" bind:checked={isFlexible} class="h-3.5 w-3.5 accent-ocean" />
							<Zap size={12} /> Horario flexible
						</label>
					{/if}
					{#if showInstructor}
						<div>
							<p class="mb-1 text-[10px] text-gray-500">Instructor</p>
							<select name="instructorId" class="input w-full text-xs">
								<option value="">Sin asignar</option>
								{#each data.instructors as inst (inst.id)}
									<option value={inst.id}>{inst.name}</option>
								{/each}
							</select>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Credits quantity -->
			{#if hasCredits}
				<div class="border-t border-blue-100 pt-3">
					<p class="mb-2 text-[10px] font-semibold text-purple-700">🎟 Bonos</p>
					<div class="flex items-center gap-2">
						<button type="button" onclick={() => packQuantity = Math.max(1, packQuantity - 1)}
							class="flex h-7 w-7 items-center justify-center rounded-full border border-purple-300 text-sm text-purple-700 hover:bg-purple-100">−</button>
						<span class="w-6 text-center font-bold text-purple-800">{packQuantity}</span>
						<button type="button" onclick={() => packQuantity = packQuantity + 1}
							class="flex h-7 w-7 items-center justify-center rounded-full border border-purple-300 text-sm text-purple-700 hover:bg-purple-100">+</button>
					</div>
					<input type="hidden" name="quantity" value={packQuantity} />
				</div>
			{/if}
		</div>

		<!-- CLIENT + PARTICIPANTS CARD -->
		<div class="rounded-(--radius-card) border border-blue-100 bg-white p-4 space-y-4">
			<div class="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-700"><User size={12} />Cliente</div>

			{#if selectedClient}
				<input type="hidden" name="clientId" value={selectedClient.clientId} />
				<input type="hidden" name="clientName" value={selectedClient.name} />
				<input type="hidden" name="amountDue" value={calcAmountDue()} />
				<input type="hidden" name="participantCount" value={participantCount} />
				<input type="hidden" name="alsoParticipates" value={clientAlsoParticipates ? 'true' : 'false'} />

				<div class="flex items-center gap-2 rounded-lg bg-ocean/5 px-3 py-2.5 ring-1 ring-ocean/20">
					<span class="flex-1 font-medium text-ocean">{selectedClient.name}</span>
					<button type="button" onclick={() => { selectedClient = null; participantCount = 1; clientAlsoParticipates = true; }}
						class="text-ocean/40 hover:text-red-400">✕</button>
				</div>

				<!-- Participants — only when module needs it -->
				{#if hasSessions || 'roster' in modules}
					<div class="border-t border-gray-100 pt-3">
						<p class="mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400">Participantes</p>
						<div class="flex items-center gap-3 mb-2">
							<span class="text-sm text-gray-700">¿Cuántas personas?</span>
							<button type="button" onclick={() => participantCount = Math.max(1, participantCount - 1)}
								class="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-sm hover:bg-gray-100">−</button>
							<span class="w-6 text-center font-bold text-gray-900">{participantCount}</span>
							<button type="button" onclick={() => participantCount = participantCount + 1}
								class="flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 text-sm hover:bg-gray-100">+</button>
						</div>
						<label class="flex cursor-pointer items-center gap-2 text-xs text-gray-700">
							<input type="checkbox" bind:checked={clientAlsoParticipates} class="h-3.5 w-3.5 accent-ocean" />
							El titular también participa
						</label>
						<p class="mt-2 text-[10px] text-muted">Nombres se añaden desde el detalle.</p>
					</div>
				{/if}
			{:else}
				<ClientSearchInput
					clients={data.clients}
					excludeIds={[]}
					placeholder="Buscar cliente..."
					onSelect={(c) => { selectedClient = { clientId: c.id, name: `${c.firstName} ${c.lastName}`.trim() }; }}
				/>
				<p class="text-[11px] text-muted">El cliente es el titular de la reserva.</p>
			{/if}
		</div>

		<!-- PAYMENT PREVIEW CARD -->
		<div class="rounded-(--radius-card) border border-gray-200 bg-white p-4">
			<div class="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">💳 Pago</div>

			{#if selectedClient && selectedService}
				<div class="space-y-2">
					<div class="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2.5">
						<span class="text-xs text-gray-600">Total</span>
						<span class="text-lg font-bold text-gray-900">€{pricePreview}</span>
					</div>
					<div class="flex items-center justify-between px-1">
						<span class="text-[11px] text-muted">Cobrado</span>
						<span class="text-[11px] text-gray-500">€0.00</span>
					</div>
					<div class="flex items-center justify-between px-1">
						<span class="text-[11px] text-muted">Pendiente</span>
						<span class="text-[11px] text-red-400">€{pricePreview}</span>
					</div>
					<p class="text-[9px] text-muted">Pagos se registran desde el detalle.</p>
				</div>
			{:else}
				<p class="text-sm italic text-gray-300">Selecciona servicio y cliente.</p>
			{/if}
		</div>
	</div>

	<!-- CTA -->
	<div class="flex items-center gap-4 pt-2">
		<button type="submit" disabled={loading || !selectedClient || (isPrivateLessonScheduling && sessionScheduleMode === 'scheduled' && !scheduledSessionDate) || (isGroupSessionBooking && groupSessionMode === 'existing' && !selectedGroupSessionId) || (isGroupSessionBooking && groupSessionMode === 'new' && !scheduledSessionDate)}
			class="btn-primary px-8 py-2.5 text-sm font-semibold">
			{loading ? 'Creando...' : 'Crear reserva →'}
		</button>
		{#if !selectedClient}
			<p class="text-xs text-muted">Selecciona un cliente para continuar</p>
		{/if}
	</div>
</form>

{#if sessionModalOpen && (isPrivateLessonScheduling || (isGroupSessionBooking && groupSessionMode === 'new'))}
		<div
			class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
			onclick={() => { sessionModalOpen = false; }}
			role="presentation"
		></div>
		<div class="fixed inset-x-4 top-[5%] z-50 mx-auto max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl md:inset-x-auto md:left-1/2 md:w-full md:-translate-x-1/2">
			<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
				<div>
					<h2 class="text-sm font-bold text-gray-900">{isGroupSessionBooking ? 'Nueva sesión de grupo' : 'Programar sesión'}</h2>
					<p class="mt-0.5 text-xs text-gray-400">{isGroupSessionBooking ? 'Crear una sesión compartida para este servicio' : 'Crear una nueva sesión para esta reserva'}</p>
				</div>
				<button
					type="button"
					onclick={() => { sessionModalOpen = false; }}
					class="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-sm text-gray-400 hover:bg-gray-50"
				>✕</button>
			</div>

			<div class="flex border-b border-gray-100 bg-gray-50">
				<button type="button" class="flex-1 border-b-2 border-green-600 bg-white py-2.5 text-xs font-semibold text-green-700">
					+ Nueva sesión
				</button>
			</div>

			<div class="space-y-4 p-5">
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block text-xs text-gray-500" for="scheduled-session-date">Fecha</label>
						<input id="scheduled-session-date" type="date" bind:value={scheduledSessionDate} required class="input w-full text-sm" />
					</div>
					<div>
						<label class="mb-1 block text-xs text-gray-500" for="scheduled-session-time">Hora</label>
						<input id="scheduled-session-time" type="time" bind:value={scheduledSessionTime} class="input w-full text-sm" />
					</div>
					<div>
						<label class="mb-1 block text-xs text-gray-500" for="scheduled-session-duration">Duración (min)</label>
						<input id="scheduled-session-duration" type="number" min="15" step="15" bind:value={scheduledSessionDuration} class="input w-full text-sm" />
					</div>
				</div>

				{#if data.instructors.length > 0}
					<div>
						<label class="mb-2 block text-xs text-gray-500" for="scheduled-session-instructor">Instructor</label>
						<select id="scheduled-session-instructor" bind:value={scheduledSessionInstructorId} class="input w-full text-sm">
							<option value="">Sin asignar</option>
							{#each data.instructors as inst (inst.id)}
								<option value={inst.id}>{inst.name}</option>
							{/each}
						</select>
					</div>
				{/if}

				<div class="flex gap-2">
					<button
						type="button"
						onclick={() => { sessionModalOpen = false; }}
						disabled={!scheduledSessionDate}
						class="btn-primary flex-1"
					>
						Guardar programación
					</button>
					<button
						type="button"
						onclick={() => { if (isGroupSessionBooking) groupSessionMode = 'existing'; else sessionScheduleMode = 'later'; sessionModalOpen = false; }}
						class="rounded-lg border border-gray-200 bg-white px-4 py-2 text-xs font-semibold text-gray-500 hover:bg-gray-50"
					>
						{isGroupSessionBooking ? 'Usar existente' : 'Decidir luego'}
					</button>
				</div>
			</div>
		</div>
	{/if}

<!-- PLACEHOLDER SECTIONS (visual continuity) -->
{#if selectedService}
	{#if hasSessions}
		<div class="rounded-(--radius-card) border border-green-100 bg-green-50/40 p-4">
			<div class="mb-2 text-[10px] font-bold uppercase tracking-wider text-green-700">⏱ Sesiones</div>
			{#if isPrivateLessonScheduling && sessionScheduleMode === 'scheduled'}
				<div class="rounded-lg bg-white/80 px-3 py-2 text-sm text-gray-700 ring-1 ring-green-100">
					<p class="font-semibold text-green-700">Sesión preparada</p>
					<p class="mt-0.5 text-xs text-muted">
						{scheduledSessionDate}{scheduledSessionTime ? ` · ${scheduledSessionTime}` : ''}{scheduledSessionDuration ? ` · ${scheduledSessionDuration} min` : ''}{scheduledSessionInstructorId ? ' · instructor asignado' : ''}
					</p>
					<p class="mt-1 text-[11px] text-muted">Se creará al guardar esta reserva y se verá en el detalle.</p>
				</div>
			{:else if isPrivateLessonScheduling}
				<p class="text-sm italic text-muted">Sesión pendiente: se resolverá desde el detalle de reserva.</p>
			{:else if isGroupSessionBooking && groupSessionMode === 'new'}
				<div class="rounded-lg bg-white/80 px-3 py-2 text-sm text-gray-700 ring-1 ring-green-100">
					<p class="font-semibold text-green-700">Nueva sesión de grupo preparada</p>
					<p class="mt-0.5 text-xs text-muted">
						{scheduledSessionDate}{scheduledSessionTime ? ` · ${scheduledSessionTime}` : ''}{scheduledSessionDuration ? ` · ${scheduledSessionDuration} min` : ''}{scheduledSessionInstructorId ? ' · instructor asignado' : ''}
					</p>
					<p class="mt-1 text-[11px] text-muted">Se creará como sesión compartida del servicio y esta reserva quedará vinculada.</p>
				</div>
			{:else if isGroupSessionBooking && selectedGroupSession}
				<div class="rounded-lg bg-white/80 px-3 py-2 text-sm text-gray-700 ring-1 ring-green-100">
					<p class="font-semibold text-green-700">Sesión seleccionada</p>
					<p class="mt-0.5 text-xs text-muted">
						{selectedGroupSession.date}{selectedGroupSession.time ? ` · ${selectedGroupSession.time}` : ''}{selectedGroupSession.durationMinutes ? ` · ${selectedGroupSession.durationMinutes} min` : ''}{selectedGroupSession.maxCapacity !== null ? ` · ${selectedGroupSession.enrolledCount}/${selectedGroupSession.maxCapacity} plazas` : ''}
					</p>
					<p class="mt-1 text-[11px] text-muted">La reserva y sus participantes se vincularán a esta sesión.</p>
				</div>
			{:else if isGroupSessionBooking}
				<p class="text-sm italic text-muted">Selecciona una sesión de grupo arriba para continuar.</p>
			{:else}
				<p class="text-sm italic text-muted">Las sesiones se configuran desde el detalle de reserva.</p>
			{/if}
		</div>
	{/if}
	{#if 'inventory' in modules}
		<div class="rounded-(--radius-card) border border-orange-100 bg-white p-4">
			<div class="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange-700">🎒 Equipamiento</div>
			<p class="text-sm italic text-muted">El equipo se asigna desde el detalle de reserva.</p>
		</div>
	{/if}
{/if}
</div>
