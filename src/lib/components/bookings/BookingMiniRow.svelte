<!-- src/lib/components/bookings/BookingMiniRow.svelte -->
<script lang="ts">
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import { DOT_COLORS } from '$lib/features/services/colors';

	let {
		bookingId,
		serviceName,
		serviceColor,
		date,
		status,
		participantCount,
		amountDue,
		amountPaid
	}: {
		bookingId: string;
		serviceName: string | null;
		serviceColor: string | null;
		date: string;
		status: string;
		participantCount: number;
		amountDue: string;
		amountPaid: string;
	} = $props();

	const dotColor = $derived(DOT_COLORS[serviceColor as keyof typeof DOT_COLORS] ?? DOT_COLORS['ocean']);
	const pending = $derived.by(() => {
		const due = parseFloat(amountDue);
		const paid = parseFloat(amountPaid);
		return isNaN(due) || isNaN(paid) ? 0 : due - paid;
	});
	function fmtDate(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
			day: 'numeric', month: 'short', year: 'numeric'
		});
	}
</script>

<a
	href="/bookings/{bookingId}"
	class="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-gray-50"
>
	<span
		class="h-2.5 w-2.5 shrink-0 rounded-full"
		style="background-color: {dotColor}"
	></span>
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm font-semibold text-gray-900">{serviceName ?? '—'}</p>
		<p class="text-xs text-muted">
			{fmtDate(date)}
			{#if participantCount > 1}· {participantCount} participantes{/if}
		</p>
	</div>
	<div class="flex shrink-0 items-center gap-2">
		{#if pending > 0}
			<span class="text-xs font-semibold text-red-500">€{pending.toFixed(0)} pend.</span>
		{/if}
		<StatusBadge variant={status} />
	</div>
</a>
