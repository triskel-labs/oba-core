<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import { getServiceColor } from '$lib/features/services/colors';
	import SessionCard from '$lib/components/sessions/SessionCard.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	const color = $derived(getServiceColor(data.service.color ?? ''));

	type Session = PageData['sessions'][number];

	const sessionsByDate = $derived(() => {
		const map: Record<string, Session[]> = {};
		for (const s of data.sessions) (map[s.date] ??= []).push(s);
		return map;
	});

	const sortedDates = $derived(Object.keys(sessionsByDate()).sort());

	const totalUnassigned = $derived(
		Object.values(data.unassignedByDate).reduce((acc, list) => acc + list.length, 0)
	);

	function fmtDate(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
			weekday: 'long', day: 'numeric', month: 'long'
		});
	}
	function fmtDateShort(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
	}
	function fmtTime(t: string | null) { return t?.slice(0, 5) ?? '—'; }

	let addOpen = $state(false);
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<!-- Header -->
	<div class="border-b border-border bg-surface px-4 py-3 space-y-2 sm:px-6">
		<div class="flex items-center justify-between gap-2">
			<div class="flex items-center gap-2 min-w-0">
				<a href="/services/{data.service.id}" class="text-sm text-muted hover:text-navy shrink-0">←</a>
				<div class="flex items-center gap-2 min-w-0">
					<div class="h-2.5 w-2.5 shrink-0 rounded-full {color.bg}"></div>
					<h1 class="truncate text-base font-bold text-navy">{data.service.name}</h1>
					<span class="shrink-0 text-xs text-muted">· Sesiones</span>
				</div>
			</div>
			<span class="shrink-0 text-xs text-muted">{data.sessions.length} sesión{data.sessions.length !== 1 ? 'es' : ''}</span>
		</div>

		<!-- Edition picker (edition services) -->
		{#if data.hasEditions}
			<div class="flex flex-wrap gap-2">
				{#each data.editions as ed}
					<a href="/services/{data.service.id}/sessions?edition={ed.id}"
						class="rounded-full border px-3 py-1 text-xs font-medium transition-colors
							{data.editionId === ed.id
								? 'border-ocean bg-ocean text-white'
								: 'border-border bg-surface text-muted hover:border-gray-400 hover:text-gray-700'}">
						{fmtDateShort(ed.startDate)} → {fmtDateShort(ed.endDate)}
						{#if ed.maxCapacity}<span class="ml-1 opacity-70">{ed.enrolledCount}/{ed.maxCapacity}</span>{/if}
					</a>
				{/each}
				{#if data.editions.length === 0}
					<p class="text-xs text-muted">No hay ediciones. Crea una en <a href="/services/{data.service.id}" class="text-ocean hover:underline">el servicio</a>.</p>
				{/if}
			</div>
		{/if}

		<!-- Edition header -->
		{#if data.edition}
			<div class="rounded-lg bg-purple-50 px-3 py-2 text-xs">
				<span class="font-semibold text-purple-800">Campamento:</span>
				<span class="ml-1 text-purple-700">{fmtDateShort(data.edition.startDate)} → {fmtDateShort(data.edition.endDate)}</span>
				{#if data.edition.maxCapacity}
					<span class="ml-2 text-purple-500">{data.edition.enrolledCount}/{data.edition.maxCapacity} inscripciones</span>
				{/if}
			</div>
		{/if}

		<!-- Add session -->
		{#if !data.hasEditions || data.editionId}
			<button type="button" onclick={() => addOpen = !addOpen}
				class="text-sm font-medium text-ocean hover:underline">
				{addOpen ? '− Cerrar' : '+ Añadir sesión'}
			</button>
			{#if addOpen}
				<form method="POST" action="?/addSession" use:enhance={withToast(() => { addOpen = false; })}
					class="rounded-xl border border-border bg-gray-50 p-4 grid grid-cols-2 gap-3">
					{#if data.editionId}
						<input type="hidden" name="editionId" value={data.editionId} />
					{/if}
					<div class="col-span-2 sm:col-span-1">
						<label class="label text-xs">Fecha *</label>
						<input name="date" type="date" class="input text-sm w-full" required />
					</div>
					<div>
						<label class="label text-xs">Hora</label>
						<input name="time" type="time" class="input text-sm w-full" />
					</div>
					<div>
						<label class="label text-xs">Duración (min)</label>
						<input name="durationMinutes" type="number" min="1" class="input text-sm w-full" placeholder="90" />
					</div>
					<div class="col-span-2">
						<label class="label text-xs">Monitor</label>
						<select name="instructorId" class="input text-sm w-full">
							<option value="">Sin asignar</option>
							{#each data.instructors as inst}
								<option value={inst.id}>{inst.name}</option>
							{/each}
						</select>
					</div>
					<div class="col-span-2">
						<label class="label text-xs">Notas</label>
						<input name="notes" type="text" class="input text-sm w-full" />
					</div>
					<div class="col-span-2 flex gap-2">
						<button type="submit" class="btn-primary btn-sm">Crear sesión</button>
						<button type="button" onclick={() => addOpen = false} class="btn-ghost btn-sm">Cancelar</button>
					</div>
				</form>
			{/if}
		{/if}
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		{#if data.hasEditions && !data.editionId}
			<div class="py-16 text-center">
				<p class="text-sm text-muted">Selecciona una edición arriba para ver sus sesiones.</p>
			</div>
		{:else if totalUnassigned > 0}
			<div class="mb-4 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-4 py-3">
				<p class="text-sm font-medium text-amber-800">
					⚠ {totalUnassigned} inscripción{totalUnassigned !== 1 ? 'es' : ''} sin asignar a sesión
				</p>
			</div>
		{/if}

		{#if (data.hasEditions ? data.editionId : true) && data.sessions.length === 0}
			<p class="py-12 text-center text-sm text-muted">Sin sesiones. Crea la primera arriba.</p>
		{/if}

		{#if sortedDates.length > 0}
			<div class="space-y-8">
				{#each sortedDates as date}
					{@const daySessions = sessionsByDate()[date]}
					{@const unassigned = data.hasGroupSessions ? (data.unassignedByDate[date] ?? []) : []}

					<section>
						<h2 class="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{fmtDate(date)}</h2>

						<!-- Unassigned enrollments for this date (group only) -->
						{#if unassigned.length > 0}
							<div class="mb-3 rounded-lg bg-amber-50 ring-1 ring-amber-200 px-4 py-3 text-sm">
								<p class="mb-2 font-medium text-amber-800">{unassigned.length} cliente{unassigned.length !== 1 ? 's' : ''} sin asignar</p>
								{#each unassigned as u}
									<div class="mb-1.5 flex flex-wrap items-center gap-2">
										<span class="font-medium text-amber-900">{u.firstName} {u.lastName}</span>
										<a href="/bookings/{u.bookingId}" class="text-xs text-ocean hover:underline">ver reserva</a>
										<form method="POST" action="?/assignBookingToSession" use:enhance={withToast()} class="flex flex-wrap gap-1">
											<input type="hidden" name="bookingId" value={u.bookingId} />
											{#each daySessions.filter(s => s.status !== 'cancelled') as s}
												<button name="sessionId" value={s.id}
													class="rounded bg-white px-2 py-0.5 text-xs ring-1 ring-amber-300 hover:bg-amber-100 text-amber-800">
													{fmtTime(s.time)}
												</button>
											{/each}
										</form>
									</div>
								{/each}
							</div>
						{/if}

						<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
							{#each daySessions as s (s.id)}
								{@const enrollments = data.enrollmentsBySession[s.id] ?? []}
								{@const activeEnrollments = enrollments.filter(e => e.status !== 'cancelled')}
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
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}
	</div>
</div>
