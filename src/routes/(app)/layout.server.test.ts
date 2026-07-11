import { describe, it, expect } from 'vitest';
import { load } from './+layout.server';

describe('(app) layout auth guard', () => {
	it('throws a redirect when user is not authenticated', async () => {
		await expect(
			load({ locals: { user: undefined, session: undefined } } as any)
		).rejects.toMatchObject({ status: 302, location: '/auth/login' });
	});

	it('returns user data and default role when authenticated', async () => {
		const user = { id: '1', email: 'owner@oba.surf', name: 'Owner' };
		const result = await load({ locals: { user, session: {} } } as any);
		expect(result).toEqual({ user, role: 'instructor' });
	});
});
