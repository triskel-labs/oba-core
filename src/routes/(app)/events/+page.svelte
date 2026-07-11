<script lang="ts">
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<PageHeader
		title={m.event_list_title()}
		count="{data.events.length} evento{data.events.length !== 1 ? 's' : ''}"
		actionHref="/events/new"
		actionLabel={m.common_new_f()}
	/>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		{#if data.events.length === 0}
			<p class="py-20 text-center text-sm text-muted">{m.event_list_empty()}</p>
		{:else}
			<div class="space-y-2">
				{#each data.events as event}
					<a
						href="/events/{event.id}"
						class="flex items-start justify-between gap-3 rounded-xl border border-gray-100 bg-white p-4 transition-all hover:border-ocean/30 hover:shadow-sm"
					>
						<div class="min-w-0 flex-1">
							<p class="font-semibold text-gray-900">{event.title}</p>
							<p class="mt-0.5 text-xs text-muted">{event.startDate} → {event.endDate}</p>
							{#if event.description}
								<p class="mt-1 text-sm text-muted line-clamp-2">{event.description}</p>
							{/if}
						</div>
						<div class="flex shrink-0 items-center gap-2">
							{#if event.price}
								<p class="font-bold text-gray-900">€{event.price}</p>
							{/if}
							<span class="text-xs text-muted">→</span>
						</div>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
