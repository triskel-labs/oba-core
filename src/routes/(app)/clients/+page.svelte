<script lang="ts">
	import { goto } from '$app/navigation';
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	let { data }: { data: PageData } = $props();
	let search = $state(data.search ?? '');

	function handleSearch() {
		const params = search ? `?q=${encodeURIComponent(search)}` : '';
		goto(`/clients${params}`, { replaceState: true });
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<PageHeader
		title={m.client_list_title()}
		count="{data.clients.length} cliente{data.clients.length !== 1 ? 's' : ''}"
		actionHref="/clients/new"
		actionLabel={m.common_new()}
	>
		{#snippet children()}
			<input
				type="search"
				placeholder={m.client_list_search()}
				bind:value={search}
				oninput={handleSearch}
				class="w-full rounded-lg border border-border bg-white px-3 py-2 text-sm focus:border-ocean focus:outline-none focus:ring-2 focus:ring-ocean/20"
			/>
		{/snippet}
	</PageHeader>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		{#if data.clients.length === 0}
			<p class="py-20 text-center text-sm text-muted">
				{data.search ? m.client_list_empty_search() : m.client_list_empty()}
			</p>
		{:else}
			<div class="space-y-2">
				{#each data.clients as client}
					<a
						href="/clients/{client.id}"
						class="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 transition-all hover:border-ocean/30 hover:shadow-sm"
					>
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ocean/10 text-sm font-bold text-ocean">
							{client.firstName[0]}{client.lastName[0]}
						</div>
						<div class="min-w-0 flex-1">
							<p class="font-semibold text-gray-900">{client.firstName} {client.lastName}</p>
							{#if client.phone}
								<p class="truncate text-xs text-muted">{client.phone}</p>
							{:else if client.email}
								<p class="truncate text-xs text-muted">{client.email}</p>
							{/if}
						</div>
						{#if client.skillLevel}
							<StatusBadge variant={client.skillLevel} class="shrink-0" />
						{/if}
						<span class="shrink-0 text-xs text-muted">→</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
