import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import NewBookingPage from './+page.svelte';

const privateLessonService = {
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
};

const groupClassService = {
	id: 'group-class',
	name: 'Group class',
	basePrice: '35.00',
	pricingMode: 'per_person',
	modules: { sessions: {}, roster: {}, instructor: {} },
	type: 'lesson',
	color: 'sand',
	defaultSessionsIncluded: 1,
	durationMinutes: 90,
	maxCapacity: 6
};

const baseData = {
	services: [
		privateLessonService
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
		},
		'group-class': {
			archetype: 'group_class',
			bookingAction: 'enroll_into_session',
			sessionOwner: 'service',
			capacityScope: 'session_date',
			calendarSurface: 'sessions',
			operatorQuestion: 'choose_or_create_session'
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

describe('/bookings/new group lesson session choice UI', () => {
	it('shows an empty-state create-session button when no existing group session is available', async () => {
		render(NewBookingPage, {
			data: {
				...baseData,
				services: [groupClassService],
				defaultServiceId: 'group-class',
				sessionsByServiceId: {}
			} as any
		});

		await expect.element(page.getByText(/No hay sesiones futuras para este servicio/)).toBeInTheDocument();
		await page.getByRole('button', { name: /Crear sesión para esta fecha/ }).click();

		await expect.element(page.getByRole('heading', { name: 'Nueva sesión de grupo' })).toBeInTheDocument();
		await expect.element(page.getByText(/Nueva sesión de grupo preparada/)).toBeInTheDocument();
	});

	it('allows creating a new reusable group session instead of attaching to an existing one', async () => {
		render(NewBookingPage, {
			data: {
				...baseData,
				services: [groupClassService],
				defaultServiceId: 'group-class',
				sessionsByServiceId: {
					'group-class': [
						{
							id: 'group-session-1',
							serviceId: 'group-class',
							date: '2026-08-03',
							time: '10:00',
							durationMinutes: 90,
							enrolledCount: 2,
							maxCapacity: 6,
							slotsLeft: 4
						}
					]
				}
			} as any
		});

		await page.getByPlaceholder('Buscar cliente...').fill('Ana');
		await page.getByRole('button', { name: /Ana Surf/ }).click();

		await expect.element(page.getByRole('button', { name: /Apuntar a sesión existente/ })).toBeInTheDocument();
		await page.getByRole('button', { name: /Crear nueva sesión/ }).click();

		await expect.element(page.getByRole('heading', { name: 'Nueva sesión de grupo' })).toBeInTheDocument();
		await expect.element(page.getByText(/Nueva sesión de grupo preparada/)).toBeInTheDocument();
		await expect.element(page.getByRole('button', { name: /Crear reserva/ })).not.toBeDisabled();
	});
});
