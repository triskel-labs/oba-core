import { calculateAmount, type PricingMode } from '$lib/utils/pricing';

export type BookingCreatePricingInput = {
	basePrice: string | number | null | undefined;
	pricingMode: PricingMode | null | undefined;
	participantCount?: number | null;
	sessionsIncluded?: number | null;
	days?: number | null;
	quantity?: number | null;
	isCreditsService?: boolean;
};

function positiveInt(value: number | null | undefined, fallback = 1): number {
	if (!Number.isFinite(value ?? NaN)) return fallback;
	return Math.max(1, Math.trunc(value as number));
}

function money(value: number): string {
	return value.toFixed(2);
}

export function calculateBookingCreateAmount(input: BookingCreatePricingInput): string {
	const base = typeof input.basePrice === 'number'
		? input.basePrice
		: parseFloat(input.basePrice ?? '0');
	const safeBase = Number.isFinite(base) ? base : 0;
	const quantity = positiveInt(input.quantity);

	if (input.isCreditsService && quantity > 1) return money(safeBase * quantity);

	return money(calculateAmount(safeBase, input.pricingMode, {
		participants: positiveInt(input.participantCount),
		sessions: positiveInt(input.sessionsIncluded),
		days: positiveInt(input.days)
	}));
}
