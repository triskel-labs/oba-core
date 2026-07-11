import { describe, expect, it } from 'vitest';
import { canManageStaffMember, canViewStaffMember } from './access';

const localsFor = (role: string, roles?: string[]) =>
	({
		user: { id: 'viewer', role, roles: roles ?? [role] },
		session: {}
	}) as App.Locals;

const member = (role: string, roles?: string[]) => ({
	id: 'member',
	role,
	roles: roles ?? [role]
});

describe('staff member access', () => {
	it('allows admins to manage staff accounts', () => {
		expect(canManageStaffMember(localsFor('admin'), member('instructor'))).toBe(true);
	});

	it('keeps owners in profile-view mode instead of account-management mode', () => {
		expect(canManageStaffMember(localsFor('owner'), member('instructor'))).toBe(false);
	});

	it('prevents owners from opening admin staff records by direct URL', () => {
		expect(canViewStaffMember(localsFor('owner'), member('admin'))).toBe(false);
	});

	it('allows owners to view non-admin staff profiles', () => {
		expect(canViewStaffMember(localsFor('owner'), member('instructor'))).toBe(true);
	});
});
