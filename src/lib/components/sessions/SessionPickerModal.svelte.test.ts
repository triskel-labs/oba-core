import { page } from 'vitest/browser';
import { describe, expect, it } from 'vitest';
import { render } from 'vitest-browser-svelte';
import SessionPickerModal from './SessionPickerModal.svelte';

describe('SessionPickerModal', () => {
	it('offers a direct create-session CTA when there are no existing sessions to link', async () => {
		render(SessionPickerModal, {
			open: true,
			bookingId: 'booking-1',
			bookingStatus: 'confirmed',
			incomingParticipantCount: 2,
			capacity: 6,
			availableSessions: [],
			instructors: [],
			bookingDate: '2026-08-03',
			newSessionAction: '?/addServiceSession'
		});

		await expect.element(page.getByText(/No hay sesiones disponibles del servicio para vincular/)).toBeInTheDocument();
		await page.getByRole('button', { name: /Crear sesión ahora/ }).click();

		await expect.element(page.getByRole('button', { name: 'Crear sesión' })).toBeInTheDocument();
	});
});
