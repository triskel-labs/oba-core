<script lang="ts">
	import { Package, Tag } from 'lucide-svelte';
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<PageHeader
		title={m.inventory_page_title()}
		count="{data.itemTypes.length} tipo{data.itemTypes.length !== 1 ? 's' : ''}"
		actionHref="/inventory/new"
		actionLabel={m.inventory_btn_new_type()}
	/>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		{#if data.itemTypes.length === 0}
			<div class="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-gray-200 py-20 text-center">
				<Package size={40} class="mb-3 text-gray-300" />
				<p class="font-medium text-gray-700">{m.inventory_empty_title()}</p>
				<p class="mt-1 text-sm text-muted">{m.inventory_empty_desc()}</p>
				<a href="/inventory/new" class="btn-primary btn-sm mt-4">{m.inventory_empty_btn()}</a>
			</div>
		{:else}
			<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
				{#each data.itemTypes as type}
					<a
						href="/inventory/{type.id}"
						class="group flex flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 transition-all hover:border-ocean/30 hover:shadow-sm {!type.active ? 'opacity-60' : ''}"
					>
						<div class="flex items-start justify-between">
							<div class="flex items-center gap-2">
								<span class="flex h-8 w-8 items-center justify-center rounded-lg bg-ocean/10 text-ocean">
									<Package size={16} />
								</span>
								<div>
									<p class="font-semibold text-gray-900 group-hover:text-ocean">{type.name}</p>
									{#if !type.active}
										<span class="text-xs text-muted">{m.inventory_badge_inactive()}</span>
									{/if}
								</div>
							</div>
							<StatusBadge variant={type.trackingMode} label={type.trackingMode === 'pool' ? m.inventory_badge_pool() : m.inventory_badge_specific()} />
						</div>

						{#if type.description}
							<p class="text-sm text-muted line-clamp-2">{type.description}</p>
						{/if}

						{#if type.trackingMode === 'pool' && type.totalPoolSize}
							<p class="text-sm text-muted">{m.inventory_units_count({ count: type.totalPoolSize })}</p>
						{/if}

						{#if Object.keys(type.attributeSchema).length > 0}
							<div class="flex flex-wrap gap-1">
								{#each Object.entries(type.attributeSchema) as [key, values]}
									<span class="flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] text-gray-600">
										<Tag size={10} />
										{key}: {(values as string[]).join(', ')}
									</span>
								{/each}
							</div>
						{/if}
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
