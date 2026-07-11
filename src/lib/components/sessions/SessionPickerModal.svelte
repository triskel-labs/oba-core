<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import type { Session } from '$lib/features/sessions/types';

	interface ParticipantGroup {
		bookingId: string;
		clientName: string;
		participants: { id: string; name: string }[];
	}

	interface ModalSession extends Session {
		participantGroups?: ParticipantGroup[];
	}

	interface Instructor {
		id: string;
		name: string;
	}

	let {
		open = $bindable(false),
		bookingId,
		bookingStatus,
		incomingParticipantCount,
		capacity,
		availableSessions = [],
		instructors = [],
		bookingDate,
		newSessionAction = '?/addSession'
	}: {
		open: boolean;
		bookingId: string;
		bookingStatus: string;
		incomingParticipantCount: number;
		capacity: number | null;
		availableSessions?: ModalSession[];
		instructors?: Instructor[];
		bookingDate: string;
		newSessionAction?: string;
	} = $props();

	let activeTab = $state<'new' | 'link'>('link');

	let newDate = $state(bookingDate);
	let newTime = $state('');
	let newDuration = $state(60);

	function fmtDate(d: string) {
		return new Date(d + 'T00:00:00').toLocaleDateString('es', {
			weekday: 'short',
			day: 'numeric',
			month: 'short'
		});
	}
</script>

