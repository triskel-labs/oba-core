<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { toast } from '$lib/stores/toast.svelte';
	import { DOT_COLORS } from '$lib/features/services/colors';
	import type { ServiceColorKey } from '$lib/features/services/colors';
	import { MODULE_DEFINITIONS } from '$lib/modules/index';
	import ServiceForm from '$lib/components/services/ServiceForm.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import type { ActionData, PageData } from './$types';
	import * as m from '$lib/paraglide/messages';

	let { data, form }: { data: PageData; form: ActionData } = $props();

	const canEdit = $derived(data.canEditServices);

	function controlEnhance() {
		return () => async ({ result, update }: { result: any; update: () => Promise<void> }) => {
			if (result.type === 'success') {
				if (result.data?.message) toast(result.data.message);
				if (result.data?.deleted) { await goto('/services'); return; }
			}
			await update();
		};
	}

	function serviceFormEnhance() {
		return () => async ({ result, update }: { result: any; update: () => Promise<void> }) => {
			if (result.type === 'success' && result.data?.message) toast(result.data.message);
			await update();
		};
	}

	// Derive active module definitions for view mode badge display
	const activeModDefs = $derived(
		MODULE_DEFINITIONS.filter(mod => mod.key in ((data.service.modules as Record<string, unknown>) ?? {}))
	);
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<PageHeader
		title={data.service.name}
		backHref="/services"
		subtitle={!data.service.active ? m.common_inactive() : undefined}
	>
		{#snippet children()}
			<div class="flex flex-wrap gap-1">
				{#each activeModDefs as mod}
					<span class="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500">{mod.icon} {mod.label}</span>
				{/each}
				{#if activeModDefs.length === 0}
					<span class="text-[10px] text-muted">Sin módulos activos</span>
				{/if}
			</div>
		{/snippet}
	</PageHeader>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">

	<!-- Group class sessions link -->
	{#if data.hasGroupSessions}
		<a href="/services/{data.service.id}/sessions/"
			class="btn-primary btn-block mb-4 text-center block">
			Ver sesiones de grupo →
		</a>
	{/if}

	<!-- Roster quick link (for camp-style services) -->
	{#if data.service.modules?.roster && data.runs?.length > 0}
		<a href="/services/{data.service.id}/roster"
			class="btn-primary btn-block mb-6 text-center block">
			{m.service_detail_open_roster()}
		</a>
	{/if}

	<!-- Form error from control actions -->
	{#if form?.error && !form?.linkError && !form?.runError}
		<p class="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{form.error}</p>
	{/if}

	<!-- ── SERVICE FORM (editors) or READ-ONLY VIEW (non-editors) ─────────── -->
	{#if canEdit}
		<div>
			{#if form?.message}
				<p class="mb-4 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">{form.message}</p>
			{/if}
			<ServiceForm
				service={data.service}
				canEdit={canEdit}
				instructors={data.instructors}
				allItemTypes={data.allItemTypes}
				existingRuns={data.runs}
				existingLinks={data.inventoryLinks}
				formError={form?.error ?? null}
			/>

			<!-- Control actions at bottom, below Save -->
			<div class="mt-4 flex gap-2">
				<form method="post" action="?/toggle" use:enhance={controlEnhance()} class="flex-1">
					<button type="submit"
						class="btn-secondary w-full {!data.service.active ? 'text-confirmed' : ''}">
						{data.service.active ? m.service_detail_deactivate() : m.service_detail_activate()}
					</button>
				</form>
				<form method="post" action="?/delete" use:enhance={controlEnhance()}
					onsubmit={(e) => { if (!confirm(m.service_detail_delete_confirm())) e.preventDefault(); }}>
					<button type="submit" class="btn-destructive">{m.common_delete()}</button>
				</form>
			</div>
		</div>
	{:else}
		<!-- Non-editors: read-only summary -->
		<div class="space-y-4">
			<!-- Core info card -->
			<div class="rounded-xl border border-gray-100 bg-white p-4 space-y-3">
				<div class="flex items-center justify-between">
					<span class="text-xs font-semibold uppercase tracking-wider text-muted">{m.service_detail_price()}</span>
					<span class="text-sm font-semibold text-gray-800">
						€{data.service.basePrice}
						{#if data.service.pricingMode}
							<span class="font-normal text-muted text-xs">· {data.service.pricingMode}</span>
						{/if}
					</span>
				</div>
				{#if data.service.durationMinutes}
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold uppercase tracking-wider text-muted">{m.service_detail_duration()}</span>
						<span class="text-sm text-gray-800">{data.service.durationMinutes} {m.service_detail_duration_min()}</span>
					</div>
				{/if}
				{#if data.service.maxCapacity}
					<div class="flex items-center justify-between">
						<span class="text-xs font-semibold uppercase tracking-wider text-muted">{m.service_detail_max_capacity()}</span>
						<span class="text-sm text-gray-800">{data.service.maxCapacity}</span>
					</div>
				{/if}
				{#if data.service.description}
					<div>
						<span class="text-xs font-semibold uppercase tracking-wider text-muted">{m.common_description()}</span>
						<p class="mt-1 text-sm text-gray-700">{data.service.description}</p>
					</div>
				{/if}
			</div>

			<!-- Editions (read-only) -->
			{#if data.runs?.length > 0}
				<div class="rounded-xl border border-gray-100 bg-white p-4">
					<p class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{m.service_detail_runs()}</p>
					<div class="space-y-2">
						{#each data.runs as run}
							<div class="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-border hover:bg-gray-50">
								<div>
									<p class="text-sm font-medium text-gray-800">{run.startDate} → {run.endDate}</p>
									{#if run.maxCapacity}
										<p class="text-xs text-muted">{run.enrolledCount} / {run.maxCapacity} inscripciones</p>
									{/if}
								</div>
								<a href="/services/{data.service.id}/sessions?edition={run.id}"
									class="ml-3 shrink-0 text-xs font-medium text-ocean hover:underline">
									Sesiones →
								</a>
							</div>
						{/each}
					</div>
				</div>
			{/if}

			<!-- Inventory links (read-only) -->
			{#if data.inventoryLinks?.length > 0}
				<div class="rounded-xl border border-gray-100 bg-white p-4">
					<p class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{m.service_detail_linked_inventory()}</p>
					<div class="space-y-1.5">
						{#each data.inventoryLinks as link}
							<div class="flex items-center justify-between rounded-lg px-3 py-2 ring-1 ring-border">
								<p class="text-sm font-medium text-gray-800">{link.itemType.name}</p>
								<p class="text-xs text-muted">
									{link.quantityPerBooking}× · {link.isIncluded ? m.service_detail_inventory_included() : m.service_detail_inventory_addon()}
								</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>
	{/if}
	</div>
</div>
