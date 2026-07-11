<script lang="ts">
	import { getServiceColor } from '$lib/features/services/colors';
	import { User, Waves, Calendar } from 'lucide-svelte';
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	let { data }: { data: PageData } = $props();

	const sortedDates = $derived(Object.keys(data.byDate).sort());
	const totalCount = $derived(Object.values(data.byDate).reduce((acc, b) => acc + b.length, 0));

	function fmtDate(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
			weekday: 'long', day: 'numeric', month: 'long'
		});
	}
	function fmtDateShort(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
	}

	// Session progress dots — up to 10 dots, then text
	function sessionDots(scheduled: number, total: number) {
		if (total <= 0) return null;
		if (total > 10) return null; // text only
		return Array.from({ length: total }, (_, i) => i < scheduled);
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<!-- Header -->
	<div class="border-b border-border bg-surface px-4 py-3 space-y-2 sm:px-6 sm:py-4">
		<div class="flex items-center justify-between gap-2">
			<h1 class="text-lg font-bold text-navy">{m.booking_list_title()}</h1>
			<div class="flex items-center gap-2">
				<p class="text-xs text-muted">{totalCount} reserva{totalCount !== 1 ? 's' : ''}</p>
				<a href="/bookings/new" class="btn-primary btn-sm">{m.common_new()}</a>
			</div>
		</div>
		<form method="GET" class="flex flex-wrap items-center gap-2">
			<input type="date" name="from" value={data.from} class="input text-sm min-w-0 flex-1"
				onchange={(e) => e.currentTarget.form?.requestSubmit()} />
			<span class="text-xs text-muted">→</span>
			<input type="date" name="to" value={data.to} class="input text-sm min-w-0 flex-1"
				onchange={(e) => e.currentTarget.form?.requestSubmit()} />
			{#if data.uniqueServices.length > 1}
				<select name="service" class="input text-sm w-full sm:w-auto"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}>
					<option value="">Todos los servicios</option>
					{#each data.uniqueServices as svc}
						<option value={svc} selected={svc === data.serviceFilter}>{svc}</option>
					{/each}
				</select>
			{/if}
			{#if data.statusFilter !== 'all'}
				<input type="hidden" name="status" value={data.statusFilter} />
			{/if}
		</form>
		<!-- Status tabs -->
		<div class="flex gap-1.5 overflow-x-auto py-0.5">
			{#each [
				{ value: 'all',       label: m.booking_list_filter_all() },
				{ value: 'pending',   label: m.booking_list_filter_pending() },
				{ value: 'confirmed', label: m.booking_list_filter_confirmed() },
				{ value: 'cancelled', label: m.booking_list_filter_cancelled() }
			] as tab}
				<a href="?from={data.from}&to={data.to}{data.serviceFilter ? '&service=' + encodeURIComponent(data.serviceFilter) : ''}{tab.value !== 'all' ? '&status=' + tab.value : ''}"
					class="shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors
					{data.statusFilter === tab.value || (tab.value === 'all' && data.statusFilter === 'all')
						? 'bg-ocean text-white'
						: 'bg-surface text-muted ring-1 ring-border hover:text-gray-700'}"
				>{tab.label}</a>
			{/each}
		</div>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		{#if sortedDates.length === 0}
			<div class="py-20 text-center text-sm text-muted">Sin reservas en este período.</div>
		{:else}
			<div class="space-y-8">
				{#each sortedDates as date}
					{@const dayBookings = data.byDate[date]}
					<section>
						<h2 class="mb-3 text-xs font-bold uppercase tracking-widest text-muted">
							{fmtDate(date)}
						</h2>
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
							{#each dayBookings as b (b.id)}
								{@const color = getServiceColor(b.serviceColor ?? '')}
								{@const dots = b.serviceHasSessions ? sessionDots(b.scheduledCount, b.sessionCount) : null}
								{@const isCancelled = b.status === 'cancelled'}

								<a href="/bookings/{b.id}"
									class="group flex flex-col overflow-hidden rounded-xl border border-gray-100 bg-white transition-all hover:border-ocean/30 hover:shadow-sm
										{isCancelled ? 'opacity-60' : ''}">

									<!-- Top bar -->
									<div class="flex items-start gap-2.5 p-3 pb-2">
										<!-- Color dot + service -->
										<div class="mt-0.5 flex h-2.5 w-2.5 shrink-0 rounded-full {color.bg}"
											style="box-shadow: 0 0 0 2px white, 0 0 0 3px {color.border.replace('border-','').replace('-500','').replace('-400','')}"></div>

										<div class="min-w-0 flex-1">
											<p class="truncate text-sm font-semibold text-gray-900">{b.serviceName ?? '—'}</p>
											<!-- Client -->
											<p class="mt-0.5 truncate text-xs text-ocean">
												{b.firstClientName ?? '—'}
												{#if (b.participantCount ?? 0) > 1}
													<span class="text-muted">· {b.participantCount} part.</span>
												{/if}
											</p>
										</div>

										<!-- Badges -->
										<div class="flex shrink-0 flex-col items-end gap-1">
											<StatusBadge variant={b.status} />
										</div>
									</div>

									<!-- Meta row -->
									<div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 pb-2 text-[11px] text-muted">
										{#if b.serviceHasDateRange && b.serviceEditionStartDate}
											<span class="flex items-center gap-1"><Calendar size={10} class="shrink-0" /> {fmtDateShort(b.serviceEditionStartDate)} → {fmtDateShort(b.serviceEditionEndDate ?? b.serviceEditionStartDate)}</span>
										{:else if b.time}
											<span>{b.time.slice(0, 5)}</span>
										{:else if b.isFlexible}
											<span>Flexible</span>
										{/if}
										{#if b.instructorName && !b.serviceHasSessions}
											<span class="flex items-center gap-1"><User size={10} class="shrink-0" /> {b.instructorName.split(' ')[0]}</span>
										{/if}
										{#if b.sessionsIncluded != null}
											<span class="flex items-center gap-1"><Waves size={10} class="shrink-0" /> {b.sessionsIncluded} ses.</span>
										{/if}
									</div>

									<!-- Session progress -->
									{#if b.serviceHasSessions && b.sessionCount > 0}
										<div class="border-t border-gray-100 px-3 py-2">
											{#if dots}
												<div class="flex items-center gap-1.5">
													<div class="flex gap-0.5">
														{#each dots as filled}
															<div class="h-2 w-2 rounded-full {filled ? 'bg-green-500' : 'bg-gray-200'}"></div>
														{/each}
													</div>
													<span class="text-[10px] text-muted">
														{b.scheduledCount}/{b.sessionCount}
														{#if b.scheduledCount < b.sessionCount}
															<span class="text-amber-600">· {b.sessionCount - b.scheduledCount} pendiente{b.sessionCount - b.scheduledCount !== 1 ? 's' : ''}</span>
														{/if}
													</span>
												</div>
											{:else}
												<span class="text-[11px] {b.scheduledCount < b.sessionCount ? 'text-amber-600' : 'text-muted'}">
													{b.scheduledCount}/{b.sessionCount} sesiones
												</span>
											{/if}
										</div>
									{/if}
								</a>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}
	</div>
</div>
