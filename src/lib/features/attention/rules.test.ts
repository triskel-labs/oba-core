import { describe, expect, it } from 'vitest';
import { buildAttentionCards } from './rules';
import type { BuildAttentionCardsInput } from './rules';

type TestBooking = BuildAttentionCardsInput['bookings'][number];

const booking = (overrides: Partial<TestBooking>): TestBooking => ({
	id: 'booking-1',
	serviceName: 'Surf class',
	date: '2026-07-23',
	time: null,
	status: 'confirmed' as const,
	serviceHasSessions: true,
	sessionCount: 0,
	firstClientName: 'Maria',
	clientCount: 1,
	...overrides
});

describe('Today attention card rules', () => {
	it('creates a card when a booking service requires sessions but no session is assigned', () => {
		const cards = buildAttentionCards({
			today: '2026-07-23',
			bookings: [booking({})]
		});

		expect(cards).toEqual([
			expect.objectContaining({
				type: 'booking_missing_session',
				severity: 'high',
				title: 'Reserva sin sesión asignada',
				href: '/bookings/booking-1',
				actions: expect.arrayContaining([
					expect.objectContaining({ label: 'Asignar sesión', href: '/bookings/booking-1' })
				])
			})
		]);
	});

	it('does not create missing-session cards for cancelled bookings or bookings that already have a session', () => {
		const cards = buildAttentionCards({
			today: '2026-07-23',
			bookings: [
				booking({ id: 'cancelled', status: 'cancelled' }),
				booking({ id: 'has-session', sessionCount: 1 })
			]
		});

		expect(cards).toEqual([]);
	});
});
