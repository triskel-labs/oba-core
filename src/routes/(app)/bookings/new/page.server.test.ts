import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('$lib/features/bookings/queries', () => ({
	createBooking: vi.fn(),
	countEnrolledClientsForService: vi.fn(),
	recalcBookingAmounts: vi.fn()
}));

vi.mock('$lib/features/sessions/queries', () => ({
	createSession: vi.fn(),
	addParticipant: vi.fn()
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

import { load, actions } from './+page.server';
import { createBooking, recalcBookingAmounts } from '$lib/features/bookings/queries';
import { createSession, addParticipant as addSessionParticipant } from '$lib/features/sessions/queries';
import { addParticipant as addEnrollmentParticipant } from '$lib/features/bookings/participants.queries';
import { getService } from '$lib/features/services/queries';

beforeEach(() => {
	vi.clearAllMocks();
	vi.mocked(recalcBookingAmounts).mockResolvedValue(undefined);
	(addEnrollmentParticipant as any).mockResolvedValue({ id: 'participant-1', name: 'Ana Surf' });
	(addSessionParticipant as any).mockResolvedValue({});
});

function bookingRequest(form: FormData): Request {
	return new Request('https://oba.test/bookings/new', { method: 'POST', body: form });
}

function baseBookingForm(overrides: Record<string, string> = {}): FormData {
	const form = new FormData();
	form.set('serviceId', 'private-lesson');
	form.set('clientId', 'client-1');
	form.set('clientName', 'Ana Surf');
	form.set('participantCount', '1');
	form.set('alsoParticipates', 'true');
	form.set('date', '2026-07-24');
	for (const [key, value] of Object.entries(overrides)) form.set(key, value);
	return form;
}

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

describe('new booking private lesson scheduling and participant sync', () => {
	it('creates the scheduled session from modal fields and syncs booking participants to every created session', async () => {
		vi.mocked(getService).mockResolvedValue({
			id: 'private-lesson',
			name: 'Private lesson',
			modules: { sessions: {} },
			basePrice: '50.00',
			pricingMode: 'flat',
			defaultSessionsIncluded: 2
		} as any);
		vi.mocked(createBooking).mockResolvedValue({
			id: 'booking-1',
			clients: [{ id: 'booking-client-1', clientId: 'client-1', clientFirstName: 'Ana' }]
		} as any);
		vi.mocked(createSession)
			.mockResolvedValueOnce({ id: 'session-1' } as any)
			.mockResolvedValueOnce({ id: 'session-2' } as any);
		vi.mocked(addEnrollmentParticipant).mockResolvedValue({ id: 'participant-1', name: 'Ana Surf' } as any);

		const form = baseBookingForm({
			sessionScheduleMode: 'scheduled',
			sessionDate: '2026-08-03',
			sessionTime: '10:30',
			sessionDuration: '90',
			sessionInstructorId: 'inst-1'
		});

		const result = await (actions.default as any)({ request: bookingRequest(form), locals: {} });

		expect(result).toMatchObject({ bookingId: 'booking-1' });
		expect(createSession).toHaveBeenNthCalledWith(1, {
			ownerType: 'booking',
			bookingId: 'booking-1',
			date: '2026-08-03',
			time: '10:30',
			durationMinutes: 90,
			instructorIds: ['inst-1'],
			sortOrder: 0
		});
		expect(createSession).toHaveBeenNthCalledWith(2, {
			ownerType: 'booking',
			bookingId: 'booking-1',
			date: '2026-08-03',
			sortOrder: 1
		});
		expect(addSessionParticipant).toHaveBeenCalledTimes(2);
		expect(addSessionParticipant).toHaveBeenCalledWith({
			sessionId: 'session-1',
			bookingParticipantId: 'participant-1',
			name: 'Ana Surf'
		});
		expect(addSessionParticipant).toHaveBeenCalledWith({
			sessionId: 'session-2',
			bookingParticipantId: 'participant-1',
			name: 'Ana Surf'
		});
	});

	it('syncs booking participants into unscheduled sessions created with the booking', async () => {
		vi.mocked(getService).mockResolvedValue({
			id: 'private-lesson',
			name: 'Private lesson',
			modules: { sessions: {} },
			basePrice: '50.00',
			pricingMode: 'flat',
			defaultSessionsIncluded: 2
		} as any);
		vi.mocked(createBooking).mockResolvedValue({
			id: 'booking-1',
			clients: [{ id: 'booking-client-1', clientId: 'client-1', clientFirstName: 'Ana' }]
		} as any);
		vi.mocked(createSession)
			.mockResolvedValueOnce({ id: 'session-1' } as any)
			.mockResolvedValueOnce({ id: 'session-2' } as any);
		vi.mocked(addEnrollmentParticipant).mockResolvedValue({ id: 'participant-1', name: 'Ana Surf' } as any);

		await (actions.default as any)({ request: bookingRequest(baseBookingForm()), locals: {} });

		expect(addSessionParticipant).toHaveBeenCalledTimes(2);
		expect(addSessionParticipant).toHaveBeenCalledWith({
			sessionId: 'session-1',
			bookingParticipantId: 'participant-1',
			name: 'Ana Surf'
		});
		expect(addSessionParticipant).toHaveBeenCalledWith({
			sessionId: 'session-2',
			bookingParticipantId: 'participant-1',
			name: 'Ana Surf'
		});
		expect(recalcBookingAmounts).toHaveBeenCalledWith('booking-1');
	});
});
