<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import { withToast } from '$lib/utils/enhance';
	import { DOT_COLORS } from '$lib/features/services/colors';
	import { paymentBadge } from '$lib/features/bookings/statusBadges';
	import type { ServiceColorKey } from '$lib/features/services/colors';
	import { Zap, Waves, User } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import { getLocale } from '$lib/paraglide/runtime';

	// New components
	import SessionCard from '$lib/components/sessions/SessionCard.svelte';
	import SessionPickerModal from '$lib/components/sessions/SessionPickerModal.svelte';
	import EnrollmentGroup from '$lib/components/bookings/EnrollmentGroup.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	// Module cards kept for modules not fully rebuilt yet
	import InstructorCard from '$lib/modules/instructor/BookingDetailCard.svelte';
	import InventoryCard from '$lib/modules/inventory/BookingDetailCard.svelte';
	import CreditsCard from '$lib/modules/credits/BookingDetailCard.svelte';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	// Module flags
	const modules = $derived(data.booking.serviceModules ?? {});
	const hasSessions = $derived('sessions' in modules || 'editions' in modules);
	const hasInventory = $derived('inventory' in modules);
	const hasInstructor = $derived('instructor' in modules);
	const hasCredits = $derived('credits' in modules);
	const hasDateRange = $derived(!!('editions' in modules && data.booking.dateEnd));

	const canSeeFinancials = $derived(data.canSeeFinancials);
	const isPricedPerPersonPerSession = $derived(data.service?.pricingMode === 'per_person_per_session');

	// Single booking client (1-per-booking model)
	const bookingClient = $derived(data.booking.clients.find(c => c.status === 'enrolled') ?? data.booking.clients[0] ?? null);
	const participants = $derived(bookingClient ? (data.participantsByEnrollment[bookingClient.id] ?? []) : []);
	const bookingClientName = $derived(
		bookingClient
			? `${bookingClient.clientFirstName ?? ''} ${bookingClient.clientLastName ?? ''}`.trim()
			: ''
	);

	// Edit form state
	let editing = $state(false);
	let editDate = $state(data.booking.date);
	let editTime = $state(data.booking.time?.slice(0, 5) ?? '');
	let editFlexible = $state(data.booking.isFlexible);
	let editInstructorId = $state(data.booking.instructorId ?? '');

	function openEdit() {
		editDate = data.booking.date;
		editTime = data.booking.time?.slice(0, 5) ?? '';
		editFlexible = data.booking.isFlexible;
		editInstructorId = data.booking.instructorId ?? '';
		editing = true;
	}

	// Notes
	let editingNotes = $state(false);
	let editNotesValue = $state(data.booking.notes ?? '');

	// Payment per-participant
	let expandedPaymentId = $state<string | null>(null);

	// Session picker modal
	let sessionModalOpen = $state(false);

	const shortId = $derived(data.booking.id.slice(0, 8).toUpperCase());
	const isNewBooking = $derived($page.url.searchParams.get('new') === '1');
	let confirmationDismissed = $state(false);

	function fmtDateShort(d: Date | string): string {
		const date = typeof d === 'string' ? new Date(d) : d;
		return date.toLocaleDateString(getLocale(), { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
	}

	function waMessage(bc: (typeof data.booking.clients)[number], type: 'confirmation' | 'reminder'): string {
		const service = data.booking.serviceName ?? 'tu reserva';
		const d = data.booking.date;
		const firstSession = data.sessions[0];
		const time = firstSession?.time
			? ` a las ${firstSession.time.slice(0, 5)}`
			: data.booking.time
				? ` a las ${data.booking.time.slice(0, 5)}`
				: '';
		if (type === 'confirmation')
			return `¡Hola ${bc.clientFirstName}! 🏄 Tu reserva de ${service} el ${d}${time} está confirmada. ¡Te esperamos! - OBA Surf`;
		return `¡Hola ${bc.clientFirstName}! 🌊 Te recordamos que mañana tienes ${service}${time}. ¡Hasta mañana! - OBA Surf`;
	}
	function waUrl(phone: string, message: string): string {
		return `https://wa.me/${phone.replace(/[\s\-()+]/g, '')}?text=${encodeURIComponent(message)}`;
	}


</script>

<div class="w-full space-y-4 p-3 md:p-6">

	<!-- WA confirmation banner -->
	{#if isNewBooking && !confirmationDismissed && data.booking.clients.length > 0}
		{@const withPhone = data.booking.clients.filter((bc) => bc.status === 'enrolled' && bc.clientPhone)}
		{#if withPhone.length > 0}
			<div class="rounded-(--radius-card) border border-green-200 bg-green-50 p-4">
				<div class="flex items-start justify-between gap-2">
					<p class="text-sm font-semibold text-green-800">¡Reserva creada! Envía la confirmación por WhatsApp:</p>
					<button type="button" onclick={() => (confirmationDismissed = true)} class="shrink-0 text-sm text-green-600 hover:text-green-800">✕</button>
				</div>
				<div class="mt-3 space-y-2">
					{#each withPhone as bc (bc.id)}
						<div class="flex items-center justify-between rounded-lg bg-white px-3 py-2 ring-1 ring-green-100">
							<span class="text-sm font-medium text-gray-800">{bc.clientFirstName} {bc.clientLastName}</span>
							<a href={waUrl(bc.clientPhone!, waMessage(bc, 'confirmation'))} target="_blank" rel="noopener noreferrer"
								class="flex items-center gap-1.5 rounded-lg bg-green-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-600">
								Confirmar
							</a>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	{/if}

	<!-- HEADER -->
	<div class="flex items-start gap-3">
		<a href="/bookings" class="btn-ghost btn-sm mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg p-0">←</a>
		<div class="min-w-0 flex-1">
			<div class="flex items-center gap-2">
				<span class="inline-block h-3 w-3 shrink-0 rounded-full"
					style="background-color: {DOT_COLORS[(data.booking.serviceColor ?? 'ocean') as ServiceColorKey] ?? DOT_COLORS['ocean']}"></span>
				<h1 class="truncate text-xl font-bold text-navy">{data.booking.serviceName ?? 'Reserva'}</h1>
			</div>
			<p class="mt-0.5 text-sm text-muted">
				{#if hasDateRange}
					{data.booking.date} → {data.booking.dateEnd}
				{:else}
					{data.booking.date}{data.booking.time ? ' · ' + data.booking.time.slice(0, 5) : ''}
					{#if data.booking.isFlexible}<Zap size={12} class="ml-1 inline text-flexible" />{/if}
				{/if}
			</p>
			{#if data.booking.serviceEditionId}
				<p class="mt-0.5 text-xs text-muted">Edición {data.booking.serviceEditionStartDate} → {data.booking.serviceEditionEndDate}</p>
			{/if}
		</div>
		<StatusBadge variant={data.booking.status} />
	</div>

	<!-- META STRIP -->
	<div class="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-(--radius-card) bg-sand px-4 py-2.5">
		<span class="font-mono text-[11px] font-semibold tracking-widest text-muted">#{shortId}</span>
		<span class="text-[10px] text-border">·</span>
		<span class="text-[11px] text-muted">Creada {fmtDateShort(data.booking.createdAt)}</span>
		{#if data.booking.updatedAt && data.booking.updatedAt.getTime() - data.booking.createdAt.getTime() > 60000}
			<span class="text-[10px] text-border">·</span>
			<span class="text-[11px] text-muted">Editada {fmtDateShort(data.booking.updatedAt)}</span>
		{/if}
		<span class="text-[10px] text-border">·</span>
		<span class="text-[11px] text-muted capitalize">{data.booking.source === 'whatsapp_bot' ? 'WhatsApp bot' : 'Admin'}</span>
		<div class="ml-auto flex gap-3">
			<button type="button" onclick={() => { editNotesValue = data.booking.notes ?? ''; editingNotes = !editingNotes; }}
				class="text-[11px] font-medium text-ocean hover:underline">
				{data.booking.notes ? '📝 Notas' : '📝 Añadir nota'}
			</button>
			<button type="button" onclick={openEdit} class="text-[11px] font-medium text-ocean hover:underline">Editar</button>
		</div>
	</div>

	<!-- NOTES (inline expand) -->
	{#if editingNotes}
		<form method="post" action="?/updateNotes" use:enhance={withToast(() => { editingNotes = false; })}
			class="rounded-(--radius-card) bg-surface p-4 ring-1 ring-ocean/30">
			<textarea name="notes" rows="3" bind:value={editNotesValue} autofocus
				placeholder="Notas internas sobre esta reserva..."
				class="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-ocean focus:outline-none"></textarea>
			<div class="mt-2 flex gap-2">
				<button type="submit" class="btn-primary btn-sm text-xs">Guardar</button>
				<button type="button" onclick={() => editingNotes = false} class="text-xs text-muted hover:text-gray-700">Cancelar</button>
			</div>
		</form>
	{:else if data.booking.notes}
		<p class="rounded-(--radius-card) bg-sand px-4 py-3 text-sm text-gray-700 whitespace-pre-wrap">{data.booking.notes}</p>
	{/if}

	<!-- EDIT FORM -->
	{#if editing}
		<div class="rounded-(--radius-card) bg-surface p-4 ring-1 ring-ocean/40">
			<div class="mb-3 flex items-center justify-between">
				<p class="text-xs font-semibold uppercase tracking-wider text-muted">Editar reserva</p>
				<button type="button" onclick={() => (editing = false)} class="text-xs text-muted hover:text-gray-700">Cancelar</button>
			</div>
			<form method="post" action="?/update" use:enhance={withToast(() => { editing = false; })} class="space-y-3">
				<input type="hidden" name="status" value={data.booking.status} />
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="mb-1 block text-xs text-muted" for="edit-date">Fecha</label>
						<input id="edit-date" name="date" type="date" bind:value={editDate} required
							class="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ocean focus:outline-none" />
					</div>
					{#if !hasSessions}
						<div>
							<label class="mb-1 block text-xs text-muted" for="edit-time">Hora</label>
							<input id="edit-time" name="time" type="time" bind:value={editTime} disabled={editFlexible}
								class="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ocean focus:outline-none disabled:opacity-40" />
						</div>
					{/if}
				</div>
				{#if !hasSessions}
					<label class="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
						<input type="checkbox" name="isFlexible" bind:checked={editFlexible} class="h-4 w-4 accent-ocean" />
						<Zap size={14} class="shrink-0" /> Horario flexible
					</label>
					{#if !hasInstructor}
						<div>
							<label class="mb-1 block text-xs text-muted" for="edit-instructor">Instructor</label>
							<select id="edit-instructor" name="instructorId" bind:value={editInstructorId}
								class="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-ocean focus:outline-none">
								<option value="">Sin asignar</option>
								{#each data.instructors as instructor (instructor.id)}
									<option value={instructor.id}>{instructor.name}</option>
								{/each}
							</select>
						</div>
					{/if}
				{/if}
				<div>
					<label class="mb-1 block text-xs text-muted" for="edit-spot">Spot</label>
					<input id="edit-spot" name="spotNotes" value={data.booking.spotNotes ?? ''}
						class="w-full rounded-lg border border-border px-3 py-2 text-sm focus:border-ocean focus:outline-none" />
				</div>
				<button type="submit" class="btn-primary btn-block">Guardar</button>
			</form>
		</div>
	{/if}

	<!-- Operational detail strip (read-only) -->
	{#if !editing && (data.booking.spotNotes || (!hasSessions && data.booking.instructorName) || data.booking.sessionsIncluded != null)}
		<div class="space-y-2 rounded-(--radius-card) bg-surface px-4 py-3 ring-1 ring-border">
			{#if !hasSessions && data.booking.instructorName}
				<div class="flex items-center justify-between">
					<span class="text-xs text-muted">Instructor</span>
					<span class="flex items-center gap-1.5 text-sm text-gray-800"><Waves size={13} class="shrink-0 text-ocean/60" />{data.booking.instructorName}</span>
				</div>
			{/if}
			{#if data.booking.sessionsIncluded != null}
				<div class="flex items-center justify-between">
					<span class="text-xs text-muted">Sesiones contratadas</span>
					<span class="text-sm text-gray-800">{data.booking.sessionsIncluded}</span>
				</div>
			{/if}
			{#if data.booking.spotNotes}
				<div class="flex items-center justify-between">
					<span class="text-xs text-muted">Spot</span>
					<span class="text-sm text-gray-800">{data.booking.spotNotes}</span>
				</div>
			{/if}
		</div>
	{/if}

	<!-- ── TOP ROW GRID ─────────────────────────────────────────────────────── -->
	<!-- Mobile: stacked. Desktop: 3 cols -->
	<div class="grid grid-cols-1 gap-4 md:grid-cols-[1fr_1.6fr_1fr]">

		<!-- SERVICE CARD -->
		<div class="rounded-(--radius-card) border border-blue-100 bg-blue-50/60 p-4">
			<div class="mb-3 text-[10px] font-bold uppercase tracking-wider text-blue-700">📋 Servicio</div>
			{#if data.booking.serviceId && data.booking.serviceName}
				<div class="mb-2 flex items-center gap-2">
					<span class="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
						style="background-color: {DOT_COLORS[(data.booking.serviceColor ?? 'ocean') as ServiceColorKey]}"></span>
					<span class="font-semibold text-gray-900">{data.booking.serviceName}</span>
				</div>
				<div class="mb-3 flex flex-wrap gap-1.5">
					{#each Object.keys(modules) as mod}
						<span class="rounded-full bg-blue-100 px-2 py-0.5 text-[9px] font-semibold capitalize text-blue-700">{mod}</span>
					{/each}
				</div>
				{#if data.service?.pricingMode}
					<p class="text-[10px] text-gray-500">Precio: <span class="font-medium">{data.service.pricingMode}</span></p>
				{/if}
				<p class="mt-2 text-[9px] italic text-gray-400">Solo lectura. Eliminar reserva para cambiar.</p>
			{:else}
				<p class="text-sm italic text-muted">Sin servicio vinculado.</p>
			{/if}
		</div>

		<!-- CLIENT + PARTICIPANTS CARD -->
		<div class="rounded-(--radius-card) border border-blue-100 bg-white p-4">
			<div class="mb-3 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-700"><User size={12} />Cliente</div>

			{#if bookingClient}
				<!-- Contract holder -->
				<div class="mb-4 flex items-start justify-between">
					<div>
						<div class="font-semibold text-gray-900">{bookingClient.clientFirstName} {bookingClient.clientLastName}</div>
						{#if bookingClient.clientPhone}
							<div class="mt-0.5 text-xs text-muted">{bookingClient.clientPhone}</div>
						{/if}
						{#if bookingClient.clientEmail}
							<div class="text-xs text-muted">{bookingClient.clientEmail}</div>
						{/if}
					</div>
					<div class="flex shrink-0 gap-1.5">
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

				<!-- Participants section -->
				<div class="mt-3">
					<EnrollmentGroup
						clientName="{bookingClient.clientFirstName} {bookingClient.clientLastName}"
						bookingId={data.booking.id}
						bookingClientId={bookingClient.id}
						{participants}
						canEdit={data.booking.status !== 'cancelled'}
						bulkAdd={true}
						syncToSessions={true}
						renameAction="?/renameParticipant"
						removeAction="?/removeParticipantCascade"
						addAction="?/bulkAddParticipants"
						impactAction="?/getRemovalImpact"
					/>
				</div>
			{:else}
				<p class="text-sm italic text-muted">Sin cliente vinculado.</p>
			{/if}
		</div>

		<!-- PAYMENT CARD -->
		<div class="rounded-(--radius-card) border border-gray-200 bg-white p-4">
			<div class="mb-3 text-[10px] font-bold uppercase tracking-wider text-gray-500">💳 Pago</div>

			{#if canSeeFinancials && bookingClient}
				{#if isPricedPerPersonPerSession && participants.length > 0}
					<!-- Per-participant breakdown -->
					<div class="mb-1 text-[9px] text-muted">por sesión × participante</div>
					<div class="mb-3 flex flex-col gap-1.5">
						{#each participants as p (p.id)}
							{@const amountDue = parseFloat(bookingClient.amountDue) / Math.max(participants.length, 1)}
							{@const participantPaymentBadge = paymentBadge(p.paymentStatus)}
							<div class="overflow-hidden rounded-lg border border-gray-100">
								<div class="flex items-center justify-between px-3 py-2">
									<span class="text-xs font-semibold text-gray-800">{p.name}</span>
									<div class="flex items-center gap-2">
										<span class="text-xs text-gray-600">€{parseFloat(p.amountPaid).toFixed(2)}</span>
										<StatusBadge variant={participantPaymentBadge.variant} label={participantPaymentBadge.label} class="px-1.5 text-[8px]" />
										<button type="button" onclick={() => expandedPaymentId = expandedPaymentId === p.id ? null : p.id}
											class="text-[10px] text-muted hover:text-gray-700">✎</button>
									</div>
								</div>
								{#if expandedPaymentId === p.id}
									<form method="post" action="?/updateParticipantPayment"
										use:enhance={withToast(() => { expandedPaymentId = null; })}
										class="space-y-2 border-t border-gray-100 bg-gray-50 px-3 py-2">
										<input type="hidden" name="participantId" value={p.id} />
										<input type="hidden" name="amountDue" value={amountDue.toFixed(2)} />
										<div class="flex items-center gap-2">
											<label class="w-16 shrink-0 text-[9px] text-muted">Pagado €</label>
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
					<!-- Flat payment row -->
					{@const clientPaymentBadge = paymentBadge(bookingClient.paymentStatus)}
					<div class="mb-3">
						<div class="mb-1.5 flex items-center justify-between px-1">
							<span class="text-xs font-semibold text-gray-800">{bookingClient.clientFirstName} {bookingClient.clientLastName}</span>
							<StatusBadge variant={clientPaymentBadge.variant} label={clientPaymentBadge.label} class="px-2 text-[9px]" />
						</div>
						<form method="post" action="?/updatePayment" use:enhance={withToast()} class="flex items-center gap-2 px-1">
							<input type="hidden" name="bookingClientId" value={bookingClient.id} />
							<input type="hidden" name="amountDue" value={bookingClient.amountDue} />
							<span class="text-[10px] text-muted">Pagado €</span>
							<input name="amountPaid" type="number" step="0.01" min="0"
								value={bookingClient.amountPaid}
								class="w-20 rounded border border-border px-2 py-0.5 text-xs focus:border-ocean focus:outline-none" />
							<button type="submit" class="text-xs text-ocean hover:underline">Guardar</button>
						</form>
					</div>
				{/if}

				<!-- Totals strip -->
				{@const pendingAmt = parseFloat(bookingClient.amountDue) - parseFloat(bookingClient.amountPaid)}
				<div class="space-y-1 border-t border-gray-100 pt-2">
					<div class="flex justify-between text-xs font-bold text-gray-900">
						<span>Total</span><span>€{parseFloat(bookingClient.amountDue).toFixed(2)}</span>
					</div>
					<div class="flex justify-between text-[11px] text-muted">
						<span>Cobrado</span><span>€{parseFloat(bookingClient.amountPaid).toFixed(2)}</span>
					</div>
					<div class="flex justify-between text-[11px] {pendingAmt > 0 ? 'text-red-500' : 'text-muted'}">
						<span>Pendiente</span><span>€{pendingAmt.toFixed(2)}</span>
					</div>
				</div>

				<!-- Recalc -->
				{#if data.booking.status !== 'cancelled'}
					<form method="post" action="?/recalcPrice" use:enhance={withToast()} class="mt-3">
						<button type="submit" class="text-[9px] text-muted hover:text-gray-700 hover:underline">Recalcular precio</button>
					</form>
				{/if}
			{:else if !canSeeFinancials}
				<p class="text-xs italic text-muted">Sin acceso a datos financieros.</p>
			{/if}
		</div>
	</div>

	<!-- ── SESSIONS SECTION ──────────────────────────────────────────────────── -->
	{#if hasSessions}
		<div class="rounded-(--radius-card) border border-green-100 bg-green-50/40 p-4">
			<div class="mb-4 flex items-center justify-between">
				<div class="text-[10px] font-bold uppercase tracking-wider text-green-700">
					⏱ Sesiones · {data.sessions.filter(s => s.status !== 'cancelled').length} activas
				</div>
				{#if data.booking.status !== 'cancelled' && (data.sessionOwnerType === 'booking' || data.sessionOwnerType === 'service')}
					<div class="flex gap-2">
						<button type="button" onclick={() => { sessionModalOpen = true; }}
							class="rounded-lg border border-green-200 bg-white px-3 py-1.5 text-[10px] font-semibold text-green-700 hover:bg-green-50">
							{data.sessionOwnerType === 'service' ? '+ Sesión' : '+ Nueva sesión'}
						</button>
					</div>
				{/if}
			</div>

			{#if data.sessions.length === 0}
				<p class="text-sm italic text-muted">
					{data.sessionOwnerType === 'service' ? 'Sin sesiones de grupo para esta fecha. Usa el botón para crear o vincular.' : 'Sin sesiones. Usa el botón para crear.'}
				</p>
			{:else}
				<div class="grid grid-cols-1 gap-4 md:grid-cols-2">
					{#each data.sessions as session (session.id)}
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
					{/each}
				</div>
			{/if}
		</div>

		<SessionPickerModal
			bind:open={sessionModalOpen}
			bookingId={data.booking.id}
			bookingStatus={data.booking.status}
			incomingParticipantCount={participants.length}
			capacity={data.booking.serviceMaxCapacity}
			availableSessions={data.sessionOwnerType === 'service' ? (data.sessions as any) : []}
			instructors={data.instructors}
			bookingDate={data.booking.date}
			newSessionAction={data.sessionOwnerType === 'service' ? '?/addServiceSession' : '?/addSession'}
		/>
	{/if}

	<!-- ── INSTRUCTOR CARD (non-session services) ────────────────────────────── -->
	{#if hasInstructor}
		<InstructorCard booking={data.booking} {modules} instructors={data.instructors} sessions={data.sessions} />
	{/if}

	<!-- ── INVENTORY ────────────────────────────────────────────────────────── -->
	{#if hasInventory}
		<InventoryCard
			booking={data.booking}
			{modules}
			serviceInventoryLinks={data.serviceInventoryLinks}
			itemsByAllocType={data.itemsByAllocType}
			allocTypeTracking={data.allocTypeTracking}
			{participants}
		/>
	{/if}

	<!-- ── CREDITS ───────────────────────────────────────────────────────────── -->
	{#if hasCredits}
		<CreditsCard booking={data.booking} {modules}
			quantity={data.booking.quantity}
			creditsUsed={data.creditsUsedFromThisBooking}
			bookingDate={data.booking.date} />
		{#if data.booking.status !== 'cancelled'}
			<form method="POST" action="?/updateQuantity" use:enhance={withToast()} class="flex items-center gap-2 px-1">
				<span class="text-xs text-muted">Bonos:</span>
				<button type="button"
					onclick={(e) => { const inp = e.currentTarget.nextElementSibling as HTMLInputElement; inp.value = String(Math.max(1, parseInt(inp.value) - 1)); }}
					class="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs text-gray-600 hover:bg-gray-100">−</button>
				<input name="quantity" type="number" min="1" value={data.booking.quantity}
					class="w-12 rounded border border-border px-1 py-0.5 text-center text-sm font-semibold focus:border-purple-400 focus:outline-none" />
				<button type="button"
					onclick={(e) => { const inp = e.currentTarget.previousElementSibling as HTMLInputElement; inp.value = String(parseInt(inp.value) + 1); }}
					class="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs text-gray-600 hover:bg-gray-100">+</button>
				<button type="submit" class="text-xs text-purple-600 hover:underline">Guardar</button>
			</form>
		{/if}
	{/if}

	<!-- ── CANCEL / DELETE ──────────────────────────────────────────────────── -->
	{#if data.booking.status !== 'cancelled' && data.userRole !== 'staff'}
		<div class="flex flex-col gap-2 sm:flex-row">
			<form method="POST" action="?/cancel" use:enhance={withToast()} class="flex-1">
				<button type="submit" class="btn-secondary btn-block text-amber-700">Cancelar reserva</button>
			</form>
			{#if data.userRole === 'owner' || data.userRole === 'admin'}
				<form method="POST" action="?/delete"
					use:enhance={({ cancel }) => {
						if (!confirm('¿Eliminar esta reserva?')) { cancel(); return; }
						return withToast(() => goto('/bookings'))();
					}}
					class="flex-1">
					<button type="submit" class="btn-secondary btn-block text-red-600">Eliminar reserva</button>
				</form>
			{/if}
		</div>
	{/if}

</div>
