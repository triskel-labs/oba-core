<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import type { ServiceModules } from '$lib/features/services/modules';
	import type { InventoryAllocationWithDetails, InventoryItem } from '$lib/features/inventory/types';

	interface ServiceInventoryLink {
		itemTypeId: string;
		itemType: { name: string; attributeSchema: Record<string, string[]> };
	}

	interface Participant {
		id: string;
		name: string;
	}

	let {
		booking,
		modules,
		serviceInventoryLinks,
		itemsByAllocType,
		allocTypeTracking,
		participants = []
	}: {
		booking: {
			id: string;
			date: string;
			dateEnd?: string | null;
			status: string;
			allocations: InventoryAllocationWithDetails[];
			clients: { id: string; status: string; participantCount?: number | null }[];
		};
		modules: ServiceModules;
		serviceInventoryLinks: ServiceInventoryLink[];
		itemsByAllocType: Record<string, InventoryItem[]>;
		allocTypeTracking: Record<string, 'pool' | 'specific'>;
		participants?: Participant[];
	} = $props();

	// Allocations grouped by bookingParticipantId (null = booking-level / unassigned)
	const byParticipant = $derived(() => {
		const map = new Map<string | null, InventoryAllocationWithDetails[]>();
		map.set(null, []); // always have the unassigned bucket
		for (const p of participants) map.set(p.id, []);
		for (const a of booking.allocations) {
			const key = a.bookingParticipantId ?? null;
			if (!map.has(key)) map.set(key, []);
			map.get(key)!.push(a);
		}
		return map;
	});

	const missingLinks = $derived(
		serviceInventoryLinks.filter(l => !booking.allocations.some(a => a.itemTypeId === l.itemTypeId))
	);

	// Which column's add-form is open: participantId (string) | null (unassigned)
	let addingFor = $state<string | null | undefined>(undefined); // undefined = closed
	let addAllocTypeId = $state('');
	let addAllocQty = $state(1);
	let addAllocSelectedGroup = $state<string | null>(null);
	let addFuzzy = $state(true);

	$effect(() => {
		if (addingFor !== undefined && !addAllocTypeId && serviceInventoryLinks.length > 0)
			addAllocTypeId = serviceInventoryLinks[0].itemTypeId;
	});

	function openAdd(forId: string | null) {
		addingFor = forId;
		addAllocTypeId = serviceInventoryLinks[0]?.itemTypeId ?? '';
		addAllocQty = 1;
		addAllocSelectedGroup = null;
		addFuzzy = true;
	}
	function closeAdd() {
		addingFor = undefined;
		addAllocSelectedGroup = null;
		addAllocQty = 1;
		addFuzzy = true;
	}

	function groupInventoryItems(
		items: { id: string; name: string; attributes: Record<string, string>; status: string }[],
		attrEntries: [string, string[]][]
	) {
		type G = { label: string; attrs: Record<string, string>; available: number; total: number; items: typeof items };
		if (items.length === 0) return [] as G[];
		if (attrEntries.length === 0)
			return [{ label: '', attrs: {}, available: items.filter(i => i.status === 'available').length, total: items.length, items }];
		const map = new Map<string, G>();
		for (const item of items) {
			const label = attrEntries.map(([k]) => item.attributes[k]).filter(v => v?.trim()).join(' · ');
			const attrs = Object.fromEntries(attrEntries.map(([k]) => [k, item.attributes[k] ?? ''])) as Record<string, string>;
			if (!map.has(label)) map.set(label, { label, attrs, available: 0, total: 0, items: [] });
			const g = map.get(label)!;
			g.total++;
			g.items.push(item);
			if (item.status === 'available') g.available++;
		}
		return Array.from(map.values());
	}

	const cols = $derived([
		...participants.map(p => ({ id: p.id as string | null, label: p.name, isParticipant: true })),
		{ id: null as string | null, label: participants.length > 0 ? 'Sin asignar' : 'Reserva', isParticipant: false }
	]);

	const allocsByParticipant = $derived(byParticipant());

	// reassign: inline item selector per allocation
	let reassigningAllocId = $state<string | null>(null);
</script>

