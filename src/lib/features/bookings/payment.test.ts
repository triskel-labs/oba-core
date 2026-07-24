import { describe, expect, it } from 'vitest';
import { derivePaymentStatus } from './payment';

describe('derivePaymentStatus', () => {
	it('marks payment as paid only when paid amount reaches database amount due', () => {
		expect(derivePaymentStatus('35', '35')).toBe('paid');
		expect(derivePaymentStatus('34.99', '35')).toBe('partial');
	});

	it('treats empty or zero paid amounts as pending', () => {
		expect(derivePaymentStatus('', '35')).toBe('pending');
		expect(derivePaymentStatus('0', '35')).toBe('pending');
	});
});
