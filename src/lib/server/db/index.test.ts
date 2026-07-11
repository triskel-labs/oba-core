import { describe, expect, it, vi } from 'vitest';

describe('database module bootstrap', () => {
	it('can be imported without DATABASE_URL during build-time analysis', async () => {
		vi.resetModules();
		vi.doMock('$env/dynamic/private', () => ({ env: {} }));

		await expect(import('./index')).resolves.toHaveProperty('db');
	});
});
