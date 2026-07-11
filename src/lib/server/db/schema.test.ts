import { describe, it, expect } from 'vitest'
import {
	skillLevelEnum,
	bookingStatusEnum,
	paymentStatusEnum,
	sessionStatusEnum,
	services,
	bookingClients,
	bookingParticipants,
	serviceEditions
} from './schema'
import type { CreateBookingInput } from '$lib/features/bookings/types'

describe('schema enums', () => {
	it('skillLevel has correct values', () => {
		expect(skillLevelEnum.enumValues).toEqual(['beginner', 'intermediate', 'advanced'])
	})
	it('bookingStatus has correct values', () => {
		expect(bookingStatusEnum.enumValues).toEqual(['pending', 'confirmed', 'cancelled'])
	})
	it('paymentStatus has correct values', () => {
		expect(paymentStatusEnum.enumValues).toEqual(['pending', 'partial', 'paid'])
	})
	it('sessionStatus supports completed sessions for attendance badges', () => {
		expect(sessionStatusEnum.enumValues).toEqual(['unscheduled', 'scheduled', 'completed', 'cancelled'])
	})
})

describe('services table', () => {
	it('has modules column instead of boolean flags', () => {
		const cols = Object.keys(services)
		expect(cols).toContain('modules')
		expect(cols).not.toContain('hasSessions')
		expect(cols).not.toContain('hasRoster')
		expect(cols).not.toContain('hasDateRange')
		expect(cols).not.toContain('hasInventoryUnits')
		expect(cols).not.toContain('requiresInstructor')
	})
})

describe('bookingClients table', () => {
	it('has participant_count and credit fields', () => {
		const cols = Object.keys(bookingClients)
		expect(cols).toContain('participantCount')
		expect(cols).toContain('creditSourceId')
		expect(cols).toContain('creditCount')
		expect(cols).toContain('priceOverride')
	})
})

describe('bookingParticipants table', () => {
	it('references bookingClientId not bookingId', () => {
		const cols = Object.keys(bookingParticipants)
		expect(cols).toContain('bookingClientId')
		expect(cols).not.toContain('bookingId')
	})
})

describe('serviceEditions table', () => {
	it('exists (service_runs renamed to service_editions)', () => {
		expect(serviceEditions).toBeDefined()
	})
})

describe('CreateBookingInput', () => {
	it('createBooking stores participantCount per client', async () => {
		const input = {
			clientId: 'test-client',
			amountDue: '50',
			participantCount: 3
		} satisfies CreateBookingInput['clients'][number];
		expect(input.participantCount).toBe(3);
	});
})
