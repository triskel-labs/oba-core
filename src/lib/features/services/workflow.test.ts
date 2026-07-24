import { describe, expect, it } from 'vitest';
import {
	classifyServiceWorkflow,
	getServiceWorkflowMetadata,
	getServiceWorkflowMetadataByServiceId
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

	it('describes group classes as shared service sessions with session/date capacity', () => {
		const metadata = getServiceWorkflowMetadata({ sessions: {}, roster: {} });

		expect(metadata.archetype).toBe('group_class');
		expect(metadata.bookingAction).toBe('enroll_into_session');
		expect(metadata.sessionOwner).toBe('service');
		expect(metadata.capacityScope).toBe('session_date');
		expect(metadata.operatorQuestion).toBe('choose_or_create_session');
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
});
