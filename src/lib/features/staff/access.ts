import { hasRole, userRoles, type Role } from '$lib/server/permissions';

export type StaffMemberAccessShape = {
	id?: string | null;
	role?: string | null;
	roles?: string[] | null;
};

function memberRoles(member: StaffMemberAccessShape): Role[] {
	const roles = member.roles?.length ? member.roles : member.role ? [member.role] : [];
	return roles.filter(
		(role): role is Role =>
			role === 'admin' || role === 'owner' || role === 'manager' || role === 'instructor'
	);
}

export function canManageStaffMember(locals: App.Locals, _member: StaffMemberAccessShape): boolean {
	void _member;
	return hasRole(locals, 'admin');
}

export function canViewStaffMember(locals: App.Locals, member: StaffMemberAccessShape): boolean {
	if (hasRole(locals, 'admin')) return true;
	if (!hasRole(locals, 'owner')) return false;
	return !memberRoles(member).includes('admin');
}

export function viewerStaffMode(locals: App.Locals): 'admin' | 'owner' | 'staff' {
	const roles = userRoles(locals);
	if (roles.includes('admin')) return 'admin';
	if (roles.includes('owner')) return 'owner';
	return 'staff';
}
