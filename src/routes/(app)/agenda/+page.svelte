<script lang="ts">
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import { getLocale } from '$lib/paraglide/runtime';
	import { User, Waves } from 'lucide-svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	let { data }: { data: PageData } = $props();

	const today = new Date(data.today + 'T00:00:00');
	const dayLabel = $derived(today.toLocaleDateString(getLocale(), {
		weekday: 'long', day: 'numeric', month: 'long'
	}));

	function fmt(t: string | null) {
		return t ? t.slice(0, 5) : null;
	}

	function sessionStatusVariant(status: string): 'active' | 'completed' | 'cancelled' | 'unscheduled' {
		if (status === 'completed') return 'completed';
		if (status === 'cancelled') return 'cancelled';
		if (status === 'unscheduled') return 'unscheduled';
		return 'active';
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<PageHeader
		title={dayLabel}
		subtitle={m.agenda_title()}
		actionHref="/bookings/new"
		actionLabel={m.agenda_new_booking()}
	/>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">

	<!-- Stat cards -->
	<div class="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
		<!-- Scheduled today -->
		<div class="rounded-xl border border-gray-100 bg-white p-4">
			<p class="text-2xl font-bold text-navy">{data.scheduledToday}</p>
			<p class="mt-0.5 text-xs text-muted">Sesiones hoy</p>
		</div>

		<!-- Unscheduled today -->
		{#if data.unscheduledToday > 0}
			<a href="/calendar?view=day&date={data.today}"
				class="rounded-(--radius-card) bg-amber-50 p-4 ring-1 ring-amber-200 hover:ring-amber-400">
				<p class="text-2xl font-bold text-amber-700">{data.unscheduledToday}</p>
				<p class="mt-0.5 text-xs text-amber-600">Sin hora hoy</p>
			</a>
		{:else}
			<div class="rounded-xl border border-gray-100 bg-white p-4">
				<p class="text-2xl font-bold text-navy">{data.unscheduledToday}</p>
				<p class="mt-0.5 text-xs text-muted">Sin hora hoy</p>
			</div>
		{/if}

		<!-- Upcoming unscheduled -->
		{#if data.stats.unscheduledCount > 0}
			<a href="/calendar"
				class="rounded-(--radius-card) bg-amber-50 p-4 ring-1 ring-amber-200 hover:ring-amber-400">
				<p class="text-2xl font-bold text-amber-700">{data.stats.unscheduledCount}</p>
				<p class="mt-0.5 text-xs text-amber-600">Por programar</p>
			</a>
		{:else}
			<div class="rounded-xl border border-gray-100 bg-white p-4">
				<p class="text-2xl font-bold text-green-600">✓</p>
				<p class="mt-0.5 text-xs text-muted">Al día</p>
			</div>
		{/if}

		<!-- Pending revenue -->
		<div class="rounded-xl border border-gray-100 bg-white p-4">
			<p class="text-2xl font-bold text-navy">€{data.stats.pendingRevenue.toFixed(0)}</p>
			<p class="mt-0.5 text-xs text-muted">Pendiente cobro</p>
		</div>
	</div>

	<!-- Today's sessions -->
	<section class="mb-6">
		<div class="mb-3 flex items-center justify-between">
			<h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Sesiones de hoy</h2>
			<a href="/calendar?view=day&date={data.today}" class="text-xs text-ocean hover:underline">
				Ver calendario →
			</a>
		</div>

		{#if data.todaySessions.length === 0}
			<p class="rounded-xl border border-gray-100 bg-white p-6 text-center text-sm text-muted">
				No hay sesiones programadas para hoy.
			</p>
		{:else}
			<div class="space-y-2">
				{#each data.todaySessions as session}
					<div class="rounded-xl border border-gray-100 bg-white p-4 {session.status === 'cancelled' ? 'opacity-50' : ''}">
						<div class="flex items-start gap-3">
							<!-- Time column -->
							<div class="w-14 shrink-0 text-center">
								{#if session.time}
									<p class="text-sm font-bold text-navy">{fmt(session.time)}</p>
								{:else}
									<span class="inline-block rounded-full bg-amber-100 px-1.5 py-0.5 text-xs text-amber-700">Sin hora</span>
								{/if}
								{#if session.durationMinutes || session.effectiveDuration}
									<p class="text-xs text-muted">{session.durationMinutes ?? session.effectiveDuration}m</p>
								{/if}
							</div>

							<!-- Main content -->
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<p class="font-medium text-gray-800">{session.serviceName ?? 'Sesión'}</p>
									<StatusBadge variant={sessionStatusVariant(session.status)} />
								</div>

								{#if session.instructors?.length}
									<p class="mt-0.5 flex items-center gap-1 text-xs text-muted">
										<User size={10} class="shrink-0" />
										{session.instructors.map(i => i.instructorName).filter(Boolean).join(', ')}
									</p>
								{/if}

								{#if session.participantNames?.length}
									<p class="mt-0.5 flex items-center gap-1 text-xs text-muted">
										<Waves size={10} class="shrink-0" />
										{session.participantNames.join(', ')}
									</p>
								{/if}

								{#if session.notes}
									<p class="mt-0.5 text-xs italic text-muted">{session.notes}</p>
								{/if}
							</div>

							<!-- Link -->
							<a href="/calendar?view=day&date={data.today}" class="shrink-0 text-xs text-ocean hover:underline">
								→
							</a>
						</div>
					</div>
				{/each}
			</div>
		{/if}
	</section>

	<!-- Active camps -->
	{#if data.activeCamps.length > 0}
		<section class="mb-6">
			<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Camps activos</h2>
			<div class="space-y-2">
				{#each data.activeCamps as camp}
					<a
						href="/bookings/{camp.id}"
						class="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 transition-all hover:border-ocean/30 hover:shadow-sm"
					>
						<div class="min-w-0">
							<p class="font-medium text-gray-800">{camp.serviceName ?? 'Camp'}</p>
							{#if camp.serviceEditionStartDate}
								<p class="text-xs text-muted">{camp.serviceEditionStartDate} → {camp.serviceEditionEndDate}</p>
							{:else}
								<p class="text-xs text-muted">{camp.date}{camp.dateEnd ? ` → ${camp.dateEnd}` : ''}</p>
							{/if}
						</div>
						<div class="shrink-0 text-right">
							<p class="text-sm font-semibold text-navy">
								{camp.clientCount}{camp.serviceMaxCapacity ? `/${camp.serviceMaxCapacity}` : ''}
							</p>
							<p class="text-xs text-muted">inscritos</p>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Upcoming events -->
	{#if data.nextEvents.length > 0}
		<section class="mb-6">
			<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">Próximos eventos</h2>
			<div class="space-y-2">
				{#each data.nextEvents as event}
					<a
						href="/events/{event.id}"
						class="flex items-center justify-between rounded-xl border border-gray-100 bg-white p-4 transition-all hover:border-ocean/30 hover:shadow-sm"
					>
						<div>
							<p class="font-medium text-gray-800">{event.title}</p>
							<p class="text-xs text-muted">{event.startDate} → {event.endDate}</p>
						</div>
					</a>
				{/each}
			</div>
		</section>
	{/if}

	<!-- Needs scheduling -->
	{#if data.unscheduledUpcoming.length > 0}
		<section>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-xs font-semibold uppercase tracking-wider text-muted">Por programar</h2>
				<a href="/calendar" class="text-xs text-ocean hover:underline">{m.agenda_view_all()}</a>
			</div>
			<a
				href="/calendar"
				class="flex items-center gap-4 rounded-(--radius-card) bg-amber-50 p-4 ring-1 ring-amber-200 hover:ring-amber-400"
			>
				<span class="text-2xl font-bold text-amber-700">{data.unscheduledUpcoming.length}</span>
				<div>
					<p class="text-sm font-medium text-amber-800">
						{data.unscheduledUpcoming.length === 1 ? 'sesión pendiente de programar' : 'sesiones pendientes de programar'}
					</p>
					<p class="text-xs text-amber-600">Ir al calendario →</p>
				</div>
			</a>
		</section>
	{/if}
	</div>
</div>
