import { describe, expect, it } from 'vitest';
import { canRecordPayment, canViewFinancialReports } from './permissions';

const localsFor = (role: string, roles?: string[]) =>
	({
		user: { id: 'viewer', role, roles: roles ?? [role] },
		session: {}
	}) as App.Locals;

describe('operational payment permissions', () => {
	it.each(['admin', 'owner', 'manager'])('allows %s to record payments', (role) => {
		expect(canRecordPayment(localsFor(role))).toBe(true);
	});

	it('prevents instructors from recording payments', () => {
		expect(canRecordPayment(localsFor('instructor'))).toBe(false);
	});

	it('keeps full financial reports owner/admin-only', () => {
		expect(canViewFinancialReports(localsFor('owner'))).toBe(true);
		expect(canViewFinancialReports(localsFor('admin'))).toBe(true);
		expect(canViewFinancialReports(localsFor('manager'))).toBe(false);
	});
});
