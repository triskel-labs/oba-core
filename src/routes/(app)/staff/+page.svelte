<script lang="ts">
	import type { PageData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	let { data }: { data: PageData } = $props();
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<PageHeader
		title={m.staff_list_title()}
		count="{data.staff.length} miembro{data.staff.length !== 1 ? 's' : ''}"
		actionHref="/staff/new"
		actionLabel={m.staff_list_invite()}
	/>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		{#if data.staff.length === 0}
			<p class="py-20 text-center text-sm text-muted">{m.staff_list_empty()}</p>
		{:else}
			<div class="space-y-2">
				{#each data.staff as member}
					<a
						href="/staff/{member.id}"
						class="flex items-center gap-3 rounded-xl border border-gray-100 bg-white px-4 py-3 transition-all hover:border-ocean/30 hover:shadow-sm"
					>
						<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ocean/10 text-sm font-bold text-ocean">
							{member.name[0].toUpperCase()}
						</div>
						<div class="min-w-0 flex-1">
							<div class="flex flex-wrap items-center gap-1.5">
								<p class="font-semibold text-gray-900">{member.name}</p>
								{#each (member.roles?.length ? member.roles : member.role ? [member.role] : []) as r}
									<StatusBadge variant={r} />
								{/each}
								{#if member.banned}
									<StatusBadge variant="banned" />
								{/if}
							</div>
							<p class="text-xs text-muted">{member.email}</p>
						</div>
						<span class="shrink-0 text-xs text-muted">→</span>
					</a>
				{/each}
			</div>
		{/if}
	</div>
</div>
