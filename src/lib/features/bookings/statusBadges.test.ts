import { describe, expect, it } from 'vitest';
import { attendanceBadgeForParticipant, paymentBadge } from './statusBadges';

describe('attendanceBadgeForParticipant', () => {
	it('shows attended when a participant was in a completed session', () => {
		expect(attendanceBadgeForParticipant('completed', true)).toEqual({
			variant: 'attended',
			label: 'asistió'
		});
	});

	it('shows missed when a participant was not in a completed session', () => {
		expect(attendanceBadgeForParticipant('completed', false)).toEqual({
			variant: 'missed',
			label: 'no asistió'
		});
	});

	it('shows cancelled for cancelled sessions regardless of participant assignment', () => {
		expect(attendanceBadgeForParticipant('cancelled', true)).toEqual({
			variant: 'cancelled',
			label: 'cancelada'
		});
		expect(attendanceBadgeForParticipant('cancelled', false)).toEqual({
			variant: 'cancelled',
			label: 'cancelada'
		});
	});

	it('shows the operational booking state before the session happens', () => {
		expect(attendanceBadgeForParticipant('scheduled', true)).toEqual({
			variant: 'scheduled',
			label: 'apuntado'
		});
		expect(attendanceBadgeForParticipant('scheduled', false)).toEqual({
			variant: 'pending',
			label: 'sin asignar'
		});
		expect(attendanceBadgeForParticipant('unscheduled', true)).toEqual({
			variant: 'unscheduled',
			label: 'sin horario'
		});
	});
});

describe('paymentBadge', () => {
	it('maps stored payment status to badge copy', () => {
		expect(paymentBadge('paid')).toEqual({ variant: 'paid', label: 'pagado' });
		expect(paymentBadge('partial')).toEqual({ variant: 'partial', label: 'parcial' });
		expect(paymentBadge('pending')).toEqual({ variant: 'pending', label: 'pendiente' });
	});
});
