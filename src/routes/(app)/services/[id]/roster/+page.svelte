<script lang="ts">
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import { getServiceColor } from '$lib/features/services/colors';
	import SessionCard from '$lib/components/sessions/SessionCard.svelte';
	import CardShell from '$lib/components/ui/CardShell.svelte';
	import EnrollmentGroup from '$lib/components/bookings/EnrollmentGroup.svelte';
	import { Users } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let activeEditionId = $state(data.focusEditionId ?? data.editions[0]?.id ?? '');
	const activeEdition = $derived(data.editions.find(e => e.id === activeEditionId));
	const activeBookings = $derived(data.bookingsByEdition[activeEditionId] ?? []);
	const totalEnrolled = $derived(activeEdition?.enrolledCount ?? 0);
	const color = $derived(getServiceColor(data.service.color ?? ''));
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<div class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-sm px-4 py-3 sm:px-6 flex items-center gap-2">
		<a href="/services/{data.service.id}" class="shrink-0 text-sm text-muted transition-colors hover:text-navy">←</a>
		<h1 class="truncate text-lg font-bold text-navy">{data.service.name}</h1>
		<span class="shrink-0 text-xs text-muted">· {m.camp_roster_title()}</span>
	</div>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">

	{#if data.editions.length === 0}
		<div class="rounded-lg bg-sand p-6 text-center">
			<p class="text-sm text-muted">{m.camp_roster_no_runs()}</p>
			<a href="/services/{data.service.id}" class="mt-2 block text-sm text-ocean hover:underline">{m.camp_roster_add_run()}</a>
		</div>
	{:else}
		<!-- Edition tabs -->
		<div class="mb-4 flex flex-wrap gap-2">
			{#each data.editions as edition}
				<button
					onclick={() => activeEditionId = edition.id}
					class="rounded-full px-3 py-1.5 text-sm font-medium transition-colors {activeEditionId === edition.id ? 'bg-ocean text-white' : 'bg-surface ring-1 ring-border hover:ring-ocean/50'}"
				>
					{edition.startDate} → {edition.endDate}
					{#if edition.maxCapacity}
						<span class="ml-1 text-xs opacity-75">
							{edition.enrolledCount}/{edition.maxCapacity}
						</span>
					{/if}
				</button>
			{/each}
			<a href="/services/{data.service.id}" class="rounded-full px-3 py-1.5 text-sm text-muted ring-1 ring-border hover:ring-ocean/50">
				{m.camp_roster_add_run_short()}
			</a>
		</div>

		{#if activeEdition}
			<!-- Edition summary -->
			<CardShell label="{activeEdition.startDate} → {activeEdition.endDate}" icon={Users} class="mb-4">
				<div class="flex items-center justify-between gap-3">
					<div>
						{#if activeEdition.maxCapacity}
							{@const slotsLeft = activeEdition.maxCapacity - totalEnrolled}
							<p class="text-sm {slotsLeft <= 0 ? 'font-medium text-red-600' : slotsLeft <= 3 ? 'text-amber-600' : 'text-muted'}">
								{totalEnrolled} / {activeEdition.maxCapacity} {m.camp_roster_spots_filled()}
								{#if slotsLeft <= 0}
									· Aforo completo
								{:else if slotsLeft <= 3}
									· {slotsLeft} {slotsLeft === 1 ? 'plaza libre' : 'plazas libres'}
								{/if}
							</p>
						{:else}
							<p class="text-sm text-muted">{totalEnrolled} {m.camp_roster_enrolled()}</p>
						{/if}
						{#if activeEdition.notes}
							<p class="mt-0.5 text-xs text-muted">{activeEdition.notes}</p>
						{/if}
					</div>
					<a
						href="/bookings/new?serviceId={data.service.id}&editionId={activeEditionId}"
						class="btn-primary btn-sm shrink-0"
					>
						{m.camp_roster_book_client()}
					</a>
				</div>
			</CardShell>

			<!-- Roster -->
			{#if activeBookings.length === 0}
				<p class="py-8 text-center text-sm text-muted">{m.camp_roster_no_bookings()}</p>
			{:else}
				<div class="space-y-2">
					{#each activeBookings as booking}
						{@const bcId = data.enrolledClientByBooking[booking.id]}
						{@const participants = bcId ? (data.participantsByEnrollment[bcId] ?? []) : []}
						<EnrollmentGroup
							clientName={booking.firstClientName ?? 'Desconocido'}
							bookingId={booking.id}
							bookingClientId={bcId ?? ''}
							{participants}
							canEdit={!!bcId}
							bulkAdd={false}
							renameAction="?/renameRosterParticipant"
							removeAction="?/removeRosterParticipant"
							addAction="?/addRosterParticipant"
						/>
					{/each}
				</div>
			{/if}

			<!-- Sessions section for this edition -->
			{@const editionSessions = data.sessionsByEdition[activeEditionId] ?? []}
			<div class="mt-6">
				<div class="mb-3 flex items-center justify-between">
					<h2 class="text-sm font-semibold text-gray-700">Programa de sesiones</h2>
					<details class="relative">
						<summary class="cursor-pointer text-xs font-medium text-indigo-600">+ Añadir sesión</summary>
						<form
							method="POST"
							action="?/addEditionSession"
							use:enhance={withToast()}
							class="absolute right-0 z-10 mt-1 w-64 grid grid-cols-2 gap-2 rounded-lg bg-white ring-1 ring-border p-3 shadow-lg"
						>
							<input type="hidden" name="editionId" value={activeEditionId} />
							<div>
								<label class="text-xs text-muted block mb-1">Fecha</label>
								<input name="date" type="date" class="input text-xs w-full" required
									min={activeEdition?.startDate} max={activeEdition?.endDate} />
							</div>
							<div>
								<label class="text-xs text-muted block mb-1">Hora</label>
								<input name="time" type="time" class="input text-xs w-full" />
							</div>
							<div>
								<label class="text-xs text-muted block mb-1">Duración (min)</label>
								<input name="durationMinutes" type="number" class="input text-xs w-full" placeholder="90" />
							</div>
							<div>
								<label class="text-xs text-muted block mb-1">Monitor</label>
								<select name="instructorId" class="input text-xs w-full">
									<option value="">—</option>
									{#each data.instructors as i}
										<option value={i.id}>{i.name}</option>
									{/each}
								</select>
							</div>
							<div class="col-span-2">
								<button type="submit" class="btn-primary btn-sm w-full">Crear</button>
							</div>
						</form>
					</details>
				</div>

				{#if editionSessions.length === 0}
					<p class="py-4 text-center text-sm text-muted">Sin sesiones programadas.</p>
				{:else}
					<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
						{#each editionSessions as s (s.id)}
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
								participantNames={s.participantNames}
							>
								{#snippet children()}
									{#if s.participants.length > 0}
										<p class="text-[10px] text-muted">{s.participants.length} participante{s.participants.length !== 1 ? 's' : ''}</p>
									{:else}
										<p class="text-[10px] text-gray-300">Sin participantes</p>
									{/if}
								{/snippet}
							</SessionCard>
						{/each}
					</div>
				{/if}
			</div>
		{/if}
	{/if}
	</div>
</div>
