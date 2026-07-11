<!-- src/lib/components/bookings/EnrollmentGroup.svelte -->
<script lang="ts">
	import { enhance } from '$app/forms';
	import { withToast } from '$lib/utils/enhance';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import type { StatusVariant } from '$lib/components/ui/statusBadge';

	let {
		clientName,
		bookingId,
		bookingClientId = '',
		participants,
		paymentStatus,
		amountPaid,
		amountDue,
		canEdit = false,
		bulkAdd = false,
		syncToSessions = false,
		renameAction = '',
		removeAction = '',
		addAction = '',
		impactAction = ''
	}: {
		clientName: string;
		bookingId: string;
		bookingClientId?: string;
		participants: { id: string; name: string }[];
		paymentStatus?: string;
		amountPaid?: string;
		amountDue?: string;
		canEdit?: boolean;
		bulkAdd?: boolean;
		syncToSessions?: boolean;
		renameAction?: string;
		removeAction?: string;
		addAction?: string;
		impactAction?: string;
	} = $props();

	// Warn at dev time when canEdit=true but actions are missing
	if (canEdit && (!renameAction || !removeAction || !addAction)) {
		console.warn('EnrollmentGroup: canEdit=true requires renameAction, removeAction, and addAction');
	}

	// CRUD state (only used when canEdit=true)
	let editingId = $state<string | null>(null);
	let editingName = $state('');
	let removingId = $state<string | null>(null);
	let impact = $state<{ sessionCount: number; allocationCount: number } | null>(null);
	let impactError = $state(false);
	let addOpen = $state(false);
	let addValue = $state('');

	function startEdit(p: { id: string; name: string }) {
		editingId = p.id;
		editingName = p.name;
		removingId = null;
		addOpen = false;
	}

	async function startRemove(id: string) {
		removingId = id;
		editingId = null;
		impact = null;
		impactError = false;
		if (impactAction) {
			try {
				const fd = new FormData();
				fd.set('participantId', id);
				const res = await fetch(impactAction, { method: 'POST', body: fd });
				const json = await res.json();
				impact = json?.data?.impact ?? null;
			} catch {
				impactError = true;
			}
		}
	}

	function cancel() {
		editingId = null;
		removingId = null;
		impact = null;
		impactError = false;
		addOpen = false;
		addValue = '';
	}

	const pendingAmount = $derived(
		amountDue && amountPaid
			? parseFloat(amountDue) - parseFloat(amountPaid)
			: null
	);
	const derivedPaymentVariant = $derived(
		paymentStatus === 'paid' ? 'paid'
		: paymentStatus === 'partial' ? 'partial'
		: pendingAmount != null ? 'pending'
		: undefined
	);
</script>

