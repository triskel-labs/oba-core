<script lang="ts">
	import { untrack } from 'svelte';
	import { Zap, User } from 'lucide-svelte';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import { DOT_COLORS } from '$lib/features/services/colors';
	import type { ServiceColorKey } from '$lib/features/services/colors';
	import type { PageData } from './$types';
	import type { ServiceEdition } from '$lib/features/services/editions.types';
	import ClientSearchInput from '$lib/components/ClientSearchInput.svelte';

	let { data }: { data: PageData } = $props();
	let loading = $state(false);

	// ── Service ───────────────────────────────────────────────────────────────
	let selectedServiceId = $state(data.defaultServiceId || (data.services[0]?.id ?? ''));
	const selectedService = $derived(data.services.find(s => s.id === selectedServiceId));
	const modules = $derived(selectedService?.modules ?? {});
	const hasEditions   = $derived('editions' in modules);
	const hasSessions   = $derived('sessions' in modules);
	const hasInventory  = $derived('inventory' in modules);
	const hasInstructor = $derived('instructor' in modules);
	const hasCredits    = $derived('credits' in modules);
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
	const invCalculatedAmount = $derived(
		invCheckIn && invCheckOut && inventoryNeedsDateRange
			? (parseFloat(selectedService?.basePrice ?? '0') * calcInvUnits()).toFixed(2)
			: (selectedService?.basePrice ?? '0')
	);

	// ── Credits ───────────────────────────────────────────────────────────────
	let packQuantity = $state(1);
	$effect(() => { if (!hasCredits) packQuantity = 1; });

	// ── Client ────────────────────────────────────────────────────────────────
	let selectedClient = $state<{ clientId: string; name: string } | null>(null);

	// ── Participants ──────────────────────────────────────────────────────────
	let participantCount = $state(1);
	let clientAlsoParticipates = $state(true);

	// ── Price preview ─────────────────────────────────────────────────────────
	function calcAmountDue(): string {
		if (hasInventory && inventoryNeedsDateRange) return invCalculatedAmount;
		if (hasCredits && packQuantity > 1)
			return (parseFloat(selectedService?.basePrice ?? '0') * packQuantity).toFixed(2);
		return selectedService?.basePrice ?? '0';
	}
	const pricePreview = $derived(calcAmountDue());
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
				{#if hasSessions}Sesiones desde el detalle{:else if hasEditions}Campamento / programa{:else}Servicio puntual{/if}
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
			<div class="text-[10px] font-bold uppercase tracking-wider text-blue-700">📋 Servicio</div>

			<select name="serviceId" bind:value={selectedServiceId} required
				class="w-full rounded-lg border border-blue-200 bg-white px-3 py-2 text-sm font-semibold focus:border-ocean focus:outline-none">
				{#each data.services as s (s.id)}
					<option value={s.id}>{s.name}</option>
				{/each}
			</select>

			{#if selectedService}
				<div class="flex flex-wrap gap-1">
					{#each Object.keys(modules) as mod}
						<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-semibold capitalize text-blue-700">{mod}</span>
					{/each}
				</div>
				<p class="text-[10px] text-gray-500">€{selectedService.basePrice} · {selectedService.pricingMode}</p>
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
		<button type="submit" disabled={loading || !selectedClient}
			class="btn-primary px-8 py-2.5 text-sm font-semibold">
			{loading ? 'Creando...' : 'Crear reserva →'}
		</button>
		{#if !selectedClient}
			<p class="text-xs text-muted">Selecciona un cliente para continuar</p>
		{/if}
	</div>

	</form>

	<!-- PLACEHOLDER SECTIONS (visual continuity) -->
	{#if selectedService}
		{#if hasSessions}
			<div class="rounded-(--radius-card) border border-green-100 bg-green-50/40 p-4">
				<div class="mb-2 text-[10px] font-bold uppercase tracking-wider text-green-700">⏱ Sesiones</div>
				<p class="text-sm italic text-muted">Las sesiones se crean desde el detalle de reserva.</p>
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
