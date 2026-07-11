<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import { getServiceColor } from '$lib/features/services/colors';
	import SessionCard from '$lib/components/sessions/SessionCard.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	type S = PageData['byDate'][string][number];

	const sortedDates = $derived(Object.keys(data.byDate).sort());
	const totalCount = $derived(Object.values(data.byDate).reduce((acc, s) => acc + s.length, 0));

	function fmtDate(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
			weekday: 'long', day: 'numeric', month: 'long'
		});
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<!-- Header -->
	<div class="space-y-2 border-b border-border bg-surface px-4 py-3 sm:px-6 sm:py-4">
		<div class="flex items-center justify-between gap-2">
			<h1 class="text-lg font-bold text-navy">Sesiones</h1>
			<p class="text-xs text-muted">{totalCount} sesión{totalCount !== 1 ? 'es' : ''}</p>
		</div>
		<form method="GET" class="flex flex-wrap items-center gap-2">
			<input type="date" name="from" value={data.from} class="input min-w-0 flex-1 text-sm"
				onchange={(e) => e.currentTarget.form?.requestSubmit()} />
			<span class="text-xs text-muted">→</span>
			<input type="date" name="to" value={data.to} class="input min-w-0 flex-1 text-sm"
				onchange={(e) => e.currentTarget.form?.requestSubmit()} />
			{#if data.uniqueServices.length > 1}
				<select name="service" class="input w-full text-sm sm:w-auto"
					onchange={(e) => e.currentTarget.form?.requestSubmit()}>
					<option value="">Todos los servicios</option>
					{#each data.uniqueServices as svc}
						<option value={svc} selected={svc === data.serviceFilter}>{svc}</option>
					{/each}
				</select>
			{/if}
		</form>
	</div>

	<!-- Content -->
	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		{#if sortedDates.length === 0}
			<div class="py-20 text-center text-sm text-muted">Sin sesiones en este período.</div>
		{:else}
			<div class="space-y-8">
				{#each sortedDates as date}
					{@const daySessions = data.byDate[date]}
					<section>
						<h2 class="mb-3 text-xs font-bold uppercase tracking-widest text-muted">{fmtDate(date)}</h2>
						<div class="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
							{#each daySessions as s (s.id)}
								{@const color = getServiceColor(s.serviceColor ?? '')}
								<SessionCard
									session={s}
									{color}
									openHref="/sessions/{s.id}"
									updateAction="?/updateSession"
									cancelAction="?/cancelSession"
									hiddenFields={{ sessionId: s.id }}
									clientGroups={s.clientGroups}
									participantNames={s.participantNames}
								>
									{#snippet children()}
										<p class="truncate text-sm font-semibold text-gray-900">{s.serviceName ?? '—'}</p>
										{#if s.ownerType === 'booking' && s.firstClientName}
											<p class="text-xs font-medium text-ocean">
												<a href="/bookings/{s.bookingId}" class="hover:underline">{s.firstClientName}</a>
											</p>
										{:else if (s.enrolledCount ?? 0) > 0}
											<p class="text-xs text-muted">{s.enrolledCount} inscrito{s.enrolledCount !== 1 ? 's' : ''}</p>
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
