<!-- src/lib/components/ui/StatusBadge.svelte -->
<script lang="ts">
	import type { StatusVariant } from './statusBadge';

	const COLORS: Record<StatusVariant, string> = {
		confirmed:    'bg-green-100 text-green-700',
		paid:         'bg-green-100 text-green-700',
		advanced:     'bg-green-100 text-green-700',
		completed:    'bg-green-100 text-green-700',
		attended:     'bg-green-100 text-green-700',
		instructor:   'bg-green-100 text-green-700',
		pending:      'bg-amber-100 text-amber-700',
		partial:      'bg-amber-100 text-amber-700',
		intermediate: 'bg-amber-100 text-amber-700',
		unscheduled:  'bg-amber-100 text-amber-700',
		cancelled:    'bg-red-100 text-red-600',
		missed:       'bg-red-100 text-red-600',
		banned:       'bg-red-100 text-red-600',
		admin:        'bg-red-100 text-red-700',
		active:       'bg-blue-100 text-blue-700',
		scheduled:    'bg-blue-100 text-blue-700',
		beginner:     'bg-blue-100 text-blue-700',
		owner:        'bg-blue-100 text-blue-700',
		pool:         'bg-blue-100 text-blue-700',
		manager:      'bg-purple-100 text-purple-700',
		specific:     'bg-emerald-100 text-emerald-700',
	};

	const DEFAULT_LABELS: Record<StatusVariant, string> = {
		confirmed:    'confirmado',
		pending:      'pendiente',
		cancelled:    'cancelado',
		paid:         'pagado',
		partial:      'parcial',
		active:       'activa',
		scheduled:    'programada',
		completed:    'completada',
		attended:     'asistió',
		missed:       'no asistió',
		unscheduled:  'sin horario',
		beginner:     'principiante',
		intermediate: 'intermedio',
		advanced:     'avanzado',
		admin:        'administrador',
		owner:        'propietario',
		manager:      'gestor',
		instructor:   'instructor',
		banned:       'bloqueado',
		pool:         'piscina',
		specific:     'específico',
	};

	let {
		variant,
		label,
		class: className = ''
	}: {
		variant: StatusVariant | string;
		label?: string;
		class?: string;
	} = $props();

	const colorClass = $derived(COLORS[variant as StatusVariant] ?? 'bg-gray-100 text-gray-500');
	const displayLabel = $derived(label ?? DEFAULT_LABELS[variant as StatusVariant] ?? variant);
</script>

<span class="inline-block rounded-full px-2.5 py-0.5 text-[10px] font-semibold {colorClass} {className}">
	{displayLabel}
</span>