{#if booking.allocations.length > 0 || serviceInventoryLinks.length > 0}
<div class="rounded-(--radius-card) overflow-hidden border border-orange-100 bg-white">

	<!-- Header -->
	<div class="flex items-center justify-between bg-orange-50 px-4 py-2.5">
		<span class="text-xs font-semibold uppercase tracking-wide text-orange-700">🎒 Equipamiento</span>
		{#if booking.status !== 'cancelled' && serviceInventoryLinks.length > 0}
			<button type="button" onclick={() => openAdd(null)}
				class="text-xs text-orange-600 hover:underline">+ Asignar</button>
		{/if}
	</div>

	<!-- Missing types banner -->
	{#if missingLinks.length > 0 && booking.status !== 'cancelled'}
		<div class="border-b border-amber-100 bg-amber-50/70 px-4 py-2.5 space-y-1">
			{#each missingLinks as link}
				<div class="flex items-center gap-2">
					<span class="text-xs text-amber-700">⚠ <strong>{link.itemType.name}</strong> pendiente de asignar</span>
					<button type="button" onclick={() => { openAdd(participants[0]?.id ?? null); addAllocTypeId = link.itemTypeId; }}
						class="ml-auto rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-semibold text-amber-700 hover:bg-amber-200">
						Asignar
					</button>
				</div>
			{/each}
		</div>
	{/if}

	<!-- Participant columns (horizontal scroll on mobile) -->
	<div class="flex gap-3 overflow-x-auto p-4">
		{#each cols as col (col.id ?? '__booking__')}
			{@const colAllocs = allocsByParticipant.get(col.id) ?? []}
			{@const isAddingHere = addingFor !== undefined && addingFor === col.id}

			<div class="w-44 shrink-0 md:w-52">
				<!-- Column header -->
				<div class="mb-2 flex items-center justify-between">
					<span class="truncate text-[11px] font-bold uppercase tracking-wide
						{col.isParticipant ? 'text-blue-700' : 'text-gray-400'}">
						{col.label}
					</span>
					{#if booking.status !== 'cancelled' && !isAddingHere}
						<button type="button" onclick={() => openAdd(col.id)}
							class="shrink-0 text-[10px] text-orange-500 hover:underline">+</button>
					{/if}
				</div>

				<!-- Allocated items -->
				<div class="mb-2 flex flex-col gap-1.5">
					{#each colAllocs as alloc (alloc.id)}
						<div class="group relative rounded-lg border border-gray-100 bg-gray-50 px-2.5 py-2">
							<p class="text-xs font-semibold text-gray-800 leading-tight">
								{alloc.itemTypeName}
							</p>
							{#if alloc.itemId === null}
								<p class="mt-0.5 text-[10px] text-amber-600">⚠ sin item específico</p>
							{:else if alloc.itemName}
								<p class="mt-0.5 text-[10px] text-gray-500">{alloc.itemName}</p>
							{:else if alloc.attributeFilter && Object.keys(alloc.attributeFilter).length > 0}
								<p class="mt-0.5 text-[10px] text-gray-500">
									{Object.values(alloc.attributeFilter).join(' · ')}
								</p>
							{/if}
							{#if alloc.quantity > 1}
								<span class="text-[10px] text-muted">×{alloc.quantity}</span>
							{/if}

							<!-- Hover actions -->
							{#if booking.status !== 'cancelled'}
								<div class="absolute right-1.5 top-1.5 hidden gap-1 group-hover:flex">
									<!-- Reassign item -->
									<button type="button"
										onclick={() => reassigningAllocId = reassigningAllocId === alloc.id ? null : alloc.id}
										class="rounded bg-white px-1.5 py-0.5 text-[9px] text-gray-500 shadow-sm ring-1 ring-gray-200 hover:text-orange-600">
										✎
									</button>
									<!-- Remove -->
									<form method="POST" action="?/removeAlloc" use:enhance={withToast()}>
										<input type="hidden" name="allocId" value={alloc.id} />
										<button type="submit"
											onclick={(e) => { if (!confirm('¿Eliminar?')) e.preventDefault(); }}
											class="rounded bg-white px-1.5 py-0.5 text-[9px] text-gray-400 shadow-sm ring-1 ring-gray-200 hover:text-red-500">
											✕
										</button>
									</form>
								</div>
							{/if}

							<!-- Inline reassign item selector -->
							{#if reassigningAllocId === alloc.id}
								<form method="POST" action="?/reassignAllocItem" use:enhance={withToast(() => { reassigningAllocId = null; })}
									class="mt-2 border-t border-gray-100 pt-2">
									<input type="hidden" name="allocId" value={alloc.id} />
									<select name="itemId" class="mb-1.5 w-full rounded border border-border px-2 py-1 text-xs focus:border-orange-400 focus:outline-none">
										<option value="">— sin item específico —</option>
										{#each (itemsByAllocType[alloc.itemTypeId] ?? []) as item}
											<option value={item.id} selected={alloc.itemId === item.id}>{item.name}</option>
										{/each}
									</select>
									<div class="flex gap-1.5">
										<button type="submit" class="rounded bg-orange-500 px-2 py-0.5 text-[10px] font-semibold text-white hover:bg-orange-600">Guardar</button>
										<button type="button" onclick={() => reassigningAllocId = null} class="text-[10px] text-muted">Cancelar</button>
									</div>
								</form>
							{/if}
						</div>
					{/each}
					{#if colAllocs.length === 0 && !isAddingHere}
						<div class="rounded-lg border border-dashed border-gray-200 px-2.5 py-4 text-center text-[10px] text-gray-300">
							sin equipo
						</div>
					{/if}
				</div>

				<!-- Add form (inline in column) -->
				{#if isAddingHere}
					{@const addLink = serviceInventoryLinks.find(l => l.itemTypeId === addAllocTypeId)}
					{@const addAttrEntries = Object.entries(addLink?.itemType.attributeSchema ?? {})}
					{@const addGroups = groupInventoryItems(itemsByAllocType[addAllocTypeId] ?? [], addAttrEntries)}
					{@const addSelectedGroup = addGroups.find(g => g.label === addAllocSelectedGroup) ?? null}
					{@const availCount = (addSelectedGroup ? addSelectedGroup.items : (itemsByAllocType[addAllocTypeId] ?? [])).filter(i => i.status === 'available').length}

					<form method="POST" action="?/addAlloc"
						use:enhance={withToast(() => closeAdd())}
						class="rounded-lg border border-orange-200 bg-orange-50/60 p-2.5 space-y-2">

						<!-- Pass participant id -->
						{#if col.id}
							<input type="hidden" name="bookingParticipantId" value={col.id} />
						{/if}

						<!-- Type selector -->
						{#if serviceInventoryLinks.length > 1}
							<select name="itemTypeId" bind:value={addAllocTypeId}
								onchange={() => { addAllocSelectedGroup = null; addAllocQty = 1; addFuzzy = false; }}
								class="w-full rounded border border-orange-200 bg-white px-2 py-1 text-xs focus:border-orange-400 focus:outline-none">
								{#each serviceInventoryLinks as link}
									<option value={link.itemTypeId}>{link.itemType.name}</option>
								{/each}
							</select>
						{:else}
							<input type="hidden" name="itemTypeId" value={addAllocTypeId} />
							<p class="text-[10px] font-semibold text-orange-700">{addLink?.itemType.name}</p>
						{/if}

						<!-- Variant chips -->
						{#if addAttrEntries.length > 0}
							<div class="flex flex-wrap gap-1">
								{#each addGroups as group}
									{@const isSelected = addAllocSelectedGroup === group.label && !addFuzzy}
									<button type="button"
										onclick={() => { addAllocSelectedGroup = isSelected ? null : group.label; addAllocQty = 1; addFuzzy = false; }}
										class="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors
											{group.available === 0 ? 'opacity-40' : ''}
											{isSelected ? 'border-orange-400 bg-orange-100 text-orange-700' : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'}">
										{group.label || '—'}
										<span class="text-emerald-600">{group.available}</span>
									</button>
								{/each}
								<button type="button"
									onclick={() => { addFuzzy = !addFuzzy; addAllocSelectedGroup = null; addAllocQty = 1; }}
									class="rounded-full border px-2 py-0.5 text-[10px] transition-colors
										{addFuzzy ? 'border-amber-300 bg-amber-50 text-amber-700' : 'border-dashed border-gray-200 text-gray-400 hover:border-gray-300'}">
									sin variante
								</button>
							</div>
							{#if addSelectedGroup && !addFuzzy}
								{#each Object.entries(addSelectedGroup.attrs) as [key, val]}
									{#if val}<input type="hidden" name="attrKey" value={key} /><input type="hidden" name="attrVal" value={val} />{/if}
								{/each}
							{/if}
							{#if addFuzzy}<input type="hidden" name="fuzzy" value="true" />{/if}
						{/if}

						<!-- Qty + submit -->
						{#if !addAttrEntries.length || addSelectedGroup || addFuzzy}
							<div class="flex items-center gap-2">
								<button type="button" onclick={() => addAllocQty = Math.max(1, addAllocQty - 1)}
									class="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs hover:bg-gray-100">−</button>
								<span class="w-5 text-center text-sm font-bold">{addAllocQty}</span>
								<button type="button" onclick={() => addAllocQty = Math.min(addFuzzy ? 99 : availCount, addAllocQty + 1)}
									class="flex h-6 w-6 items-center justify-center rounded-full border border-gray-300 text-xs hover:bg-gray-100">+</button>
								{#if !addFuzzy && availCount === 0}
									<span class="text-[10px] text-red-500">sin stock</span>
								{:else if addFuzzy}
									<span class="text-[10px] text-amber-600">pendiente</span>
								{:else}
									<span class="text-[10px] text-muted">{availCount} disp.</span>
								{/if}
							</div>
							<input type="hidden" name="quantity" value={addAllocQty} />
							<div class="flex gap-1.5">
								<button type="submit"
									disabled={addAllocQty < 1 || (availCount === 0 && !addFuzzy)}
									class="rounded bg-orange-500 px-2.5 py-1 text-[10px] font-semibold text-white hover:bg-orange-600 disabled:opacity-40">
									Añadir
								</button>
								<button type="button" onclick={closeAdd} class="text-[10px] text-muted hover:text-gray-700">Cancelar</button>
							</div>
						{/if}
					</form>
				{/if}
			</div>
		{/each}
	</div>
</div>
{/if}
