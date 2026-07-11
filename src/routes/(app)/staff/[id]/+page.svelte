<script lang="ts">
	import { enhance } from '$app/forms';
	import { resolve } from '$app/paths';
	import type { PageData, ActionData } from './$types';
	import * as m from '$lib/paraglide/messages';
	import StatusBadge from '$lib/components/ui/StatusBadge.svelte';
	let { data, form }: { data: PageData; form: ActionData } = $props();

	const ALL_ROLES = ['admin', 'owner', 'manager', 'instructor'] as const;
	const ROLE_LABELS = $derived<Record<string, string>>({
		admin: m.staff_new_role_admin(),
		owner: m.staff_new_role_owner(),
		manager: m.staff_new_role_manager(),
		instructor: m.staff_new_role_instructor()
	});
	const ROLE_DESC = $derived<Record<string, string>>({
		admin: m.staff_new_role_admin_desc(),
		owner: m.staff_new_role_owner_desc(),
		manager: m.staff_new_role_manager_desc(),
		instructor: m.staff_new_role_instructor_desc()
	});

	const currentRoles = $derived(
		(data.member.roles?.length ? data.member.roles : data.member.role ? [data.member.role] : []) as string[]
	);
	const visibleRoles = $derived(
		data.isAdmin ? ALL_ROLES : ALL_ROLES.filter(r => r !== 'admin')
	);
</script>

