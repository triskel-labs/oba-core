<script lang="ts">
	import { enhance } from '$app/forms';
	import ContactButtons from '$lib/components/ContactButtons.svelte';
	import PageHeader from '$lib/components/ui/PageHeader.svelte';
	import CardShell from '$lib/components/ui/CardShell.svelte';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	import BookingMiniRow from '$lib/components/bookings/BookingMiniRow.svelte';
	import SessionTimelineRow from '$lib/components/sessions/SessionTimelineRow.svelte';
	import { User, CreditCard, Calendar, Clock } from 'lucide-svelte';
	import type { ActionData, PageData } from './$types';
	import * as m from '$lib/paraglide/messages';

	let { data, form }: { data: PageData; form: ActionData } = $props();
	let editing = $state(false);
	let loading = $state(false);

	const skillLabels: Record<string, string> = {
		beginner: 'Principiante', intermediate: 'Intermedio', advanced: 'Avanzado'
	};

	const activeBookings = $derived(data.bookings.filter(b => b.status !== 'cancelled'));
	const totalDue = $derived(activeBookings.reduce((s, b) => s + (parseFloat(b.amountDue) || 0), 0));
	const totalPaid = $derived(activeBookings.reduce((s, b) => s + (parseFloat(b.amountPaid) || 0), 0));

	function fmtDate(d: Date) {
		return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<div class="flex flex-1 flex-col overflow-hidden">
	<PageHeader
		title="{data.client.firstName} {data.client.lastName}"
		backHref="/clients"
		subtitle={data.client.skillLevel ? (skillLabels[data.client.skillLevel] ?? data.client.skillLevel) : undefined}
	>
		{#snippet children()}
			<div class="flex items-center gap-2">
				<button onclick={() => (editing = !editing)} class="btn-secondary btn-sm">
					{editing ? m.common_cancel() : m.common_edit()}
				</button>
				<form
					method="post"
					action="?/delete"
					use:enhance
					onsubmit={(e) => { if (!confirm(`Eliminar ${data.client.firstName} ${data.client.lastName}? No se puede deshacer.`)) e.preventDefault(); }}
				>
					<button type="submit" class="btn-destructive btn-sm">{m.common_delete()}</button>
				</form>
			</div>
		{/snippet}
	</PageHeader>

	<div class="flex-1 overflow-y-auto p-4 md:p-6">
		{#if editing}
			<!-- Edit form (full-width when open) -->
			<form
				method="post"
				action="?/update"
				class="mb-6 space-y-4 rounded-xl border border-gray-200 bg-white p-4"
				use:enhance={() => {
					loading = true;
					return async ({ update }) => {
						loading = false;
						editing = false;
						update();
					};
				}}
			>
				<div class="grid grid-cols-2 gap-3">
					<div>
						<label class="label">{m.client_new_first_name()}</label>
						<input name="firstName" required value={data.client.firstName} class="input" />
					</div>
					<div>
						<label class="label">{m.client_new_last_name()}</label>
						<input name="lastName" required value={data.client.lastName} class="input" />
					</div>
				</div>
				<div>
					<label class="label">{m.common_phone()}</label>
					<input name="phone" type="tel" value={data.client.phone ?? ''} class="input" />
				</div>
				<div>
					<label class="label">{m.common_email()}</label>
					<input name="email" type="email" value={data.client.email ?? ''} class="input" />
				</div>
				<div>
					<label class="label">{m.client_new_nationality()}</label>
					<input name="nationality" value={data.client.nationality ?? ''} class="input" />
				</div>
				<div>
					<label class="label">{m.client_new_skill_level()}</label>
					<select name="skillLevel" class="input">
						<option value="">{m.client_new_skill_not_set()}</option>
						{#each ['beginner', 'intermediate', 'advanced'] as level}
							<option value={level} selected={data.client.skillLevel === level}>{skillLabels[level]}</option>
						{/each}
					</select>
				</div>
				<div>
					<label class="label">{m.common_notes()}</label>
					<textarea name="notes" rows="2" class="input">{data.client.notes ?? ''}</textarea>
				</div>
				{#if form?.error}
					<p class="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{form.error}</p>
				{/if}
				<button type="submit" disabled={loading} class="btn-primary btn-block">
					{loading ? m.common_saving() : m.common_save_changes()}
				</button>
			</form>
		{:else}
			<!-- Sidebar + main grid -->
			<div class="grid grid-cols-1 gap-4 md:grid-cols-[240px_1fr]">

				<!-- SIDEBAR -->
				<div class="space-y-4">
					<!-- Client info -->
					<CardShell label="Cliente" icon={User}>
						<div class="space-y-3">
							<ContactButtons phone={data.client.phone} email={data.client.email} />
							{#if data.client.phone || data.client.email || data.client.nationality || data.client.skillLevel || data.client.notes}
								<dl class="space-y-1.5 text-sm">
									{#if data.client.phone}
										<dd class="text-gray-700">{data.client.phone}</dd>
									{/if}
									{#if data.client.email}
										<dd class="truncate text-gray-700">{data.client.email}</dd>
									{/if}
									{#if data.client.nationality}
										<dd class="text-xs text-muted">{data.client.nationality}</dd>
									{/if}
									{#if data.client.skillLevel}
										<dd><StatusBadge variant={data.client.skillLevel} /></dd>
									{/if}
									{#if data.client.notes}
										<dd class="mt-1 text-xs italic text-muted">{data.client.notes}</dd>
									{/if}
								</dl>
							{/if}
							<p class="text-[10px] text-muted">
								Cliente desde {fmtDate(data.client.createdAt)}
							</p>
						</div>
					</CardShell>

					<!-- Payment overview (only if active bookings with amounts) -->
					{#if activeBookings.length > 0 && totalDue > 0}
						<CardShell label="Pagos" icon={CreditCard}>
							<dl class="space-y-2 text-sm">
								<div class="flex items-center justify-between">
									<dt class="text-xs text-muted">Total</dt>
									<dd class="font-semibold text-gray-900">€{totalDue.toFixed(0)}</dd>
								</div>
								<div class="flex items-center justify-between">
									<dt class="text-xs text-muted">Cobrado</dt>
									<dd class="text-green-700">€{totalPaid.toFixed(0)}</dd>
								</div>
								{#if totalDue - totalPaid > 0}
									<div class="flex items-center justify-between border-t border-border pt-2">
										<dt class="text-xs font-semibold text-red-600">Pendiente</dt>
										<dd class="font-bold text-red-600">€{(totalDue - totalPaid).toFixed(0)}</dd>
									</div>
								{/if}
							</dl>
						</CardShell>
					{/if}
				</div>

				<!-- MAIN -->
				<div class="space-y-4">
					<!-- Active bookings -->
					<CardShell label="Reservas · {data.bookings.length}" icon={Calendar}>
						{#snippet footer()}
							<a href="/bookings/new?clientId={data.client.id}"
								class="text-xs font-medium text-ocean hover:underline">+ Nueva reserva</a>
						{/snippet}

						{#if data.bookings.length === 0}
							<p class="text-sm text-muted">{m.client_detail_no_bookings()}</p>
						{:else}
							<div class="space-y-0.5">
								{#each data.bookings as booking}
									<BookingMiniRow
										bookingId={booking.id}
										serviceName={booking.serviceName}
										serviceColor={booking.serviceColor}
										date={booking.date}
										status={booking.status}
										participantCount={booking.participantCount}
										amountDue={booking.amountDue}
										amountPaid={booking.amountPaid}
									/>
								{/each}
							</div>
						{/if}
					</CardShell>

					<!-- Session history -->
					<CardShell label="Historial · {data.sessions.length}" icon={Clock}>
						{#if data.sessions.length === 0}
							<p class="text-sm text-muted">Sin sesiones registradas.</p>
						{:else}
							<div class="space-y-0.5">
								{#each data.sessions as session}
									<SessionTimelineRow
										sessionId={session.sessionId}
										date={session.date}
										serviceName={session.serviceName}
										status={session.status}
									/>
								{/each}
							</div>
						{/if}
					</CardShell>
				</div>

			</div>
		{/if}
	</div>
</div>