<div class="overflow-hidden rounded-lg border border-blue-100">
	<!-- Group header: client name + payment badge + booking link -->
	<div class="flex items-center justify-between gap-2 bg-blue-50/60 px-3 py-2">
		<div class="flex items-center gap-2 min-w-0">
			<span class="truncate text-[11px] font-bold text-navy">{clientName}</span>
			{#if derivedPaymentVariant}
				<StatusBadge variant={derivedPaymentVariant as StatusVariant} />
			{/if}
		</div>
		<a
			href="/bookings/{bookingId}"
			class="shrink-0 text-[10px] font-medium text-ocean hover:underline"
		>
			ver reserva →
		</a>
	</div>

	<!-- Participant rows -->
	<div class="space-y-1 p-2">
		{#each participants as p (p.id)}
			{#if canEdit && editingId === p.id}
				<form
					method="POST"
					action={renameAction}
					use:enhance={withToast(() => { editingId = null; })}
					class="flex items-center gap-1.5 rounded-lg border border-blue-200 bg-blue-50 px-2 py-1.5"
				>
					<input type="hidden" name="participantId" value={p.id} />
					<input
						name="name"
						type="text"
						bind:value={editingName}
						autofocus
						class="flex-1 rounded border border-border px-2 py-0.5 text-xs focus:border-ocean focus:outline-none"
					/>
					<button type="submit" class="text-[10px] font-semibold text-ocean">✓</button>
					<button type="button" onclick={cancel} class="text-[10px] text-muted">✕</button>
				</form>
			{:else if canEdit && removingId === p.id}
				<div class="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
					<p class="mb-1 text-[10px] font-semibold text-red-700">{p.name}</p>
					{#if impact}
						<p class="mb-2 rounded bg-amber-50 px-2 py-1 text-[9px] text-amber-700">
							⚠ Se eliminará de {impact.sessionCount} sesión{impact.sessionCount !== 1 ? 'es' : ''}
							{impact.allocationCount > 0 ? ` · equipo desasignado (${impact.allocationCount})` : ''}
						</p>
					{:else if impactError}
						<p class="mb-2 rounded bg-red-50 px-2 py-1 text-[9px] text-red-600">
							No se pudo calcular el impacto. Procede con precaución.
						</p>
					{:else if impactAction}
						<p class="mb-2 text-[9px] text-muted">Calculando impacto…</p>
					{/if}
					<div class="flex gap-2">
						<form
							method="POST"
							action={removeAction}
							use:enhance={withToast(() => { removingId = null; impact = null; impactError = false; })}
						>
							<input type="hidden" name="participantId" value={p.id} />
							<input type="hidden" name="bookingClientId" value={bookingClientId} />
							<button type="submit" class="text-[10px] font-semibold text-red-600 hover:underline">
								Confirmar eliminar
							</button>
						</form>
						<button type="button" onclick={cancel} class="text-[10px] text-muted hover:text-gray-700">
							Cancelar
						</button>
					</div>
				</div>
			{:else}
				<div class="group flex items-center gap-2 rounded-lg px-2.5 py-1.5 hover:bg-gray-50">
					<span class="flex-1 text-xs font-medium text-gray-800">{p.name}</span>
					{#if canEdit}
						<button
							type="button"
							onclick={() => startEdit(p)}
							class="text-[10px] text-muted opacity-0 transition-opacity hover:text-ocean group-hover:opacity-100"
						>✎</button>
						<button
							type="button"
							onclick={() => startRemove(p.id)}
							class="text-[10px] text-red-400 opacity-0 transition-opacity hover:text-red-600 group-hover:opacity-100"
						>✕</button>
					{/if}
				</div>
			{/if}
		{/each}

		{#if participants.length === 0}
			<p class="px-2.5 py-1 text-xs italic text-muted">Sin participantes.</p>
		{/if}

		{#if canEdit}
			{#if addOpen}
				<form
					method="POST"
					action={addAction}
					use:enhance={withToast(() => { addOpen = false; addValue = ''; })}
					class="rounded-lg border border-dashed border-blue-300 bg-blue-50 p-2.5"
				>
					<input type="hidden" name="bookingClientId" value={bookingClientId} />
					{#if syncToSessions}
						<input type="hidden" name="syncToSessions" value="true" />
					{/if}
					{#if bulkAdd}
						<p class="mb-1 text-[9px] font-bold text-blue-700">Un nombre por línea</p>
						<textarea
							name="names"
							bind:value={addValue}
							rows="3"
							placeholder={"Emma\nLeon\nSofia"}
							class="w-full resize-none rounded border border-blue-200 bg-white px-2 py-1.5 text-xs focus:border-ocean focus:outline-none"
						></textarea>
					{:else}
						<input
							name="name"
							type="text"
							bind:value={addValue}
							placeholder="Nombre del participante"
							autofocus
							class="w-full rounded border border-blue-200 bg-white px-2 py-1.5 text-xs focus:border-ocean focus:outline-none"
						/>
					{/if}
					<div class="mt-2 flex justify-end gap-2">
						<button type="button" onclick={cancel} class="text-[10px] text-muted">Cancelar</button>
						<button type="submit" class="btn-primary btn-sm text-[10px]">Añadir</button>
					</div>
				</form>
			{:else}
				<button
					type="button"
					onclick={() => { addOpen = true; addValue = ''; }}
					class="w-full rounded-lg border border-dashed border-blue-200 py-1.5 text-[10px] font-medium text-blue-600 hover:bg-blue-50"
				>
					+ {bulkAdd ? 'Añadir participante(s)' : 'Añadir participante'}
				</button>
			{/if}
		{/if}
	</div>
</div>
