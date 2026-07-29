import { describe, expect, it } from 'vitest';
import {
	classifyServiceWorkflow,
	classifyServiceWorkflowForService,
	getServiceWorkflowMetadata,
	getServiceWorkflowMetadataByServiceId,
	getServiceWorkflowPresentation
} from './workflow';

const creditsConfig = {
	creditsIncluded: 5,
	validityMode: 'range' as const,
	compatibleServiceIds: []
};

describe('classifyServiceWorkflow', () => {
	it('locks the professional workflow archetype matrix', () => {
		expect(classifyServiceWorkflow({ sessions: {} })).toBe('private_lesson');
		expect(classifyServiceWorkflow({ sessions: {}, roster: {} })).toBe('group_class');
		expect(classifyServiceWorkflow({ editions: {}, sessions: {}, roster: {} })).toBe(
			'camp_course_run'
		);
		expect(classifyServiceWorkflow({ inventory: { perParticipant: true } })).toBe(
			'rental_equipment_accommodation'
		);
		expect(classifyServiceWorkflow({ credits: creditsConfig })).toBe('credit_pack');
		expect(classifyServiceWorkflow({})).toBe('simple_booking');
	});

	it('keeps credit packs as commercial entitlements instead of calendar work', () => {
		const metadata = getServiceWorkflowMetadata({ credits: creditsConfig });

		expect(metadata.bookingAction).toBe('sell_entitlement');
		expect(metadata.sessionOwner).toBe('none');
		expect(metadata.capacityScope).toBe('none');
		expect(metadata.calendarSurface).toBe('none');
		expect(metadata.operatorQuestion).toBe('sell_credits');
	});

	it('prioritizes edition/run semantics over plain group class semantics', () => {
		const metadata = getServiceWorkflowMetadata({ editions: {}, sessions: {}, roster: {} });

		expect(metadata.archetype).toBe('camp_course_run');
		expect(metadata.bookingAction).toBe('enroll_into_edition');
		expect(metadata.sessionOwner).toBe('edition');
		expect(metadata.capacityScope).toBe('edition');
		expect(metadata.operatorQuestion).toBe('choose_run');
	});

	it('treats inventory as additive when a service has session semantics', () => {
		expect(classifyServiceWorkflow({ sessions: {}, inventory: { perParticipant: true } })).toBe(
			'private_lesson'
		);
		expect(
			classifyServiceWorkflow({ sessions: {}, roster: {}, inventory: { perParticipant: true } })
		).toBe('group_class');
	});

	it('keeps roster plus sessions as group classes', () => {
		const metadata = getServiceWorkflowMetadata({ sessions: {}, roster: {} });

		expect(metadata.archetype).toBe('group_class');
		expect(metadata.bookingAction).toBe('enroll_into_session');
		expect(metadata.sessionOwner).toBe('service');
		expect(metadata.capacityScope).toBe('session_date');
		expect(metadata.operatorQuestion).toBe('choose_or_create_session');
	});

	it('treats legacy lesson-priced services without sessions module as private lessons', () => {
		const metadata = classifyServiceWorkflowForService({
			id: 'legacy-private',
			type: 'lesson',
			modules: { roster: {} },
			pricingMode: 'per_person_per_session',
			defaultSessionsIncluded: 1
		});

		expect(metadata).toBe('private_lesson');
	});

	it('keeps lesson services with sessions and operational inventory in the private lesson workflow', () => {
		const metadata = classifyServiceWorkflowForService({
			id: 'private-with-kit',
			type: 'lesson',
			modules: { sessions: { durationMinutes: 90 }, inventory: { perParticipant: true }, instructor: { required: true } },
			pricingMode: 'per_person_per_session',
			defaultSessionsIncluded: 1
		});

		expect(metadata).toBe('private_lesson');
	});

	it('keeps roster lesson services with sessions and operational inventory in the group class workflow', () => {
		const metadata = classifyServiceWorkflowForService({
			id: 'group-with-kit',
			type: 'lesson',
			modules: { sessions: { durationMinutes: 90 }, roster: {}, inventory: { perParticipant: true }, instructor: { required: true } },
			pricingMode: 'per_person_per_session',
			defaultSessionsIncluded: 1
		});

		expect(metadata).toBe('group_class');
	});

	it('builds workflow metadata keyed by service id for UI load data', () => {
		expect(
			getServiceWorkflowMetadataByServiceId([
				{ id: 'private', modules: { sessions: {} } },
				{ id: 'group', modules: { sessions: {}, roster: {} } },
				{ id: 'pack', modules: { credits: creditsConfig } }
			])
		).toMatchObject({
			private: { archetype: 'private_lesson', operatorQuestion: 'schedule_private_sessions' },
			group: { archetype: 'group_class', operatorQuestion: 'choose_or_create_session' },
			pack: { archetype: 'credit_pack', operatorQuestion: 'sell_credits' }
		});
	});

	it('translates metadata into operator-facing booking copy instead of raw module names', () => {
		expect(getServiceWorkflowPresentation(getServiceWorkflowMetadata({ sessions: {} }))).toMatchObject({
			label: 'Clase privada',
			operatorPrompt: 'Programa las sesiones privadas después de crear la reserva.',
			ownership: 'Sesiones propias de esta reserva',
			capacity: 'Capacidad por reserva/sesión'
		});

		expect(getServiceWorkflowPresentation(getServiceWorkflowMetadata({ sessions: {}, roster: {} }))).toMatchObject({
			label: 'Clase de grupo',
			operatorPrompt: 'Elige o crea la sesión de grupo a la que se apuntan los participantes.',
			ownership: 'Sesiones compartidas del servicio',
			capacity: 'Capacidad por sesión y fecha'
		});
	});
});
