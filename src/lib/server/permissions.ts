import { redirect } from '@sveltejs/kit';

export type Role = 'admin' | 'owner' | 'manager' | 'instructor';

const ROLE_PRIORITY: Record<Role, number> = { admin: 4, owner: 3, manager: 2, instructor: 1 };
const VALID_ROLES = new Set<string>(['admin', 'owner', 'manager', 'instructor']);

export function userRoles(locals: App.Locals): Role[] {
	const arr = locals.user?.roles;
	if (arr && arr.length > 0) return arr.filter((r) => VALID_ROLES.has(r)) as Role[];
	const single = locals.user?.role;
	return single && VALID_ROLES.has(single) ? [single as Role] : [];
}

export function hasRole(locals: App.Locals, ...roles: Role[]): boolean {
	const list = userRoles(locals);
	return roles.some((r) => list.includes(r));
}

export function requireRole(locals: App.Locals, ...roles: Role[]): void {
	if (!hasRole(locals, ...roles)) redirect(302, '/');
}

/** Given a set of roles, returns the highest-privilege one (for syncing to BA's role field). */
export function primaryRole(roles: Role[]): Role | null {
	if (roles.length === 0) return null;
	return roles.reduce((best, r) => (ROLE_PRIORITY[r] > ROLE_PRIORITY[best] ? r : best));
}

export function canManageStaff(locals: App.Locals): boolean {
	return hasRole(locals, 'admin', 'owner');
}

export function canViewFinancialReports(locals: App.Locals): boolean {
	return hasRole(locals, 'admin', 'owner');
}

/**
 * Operational payment collection is not the same as full financial reporting.
 * Managers can record money collected during day-to-day operations without
 * getting owner/admin-only report access.
 */
export function canRecordPayment(locals: App.Locals): boolean {
	return hasRole(locals, 'admin', 'owner', 'manager');
}

export const canSeeFinancials = canViewFinancialReports;

export function canEditServices(locals: App.Locals): boolean {
	return hasRole(locals, 'admin', 'owner');
}

export function atLeastManager(locals: App.Locals): boolean {
	return hasRole(locals, 'admin', 'owner', 'manager');
}

export function isInstructorRole(locals: App.Locals): boolean {
	return hasRole(locals, 'instructor');
}
