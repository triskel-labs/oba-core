import { error, fail } from '@sveltejs/kit';
import { requireRole, hasRole, primaryRole } from '$lib/server/permissions';
import { canManageStaffMember, canViewStaffMember } from '$lib/features/staff/access';
import type { Role } from '$lib/server/permissions';
import { auth } from '$lib/server/auth';
import { db } from '$lib/server/db';
import { user as userTable } from '$lib/server/db/auth.schema';
import { eq } from 'drizzle-orm';
import { generateTempPassword } from '$lib/server/email/sender';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRole(locals, 'admin', 'owner');
	const [member] = await db.select().from(userTable).where(eq(userTable.id, params.id));
	if (!member || !canViewStaffMember(locals, member)) error(404, 'Staff member not found');
	return {
		member,
		isAdmin: hasRole(locals, 'admin'),
		canManageMember: canManageStaffMember(locals, member)
	};
};

export const actions: Actions = {
	updateRole: async ({ request, params, locals }) => {
		requireRole(locals, 'admin');
		const isAdmin = hasRole(locals, 'admin');
		const form = await request.formData();
		const allowedRoles = isAdmin
			? ['admin', 'owner', 'manager', 'instructor']
			: ['owner', 'manager', 'instructor'];
		const selectedRoles = form.getAll('roles')
			.map(r => r.toString())
			.filter(r => allowedRoles.includes(r)) as Role[];
		if (selectedRoles.length === 0) return fail(400, { error: 'At least one role is required' });
		const primary = primaryRole(selectedRoles);
		await db.update(userTable)
			.set({ roles: selectedRoles, role: primary })
			.where(eq(userTable.id, params.id));
		return { success: true };
	},

	updateProfile: async ({ request, params, locals }) => {
		requireRole(locals, 'admin');
		const form = await request.formData();
		const phone = form.get('phone')?.toString().trim() || null;
		const bio = form.get('bio')?.toString().trim() || null;
		const active = form.get('active') === 'true';
		await db.update(userTable)
			.set({ phone, bio, active, updatedAt: new Date() })
			.where(eq(userTable.id, params.id));
		return { success: true };
	},

	toggleBan: async ({ params, locals }) => {
		requireRole(locals, 'admin');
		if (params.id === locals.user?.id) return fail(400, { error: "Can't ban yourself" });
		const [member] = await db.select().from(userTable).where(eq(userTable.id, params.id));
		if (!member) error(404);
		await db.update(userTable).set({ banned: !member.banned }).where(eq(userTable.id, params.id));
		return {};
	},

	resetPassword: async ({ params, locals, request }) => {
		requireRole(locals, 'admin');
		if (params.id === locals.user?.id) return fail(400, { error: "Use settings to change your own password" });
		const newPassword = generateTempPassword();
		try {
			await auth.api.setUserPassword({
				headers: request.headers,
				body: { userId: params.id, newPassword }
			});
		} catch {
			return fail(500, { resetError: 'Failed to reset password' });
		}
		return { resetPassword: newPassword };
	},

	deleteUser: async ({ params, locals, request }) => {
		requireRole(locals, 'admin');
		if (params.id === locals.user?.id) return fail(400, { error: "Can't delete yourself" });
		try {
			await auth.api.removeUser({
				headers: request.headers,
				body: { userId: params.id }
			});
		} catch {
			return fail(500, { error: 'Failed to delete user' });
		}
		return { deleted: true };
	}
};
