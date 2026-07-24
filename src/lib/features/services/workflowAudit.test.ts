import { describe, expect, it } from 'vitest';
import { auditServiceWorkflowRows } from './workflowAudit';

describe('auditServiceWorkflowRows', () => {
	it('flags active lesson services with session pricing but no sessions module', () => {
		const findings = auditServiceWorkflowRows([
			{
				id: 'svc-private',
				name: 'Clase Privada Surf',
				type: 'lesson',
				pricingMode: 'per_person_per_session',
				defaultSessionsIncluded: 1,
				modules: {},
				active: true,
				serviceSessionCount: 0,
				editionCount: 0,
				editionSessionCount: 0
			}
		]);

		expect(findings).toEqual([
			expect.objectContaining({
				serviceId: 'svc-private',
				severity: 'fix',
				code: 'lesson_session_pricing_missing_sessions_module'
			})
		]);
	});

	it('flags ambiguous roster lesson services for manual review instead of auto-fix', () => {
		const findings = auditServiceWorkflowRows([
			{
				id: 'svc-roster',
				name: 'Group-ish lesson',
				type: 'lesson',
				pricingMode: 'per_session',
				defaultSessionsIncluded: 1,
				modules: { roster: {} },
				active: true,
				serviceSessionCount: 0,
				editionCount: 0,
				editionSessionCount: 0
			}
		]);

		expect(findings).toEqual([
			expect.objectContaining({
				serviceId: 'svc-roster',
				severity: 'review',
				code: 'roster_lesson_session_pricing_missing_sessions_module'
			})
		]);
	});

	it('flags data that already has service sessions but no sessions module', () => {
		const findings = auditServiceWorkflowRows([
			{
				id: 'svc-sessions',
				name: 'Existing group sessions',
				type: 'lesson',
				pricingMode: 'per_person',
				defaultSessionsIncluded: null,
				modules: { roster: {} },
				active: true,
				serviceSessionCount: 3,
				editionCount: 0,
				editionSessionCount: 0
			}
		]);

		expect(findings).toEqual([
			expect.objectContaining({
				serviceId: 'svc-sessions',
				severity: 'fix',
				code: 'service_sessions_exist_missing_sessions_module'
			})
		]);
	});

	it('does not flag services whose modules already match their data shape', () => {
		const findings = auditServiceWorkflowRows([
			{
				id: 'svc-clean-private',
				name: 'Clean private',
				type: 'lesson',
				pricingMode: 'per_person_per_session',
				defaultSessionsIncluded: 1,
				modules: { sessions: {} },
				active: true,
				serviceSessionCount: 0,
				editionCount: 0,
				editionSessionCount: 0
			},
			{
				id: 'svc-clean-run',
				name: 'Clean camp',
				type: 'camp',
				pricingMode: 'per_person',
				defaultSessionsIncluded: null,
				modules: { editions: {}, roster: {}, sessions: {} },
				active: true,
				serviceSessionCount: 0,
				editionCount: 2,
				editionSessionCount: 5
			}
		]);

		expect(findings).toEqual([]);
	});
});
