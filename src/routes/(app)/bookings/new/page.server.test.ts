import { describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/bookings/queries', () => ({
	createBooking: vi.fn(),
	countEnrolledClientsForService: vi.fn(),
	recalcBookingAmounts: vi.fn()
}));

vi.mock('$lib/features/sessions/queries', () => ({
	createSession: vi.fn()
}));

vi.mock('$lib/features/bookings/participants.queries', () => ({
	setEnrollmentParticipantCount: vi.fn(),
	addParticipant: vi.fn()
}));

vi.mock('$lib/features/services/queries', () => ({
	listServices: vi.fn(async () => [
		{
			id: 'private-lesson',
			name: 'Private lesson',
			modules: { sessions: {} },
			color: 'ocean'
		},
		{
			id: 'group-class',
			name: 'Group class',
			modules: { sessions: {}, roster: {} },
			color: 'sand'
		}
	]),
	getService: vi.fn()
}));

vi.mock('$lib/features/instructors/queries', () => ({
	listInstructors: vi.fn(async () => [])
}));

vi.mock('$lib/features/clients/queries', () => ({
	listClients: vi.fn(async () => [])
}));

vi.mock('$lib/features/services/editions.queries', () => ({
	listEditionsForService: vi.fn(async () => []),
	countEnrolledClientsForEdition: vi.fn(),
	getServiceEdition: vi.fn()
}));

vi.mock('$lib/server/permissions', () => ({
	requireRole: vi.fn()
}));

import { load } from './+page.server';

describe('new booking load workflow metadata', () => {
	it('makes workflow metadata available to the UI by service id', async () => {
		const result = (await load({
			url: new URL('https://oba.test/bookings/new'),
			locals: {}
		} as any)) as any;

		expect(result.workflowByServiceId).toMatchObject({
			'private-lesson': {
				archetype: 'private_lesson',
				operatorQuestion: 'schedule_private_sessions'
			},
			'group-class': {
				archetype: 'group_class',
				operatorQuestion: 'choose_or_create_session'
			}
		});
	});
});
