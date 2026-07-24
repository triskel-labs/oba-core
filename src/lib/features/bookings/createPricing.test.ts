import { describe, expect, it } from 'vitest';
import { calculateBookingCreateAmount } from './createPricing';

describe('calculateBookingCreateAmount', () => {
	it('updates per-person totals when participant count changes', () => {
		expect(calculateBookingCreateAmount({
			basePrice: '50.00',
			pricingMode: 'per_person',
			participantCount: 3,
			sessionsIncluded: 1
		})).toBe('150.00');
	});

	it('updates person/session totals from live participant and session counts', () => {
		expect(calculateBookingCreateAmount({
			basePrice: '30.00',
			pricingMode: 'per_person_per_session',
			participantCount: 2,
			sessionsIncluded: 3
		})).toBe('180.00');
	});

	it('keeps flat prices independent from participant count', () => {
		expect(calculateBookingCreateAmount({
			basePrice: '75.00',
			pricingMode: 'flat',
			participantCount: 4,
			sessionsIncluded: 1
		})).toBe('75.00');
	});

	it('uses pack quantity for credit services', () => {
		expect(calculateBookingCreateAmount({
			basePrice: '20.00',
			pricingMode: 'flat',
			participantCount: 1,
			sessionsIncluded: 1,
			isCreditsService: true,
			quantity: 5
		})).toBe('100.00');
	});
});
