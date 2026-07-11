import { describe, it, expect, beforeEach } from 'vitest';

const describeWithDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeWithDatabase('service queries (DB integration)', () => {
	let db: any;
	let bookingClients: any;
	let bookings: any;
	let services: any;
	let listServices: any;
	let getService: any;
	let createService: any;
	let updateService: any;
	let deleteService: any;

	beforeEach(async () => {
		if (!db) {
			const dbModule = await import('$lib/server/db');
			const schema = await import('$lib/server/db/schema');
			const queries = await import('./queries');

			db = dbModule.db;
			({ bookingClients, bookings, services } = schema);
			({ listServices, getService, createService, updateService, deleteService } = queries);
		}

		// Delete in FK-safe order: booking_clients → bookings → services
		await db.delete(bookingClients);
		await db.delete(bookings);
		await db.delete(services);
	});

	it('creates and retrieves a service', async () => {
		const created = await createService({
			name: 'Group Surf Lesson',
			type: 'lesson',
			durationMinutes: 90,
			basePrice: '40.00'
		});

		expect(created.name).toBe('Group Surf Lesson');
		expect(created.active).toBe(true);

		const found = await getService(created.id);
		expect(found?.id).toBe(created.id);
	});

	it('lists only active services by default', async () => {
		await createService({ name: 'Active', type: 'lesson', basePrice: '30.00' });
		const all = await listServices(true);
		await deleteService(all[0].id); // soft-delete first one

		const active = await listServices();
		expect(active.every((s: { active: boolean }) => s.active)).toBe(true);
	});

	it('updates a service', async () => {
		const s = await createService({ name: 'Old', type: 'lesson', basePrice: '20.00' });
		const updated = await updateService(s.id, { name: 'New', basePrice: '25.00' });
		expect(updated.name).toBe('New');
		expect(updated.basePrice).toBe('25.00');
	});
});
