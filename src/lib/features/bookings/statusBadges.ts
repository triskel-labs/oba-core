import type { PaymentStatus } from './types';
import type { SessionStatus } from '$lib/features/sessions/types';
import type { StatusVariant } from '$lib/components/ui/statusBadge';

export type BadgeDescriptor = {
	variant: StatusVariant;
	label: string;
};

export function attendanceBadgeForParticipant(
	sessionStatus: SessionStatus | string,
	isParticipantInSession: boolean
): BadgeDescriptor {
	if (sessionStatus === 'cancelled') return { variant: 'cancelled', label: 'cancelada' };
	if (sessionStatus === 'completed') {
		return isParticipantInSession
			? { variant: 'attended', label: 'asistió' }
			: { variant: 'missed', label: 'no asistió' };
	}
	if (sessionStatus === 'unscheduled') return { variant: 'unscheduled', label: 'sin horario' };
	if (isParticipantInSession) return { variant: 'scheduled', label: 'apuntado' };
	return { variant: 'pending', label: 'sin asignar' };
}

export function paymentBadge(paymentStatus: PaymentStatus): BadgeDescriptor {
	if (paymentStatus === 'paid') return { variant: 'paid', label: 'pagado' };
	if (paymentStatus === 'partial') return { variant: 'partial', label: 'parcial' };
	return { variant: 'pending', label: 'pendiente' };
}