{#if open}
	<!-- Backdrop -->
	<div
		class="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
		onclick={() => (open = false)}
		role="presentation"
	></div>

	<!-- Panel -->
	<div class="fixed inset-x-4 top-[5%] z-50 mx-auto max-w-2xl overflow-hidden rounded-xl bg-white shadow-2xl md:inset-x-auto md:left-1/2 md:w-full md:-translate-x-1/2">
		<!-- Header -->
		<div class="flex items-center justify-between border-b border-gray-100 px-5 py-4">
			<div>
				<h2 class="text-sm font-bold text-gray-900">Sesión</h2>
				<p class="mt-0.5 text-xs text-gray-400">Crear nueva o vincular existente</p>
			</div>
			<button
				onclick={() => (open = false)}
				class="flex h-7 w-7 items-center justify-center rounded-full border border-gray-200 text-sm text-gray-400 hover:bg-gray-50"
			>✕</button>
		</div>

		<!-- Tabs -->
		<div class="flex border-b border-gray-100 bg-gray-50">
			<button
				onclick={() => (activeTab = 'new')}
				class="flex-1 border-b-2 py-2.5 text-xs font-semibold transition-colors
					{activeTab === 'new' ? 'border-green-600 bg-white text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'}"
			>+ Nueva sesión</button>
			<button
				onclick={() => (activeTab = 'link')}
				class="flex-1 border-b-2 py-2.5 text-xs font-semibold transition-colors
					{activeTab === 'link' ? 'border-green-600 bg-white text-green-700' : 'border-transparent text-gray-400 hover:text-gray-600'}"
			>🔗 Vincular existente</button>
		</div>

		<!-- Content -->
		<div class="max-h-[70vh] overflow-y-auto">
			{#if activeTab === 'new'}
				<!-- New session form -->
				<form
					method="post"
					action={newSessionAction}
					use:enhance={withToast(() => { open = false; })}
					class="space-y-4 p-5"
				>
					<div class="grid grid-cols-2 gap-3">
						<div>
							<label class="mb-1 block text-xs text-gray-500">Fecha</label>
							<input name="sessionDate" type="date" bind:value={newDate} required class="input w-full text-sm" />
						</div>
						<div>
							<label class="mb-1 block text-xs text-gray-500">Hora</label>
							<input name="sessionTime" type="time" bind:value={newTime} class="input w-full text-sm" />
						</div>
						<div>
							<label class="mb-1 block text-xs text-gray-500">Duración (min)</label>
							<input name="sessionDuration" type="number" min="15" step="15" bind:value={newDuration} class="input w-full text-sm" />
						</div>
					</div>
					{#if instructors.length > 0}
						<div>
							<div class="mb-2 text-xs text-gray-500">Instructor</div>
							<div class="space-y-1.5">
								{#each instructors as inst (inst.id)}
									<label class="flex cursor-pointer items-center gap-2">
										<input type="checkbox" name="sessionInstructorId" value={inst.id} class="h-3.5 w-3.5 accent-green-600" />
										<span class="text-sm text-gray-700">{inst.name}</span>
									</label>
								{/each}
							</div>
						</div>
					{/if}
					<button type="submit" class="btn-primary w-full">Crear sesión</button>
				</form>

			{:else}
				<!-- Link existing -->
				<div class="flex flex-col gap-3 bg-gray-100 p-3">
					{#if availableSessions.length === 0}
						<p class="px-2 py-4 text-center text-sm text-gray-400">
							No hay sesiones disponibles del servicio para vincular.
						</p>
					{/if}
					{#each availableSessions as s (s.id)}
						{@const taken = s.participants.length}
						{@const wouldBe = taken + incomingParticipantCount}
						{@const over = capacity != null && wouldBe > capacity}

						<div class="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
							<!-- Session header -->
							<div class="flex items-center justify-between border-b border-gray-100 bg-gray-50 px-4 py-2.5">
								<span class="text-xs font-bold text-gray-800">
									{fmtDate(s.date)}
									{s.time ? ' · ' + s.time.slice(0, 5) : ''}
									{s.instructors.length > 0 ? ' · ' + s.instructors.map(i => i.instructorName).filter(Boolean).join(', ') : ''}
								</span>
								{#if over}
									<span class="rounded-full bg-amber-100 px-2 py-0.5 text-[9px] font-bold text-amber-700">
										⚠ Llena {taken}/{capacity}
									</span>
								{:else}
									<span class="rounded-full bg-gray-200 px-2 py-0.5 text-[9px] text-gray-500">
										{taken}{capacity != null ? `/${capacity}` : ''}
									</span>
								{/if}
							</div>

							<div class="p-3">
								{#if s.participantGroups && s.participantGroups.length > 0}
									<div class="mb-2 text-[9px] font-bold uppercase tracking-wide text-gray-400">Inscritos</div>
									<div class="mb-3 flex flex-col gap-2">
										{#each s.participantGroups as g (g.bookingId)}
											<div class="rounded-lg bg-gray-50 px-3 py-2">
												<div class="mb-1.5 text-[10px] font-semibold text-gray-600">{g.clientName}</div>
												<div class="flex flex-wrap gap-1">
													{#each g.participants as p (p.id)}
														<span class="rounded-full bg-gray-200 px-2 py-0.5 text-[9px] text-gray-600">{p.name}</span>
													{/each}
												</div>
											</div>
										{/each}
									</div>
								{:else if s.participants.length > 0}
									<div class="mb-3 flex flex-wrap gap-1">
										{#each s.participants as p (p.id)}
											<span class="rounded-full bg-gray-200 px-2 py-0.5 text-[9px] text-gray-600">{p.name}</span>
										{/each}
									</div>
								{:else}
									<p class="mb-3 text-[11px] italic text-gray-400">Sin inscritos aún.</p>
								{/if}

								<p class="mb-2 text-[10px] text-gray-500">
									Vincular añade {incomingParticipantCount} participante{incomingParticipantCount !== 1 ? 's' : ''} →
									<strong class="{over ? 'text-amber-600' : 'text-green-600'}">{wouldBe}{capacity != null ? `/${capacity}` : ''}</strong>
								</p>

								{#if over}
									<div class="mb-2 rounded-md bg-amber-50 px-3 py-2 text-[10px] text-amber-700">
										⚠ Vinculando se superaría el aforo máximo de {capacity}.
									</div>
									<form method="post" action="?/assignToSession" use:enhance={withToast(() => { open = false; })}>
										<input type="hidden" name="sessionId" value={s.id} />
										<button type="submit" class="w-full rounded-lg border border-gray-200 bg-gray-50 py-2 text-xs text-gray-500 hover:bg-gray-100">
											Vincular de todos modos (override)
										</button>
									</form>
								{:else}
									<form method="post" action="?/assignToSession" use:enhance={withToast(() => { open = false; })}>
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