<div class="mx-auto max-w-lg p-4 md:p-6">
	<div class="mb-6 flex items-center gap-3">
		<a href={resolve('/staff')} class="text-sm text-muted hover:text-navy">← Staff</a>
		<h1 class="text-xl font-bold text-navy">{data.member.name}</h1>
	</div>

	{#if form?.error}
		<p class="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{form.error}</p>
	{/if}

	<!-- Account info -->
	<section class="mb-4 rounded-(--radius-card) bg-surface p-5 ring-1 ring-border">
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{m.staff_detail_account()}</h2>
		<p class="text-sm text-gray-700">{data.member.email}</p>
		{#if data.member.banned}
			<p class="mt-1 text-xs font-medium text-red-600">{m.staff_detail_account_banned()}</p>
		{/if}
		{#if !data.canManageMember}
			<p class="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs text-blue-700">
				Vista de perfil. La gestión de cuenta, permisos y contraseña queda reservada a administración.
			</p>
		{/if}
	</section>

	<!-- Roles -->
	<section class="mb-4 rounded-(--radius-card) bg-surface p-5 ring-1 ring-border">
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{m.staff_detail_roles()}</h2>
		{#if data.canManageMember}
			<p class="mb-3 text-xs text-muted">{m.staff_detail_roles_hint()}</p>
			<form method="POST" action="?/updateRole" use:enhance class="space-y-2">
				{#each visibleRoles as r (r)}
					<label class="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 ring-1 ring-border hover:bg-sand">
						<input
							type="checkbox"
							name="roles"
							value={r}
							checked={currentRoles.includes(r)}
							class="h-4 w-4 rounded border-gray-300 text-ocean"
						/>
						<span class="flex-1">
							<span class="text-sm font-medium text-gray-800">{ROLE_LABELS[r]}</span>
							<span class="ml-2 text-xs text-muted">{ROLE_DESC[r]}</span>
						</span>
					</label>
				{/each}
				<div class="pt-2">
					<button type="submit" class="btn-primary btn-sm">{m.staff_detail_save_roles()}</button>
				</div>
			</form>
		{:else}
			<div class="flex flex-wrap gap-1.5">
				{#each currentRoles as r (r)}
					<StatusBadge variant={r} />
				{/each}
			</div>
		{/if}
	</section>

	<!-- Profile (phone/bio/active) -->
	<section class="mb-4 rounded-(--radius-card) bg-surface p-5 ring-1 ring-border">
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{m.staff_detail_profile()}</h2>
		{#if data.canManageMember}
			<form method="POST" action="?/updateProfile" use:enhance={() => async ({ update }) => update({ reset: false })} class="space-y-4">
				<div>
					<label for="phone" class="mb-1 block text-sm font-medium text-gray-700">{m.common_phone()}</label>
					<input id="phone" name="phone" type="tel" value={data.member.phone ?? ''} class="input w-full" placeholder="+34 600 000 000" />
				</div>
				<div>
					<label for="bio" class="mb-1 block text-sm font-medium text-gray-700">{m.staff_detail_bio()}</label>
					<textarea id="bio" name="bio" rows="3" class="input w-full resize-none">{data.member.bio ?? ''}</textarea>
				</div>
				<div class="flex items-center gap-3">
					<label class="flex cursor-pointer items-center gap-2">
						<input type="hidden" name="active" value="false" />
						<input
							type="checkbox"
							name="active"
							value="true"
							checked={data.member.active ?? true}
							class="h-4 w-4 rounded border-gray-300 text-ocean"
						/>
						<span class="text-sm font-medium text-gray-700">{m.staff_detail_active()}</span>
					</label>
				</div>
				<button type="submit" class="btn-primary btn-sm">{m.staff_detail_save_profile()}</button>
			</form>
		{:else}
			<dl class="space-y-3 text-sm">
				<div>
					<dt class="text-xs text-muted">{m.common_phone()}</dt>
					<dd class="mt-0.5 text-gray-800">{data.member.phone ?? '—'}</dd>
				</div>
				<div>
					<dt class="text-xs text-muted">{m.staff_detail_bio()}</dt>
					<dd class="mt-0.5 whitespace-pre-wrap text-gray-800">{data.member.bio ?? '—'}</dd>
				</div>
				<div class="flex items-center justify-between">
					<dt class="text-xs text-muted">{m.staff_detail_active()}</dt>
					<dd><StatusBadge variant={data.member.active ?? true ? 'active' : 'banned'} label={data.member.active ?? true ? 'activo' : 'inactivo'} /></dd>
				</div>
			</dl>
		{/if}
	</section>

	<!-- Access -->
	{#if data.canManageMember}
	<section class="mb-4 rounded-(--radius-card) bg-surface p-5 ring-1 ring-border">
		<h2 class="mb-3 text-xs font-semibold uppercase tracking-wider text-muted">{m.staff_detail_access()}</h2>
		<div class="space-y-3">
			<form method="POST" action="?/toggleBan" use:enhance>
				<button
					type="submit"
					class="{data.member.banned ? 'btn-primary' : 'btn-danger'} btn-sm"
					onclick={(e) => { if (!confirm(data.member.banned ? m.staff_detail_confirm_restore() : m.staff_detail_confirm_ban())) e.preventDefault(); }}
				>
					{data.member.banned ? m.staff_detail_restore_access() : m.staff_detail_ban()}
				</button>
			</form>
		</div>
	</section>
	{/if}

	<!-- Password reset -->
	{#if data.canManageMember}
	<section class="mb-4 rounded-(--radius-card) bg-surface p-5 ring-1 ring-border">
		<h2 class="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">Contraseña</h2>
		<p class="mb-3 text-xs text-muted">Genera una nueva contraseña temporal para este usuario.</p>
		{#if form?.resetPassword}
			<div class="mb-3 rounded-lg border border-green-200 bg-green-50 p-3">
				<p class="mb-1.5 text-xs font-semibold text-green-700">Nueva contraseña temporal generada:</p>
				<code class="block rounded bg-white px-2 py-1.5 font-mono text-sm text-gray-900">{form.resetPassword}</code>
				<p class="mt-1.5 text-xs text-green-600">Compártela con el usuario para que pueda acceder.</p>
			</div>
		{/if}
		{#if form?.resetError}
			<p class="mb-3 text-sm text-red-600">{form.resetError}</p>
		{/if}
		<form method="POST" action="?/resetPassword" use:enhance>
			<button type="submit" class="btn-secondary btn-sm"
				onclick={(e) => { if (!confirm('¿Generar nueva contraseña temporal para este usuario?')) e.preventDefault(); }}>
				Resetear contraseña
			</button>
		</form>
	</section>
	{/if}

	<!-- Danger zone (admin only) -->
	{#if data.isAdmin}
	<section class="rounded-(--radius-card) border border-red-200 bg-red-50/50 p-5">
		<h2 class="mb-1 text-xs font-semibold uppercase tracking-wider text-red-600">Zona peligrosa</h2>
		<p class="mb-3 text-xs text-red-500">Eliminar el usuario es irreversible. Solo los admins pueden hacer esto.</p>
		{#if form?.error && form?.deleted === undefined}
			<p class="mb-3 text-sm text-red-600">{form.error}</p>
		{/if}
		<form method="POST" action="?/deleteUser" use:enhance={() => async ({ result, update }) => {
			if (result.type === 'success') {
				const deleteData = result.data as { deleted?: boolean } | undefined;
				if (deleteData?.deleted) {
					window.location.href = resolve('/staff');
					return;
				}
			}
			await update();
		}}>
			<button type="submit" class="btn-destructive btn-sm"
				onclick={(e) => { if (!confirm('¿Eliminar este usuario permanentemente? Esta acción no se puede deshacer.')) e.preventDefault(); }}>
				Eliminar usuario
			</button>
		</form>
	</section>
	{/if}
</div>
