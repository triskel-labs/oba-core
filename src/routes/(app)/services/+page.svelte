<script lang="ts">
	import type { PageData } from './$types';
	import type { Service } from '$lib/features/services/types';
	import { DOT_COLORS } from '$lib/features/services/colors';
	import type { ServiceColorKey } from '$lib/features/services/colors';
	import * as m from '$lib/paraglide/messages';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';

	let { data }: { data: PageData } = $props();

	const typeLabels = $derived<Record<string, string>>({
		lesson:        m.service_list_type_lesson(),
		camp:          m.service_list_type_camp(),
		product:       m.service_list_type_product(),
		rental:        m.service_list_type_rental(),
		accommodation: m.service_list_type_accommodation(),
		other:         m.service_list_type_other()
	});

	const grouped = $derived(
		data.services.reduce<Record<string, Service[]>>((acc, s) => {
			(acc[s.type] ??= []).push(s);
			return acc;
		}, {})
	);
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<PageHeader
		title={m.service_list_title()}
		count="{data.services.length} servicio{data.services.length !== 1 ? 's' : ''}"
		actionHref="/services/new"
		actionLabel={m.common_new()}
	/>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		{#if data.services.length === 0}
			<p class="py-20 text-center text-sm text-muted">{m.service_list_empty()}</p>
		{:else}
			<div class="space-y-6">
				{#each Object.entries(grouped) as [type, items]}
					<section>
						<h2 class="mb-2 px-1 text-[10px] font-bold uppercase tracking-widest text-muted">
							{typeLabels[type] ?? type}
						</h2>
						<div class="space-y-2">
							{#each items as service}
								<div class="overflow-hidden rounded-xl border border-gray-100 bg-white transition-all hover:border-ocean/30 hover:shadow-sm {!service.active ? 'opacity-60' : ''}">
									<a href="/services/{service.id}" class="flex items-center gap-3 p-4">
										<span class="inline-block h-3 w-3 shrink-0 rounded-full" style="background-color: {DOT_COLORS[service.color as ServiceColorKey] ?? DOT_COLORS['ocean']}"></span>
										<div class="min-w-0 flex-1">
											<p class="font-semibold text-gray-900 {!service.active ? 'line-through opacity-50' : ''}">{service.name}</p>
											<div class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted">
												{#if service.durationMinutes}
													<span>{service.durationMinutes} min</span>
												{/if}
												{#if data.runsByService[service.id]?.length}
													{#each data.runsByService[service.id] as run}
														<span>{run.startDate} → {run.endDate}{run.maxCapacity ? ` · ${run.enrolledCount}/${run.maxCapacity}` : ''}</span>
													{/each}
												{:else if service.maxCapacity}
													<span>{m.common_max()} {service.maxCapacity}</span>
												{/if}
												{#if !service.active}
													<span class="text-muted/60">{m.common_inactive()}</span>
												{/if}
											</div>
										</div>
										<div class="shrink-0 text-right">
											<p class="font-bold text-gray-900">€{service.basePrice}</p>
										</div>
										<span class="shrink-0 text-xs text-muted">→</span>
									</a>
									{#if service.modules?.roster && data.runsByService[service.id]?.length}
										<div class="border-t border-gray-100 px-4 py-2">
											<a href="/services/{service.id}/roster" class="text-xs font-medium text-ocean hover:underline">
												{m.service_list_open_roster()} →
											</a>
										</div>
									{/if}
								</div>
							{/each}
						</div>
					</section>
				{/each}
			</div>
		{/if}
	</div>
</div>
