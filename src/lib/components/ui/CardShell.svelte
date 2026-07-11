<!-- src/lib/components/ui/CardShell.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { IconProps } from 'lucide-svelte';
	import type { SvelteComponent } from 'svelte';

	type LucideIcon = typeof SvelteComponent<IconProps>;

	let {
		label,
		icon: Icon,
		class: className = '',
		children,
		footer
	}: {
		label: string;
		icon?: LucideIcon;
		class?: string;
		children?: Snippet;
		footer?: Snippet;
	} = $props();
</script>

<div class="overflow-hidden rounded-(--radius-card) border border-border bg-white shadow-sm {className}">
	<div class="flex items-center gap-1.5 border-b border-border bg-gray-50/60 px-4 py-2.5">
		{#if Icon}
			<Icon size={12} class="shrink-0 text-muted" />
		{/if}
		<span class="text-[10px] font-bold uppercase tracking-wider text-muted">{label}</span>
	</div>
	<div class="p-4">
		{@render children?.()}
	</div>
	{#if footer}
		<div class="border-t border-border px-4 py-2.5">
			{@render footer?.()}
		</div>
	{/if}
</div>
