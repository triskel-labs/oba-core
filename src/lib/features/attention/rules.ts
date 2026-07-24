import type { BookingListItem } from '$lib/features/bookings/types';

export type AttentionSeverity = 'low' | 'medium' | 'high';

export interface AttentionAction {
	label: string;
	href: string;
	variant?: 'primary' | 'secondary';
}

export interface AttentionCard {
	id: string;
	type: 'booking_missing_session';
	severity: AttentionSeverity;
	title: string;
	description: string;
	href: string;
	actions: AttentionAction[];
}

export interface BuildAttentionCardsInput {
	today: string;
	bookings: Array<
		Pick<
			BookingListItem,
			| 'id'
			| 'serviceName'
			| 'date'
			| 'time'
			| 'status'
			| 'serviceHasSessions'
			| 'sessionCount'
			| 'firstClientName'
			| 'clientCount'
		>
	>;
}

function clientLabel(booking: BuildAttentionCardsInput['bookings'][number]): string {
	if (booking.firstClientName) return booking.firstClientName;
	if (booking.clientCount > 1) return `${booking.clientCount} clientes`;
	if (booking.clientCount === 1) return '1 cliente';
	return 'Sin cliente';
}

export function buildAttentionCards(input: BuildAttentionCardsInput): AttentionCard[] {
	const cards: AttentionCard[] = [];

	for (const booking of input.bookings) {
		if (booking.status === 'cancelled') continue;
		if (!booking.serviceHasSessions) continue;
		if ((booking.sessionCount ?? 0) > 0) continue;

		const dateLabel = booking.time ? `${booking.date} · ${booking.time.slice(0, 5)}` : booking.date;
		cards.push({
			id: `booking-missing-session:${booking.id}`,
			type: 'booking_missing_session',
			severity: 'high',
			title: 'Reserva sin sesión asignada',
			description: `${booking.serviceName ?? 'Servicio'} · ${clientLabel(booking)} · ${dateLabel}`,
			href: `/bookings/${booking.id}`,
			actions: [
				{ label: 'Asignar sesión', href: `/bookings/${booking.id}`, variant: 'primary' },
				{ label: 'Abrir reserva', href: `/bookings/${booking.id}`, variant: 'secondary' }
			]
		});
	}

	return cards;
}
