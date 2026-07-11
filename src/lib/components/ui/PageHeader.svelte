<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		subtitle,
		backHref,
		count,
		actionHref,
		actionLabel = 'Nuevo',
		colorDotClass,
		children
	}: {
		title: string;
		subtitle?: string;
		backHref?: string;
		count?: number | string;
		actionHref?: string;
		actionLabel?: string;
		colorDotClass?: string;
		children?: Snippet;
	} = $props();
</script>

<div class="shrink-0 border-b border-border bg-surface/80 backdrop-blur-sm">
	<div class="flex items-center gap-2 px-4 py-3 sm:px-6">
		{#if backHref}
			<a href={backHref} class="shrink-0 text-sm text-muted transition-colors hover:text-navy">←</a>
		{/if}
		<div class="flex min-w-0 flex-1 items-center gap-2">
			{#if colorDotClass}
				<div class="h-2.5 w-2.5 shrink-0 rounded-full {colorDotClass}"></div>
			{/if}
			<h1 class="truncate text-lg font-bold text-navy">{title}</h1>
			{#if subtitle}
				<span class="shrink-0 text-xs text-muted">{subtitle}</span>
			{/if}
		</div>
		<div class="flex shrink-0 items-center gap-3">
			{#if count != null}
				<span class="text-xs text-muted">{count}</span>
			{/if}
			{#if actionHref}
				<a href={actionHref} class="btn-primary btn-sm">{actionLabel}</a>
			{/if}
		</div>
	</div>
	{#if children}
		<div class="px-4 pb-3 sm:px-6">
			{@render children()}
		</div>
	{/if}
</div>
