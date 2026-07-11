<!-- src/lib/components/sessions/SessionTimelineRow.svelte -->
<script lang="ts">
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';

	let {
		sessionId,
		date,
		serviceName,
		instructorName,
		status
	}: {
		sessionId: string;
		date: string;
		serviceName: string | null;
		instructorName?: string | null;
		status: string;
	} = $props();

	function fmtDate(d: string) {
		return new Date(d + 'T12:00:00').toLocaleDateString('es-ES', {
			day: 'numeric',
			month: 'short',
			year: 'numeric'
		});
	}
</script>

<a
	href="/sessions/{sessionId}"
	class="flex items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-gray-50"
>
	<span class="w-[72px] shrink-0 text-xs text-muted">{fmtDate(date)}</span>
	<div class="min-w-0 flex-1">
		<p class="truncate text-sm text-gray-800">{serviceName ?? '—'}</p>
		{#if instructorName}
			<p class="text-xs text-muted">{instructorName}</p>
		{/if}
	</div>
	<StatusBadge variant={status} class="shrink-0" />
</a>
