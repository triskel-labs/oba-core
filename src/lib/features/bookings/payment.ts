import type { PaymentStatus } from './types';

export function derivePaymentStatus(
	amountPaid: string | number,
	amountDue: string | number
): PaymentStatus {
	const paid = Number.parseFloat(String(amountPaid || 0));
	const due = Number.parseFloat(String(amountDue || 0));

	if (!Number.isFinite(paid) || paid <= 0) return 'pending';
	if (Number.isFinite(due) && due > 0 && paid >= due) return 'paid';
	return 'partial';
}
