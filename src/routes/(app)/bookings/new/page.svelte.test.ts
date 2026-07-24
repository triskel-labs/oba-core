import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NewBookingPage from './+page.svelte';

const baseData = {
	services: [
		{
			id: 'private-lesson',
			name: 'Private lesson',
			basePrice: '50.00',
			pricingMode: 'per_person_per_session',
			modules: { sessions: {}, inventory: { perParticipant: true } },
			type: 'lesson',
			color: 'ocean',
			defaultSessionsIncluded: 1,
			durationMinutes: 90,
			maxCapacity: null
		}
	],
	instructors: [{ id: 'inst-1', name: 'Moli' }],
	clients: [{ id: 'client-1', firstName: 'Ana', lastName: 'Surf', phone: null, email: null }],
	defaultDate: '',
	defaultTime: '',
	defaultServiceId: 'private-lesson',
	defaultEditionId: '',
	editionsByService: {},
	workflowByServiceId: {
		'private-lesson': {
			archetype: 'private_lesson',
			bookingAction: 'create_booking_private_sessions',
			sessionOwner: 'booking',
			capacityScope: 'booking_session',
			calendarSurface: 'sessions',
			operatorQuestion: 'schedule_private_sessions'
		}
	},
	sessionsByServiceId: {}
};

describe('/bookings/new private lesson scheduling UI', () => {
	it('keeps entered client data when opening the schedule-now modal and mirrors the draft session in the sessions section', async () => {
		render(NewBookingPage, { data: baseData as any });

		await page.getByPlaceholder('Buscar cliente...').fill('Ana');
		await page.getByRole('button', { name: /Ana Surf/ }).click();
		await expect.element(page.getByText('Ana Surf')).toBeInTheDocument();

		await page.getByRole('button', { name: /Programar ahora/ }).click();

		await expect.element(page.getByText('Ana Surf')).toBeInTheDocument();
		await expect.element(page.getByRole('heading', { name: 'Programar sesión' })).toBeInTheDocument();
		await expect.element(page.getByText(/Sesión preparada/)).toBeInTheDocument();
		await expect.element(page.getByText(/Las sesiones se crean desde el detalle/)).not.toBeInTheDocument();
	});
});
