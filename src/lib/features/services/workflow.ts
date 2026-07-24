import type { ServiceModules } from './modules';

export type ServiceWorkflowArchetype =
	| 'private_lesson'
	| 'group_class'
	| 'camp_course_run'
	| 'rental_equipment_accommodation'
	| 'credit_pack'
	| 'simple_booking';

export type WorkflowBookingAction =
	| 'create_booking_private_sessions'
	| 'enroll_into_session'
	| 'enroll_into_edition'
	| 'reserve_inventory_date'
	| 'sell_entitlement'
	| 'create_commercial_record';

export type WorkflowSessionOwner = 'booking' | 'service' | 'edition' | 'none';

export type WorkflowCapacityScope =
	| 'booking_session'
	| 'session_date'
	| 'edition'
	| 'inventory_date'
	| 'none';

export type WorkflowCalendarSurface =
	| 'sessions'
	| 'edition_sessions'
	| 'inventory_reservations'
	| 'optional'
	| 'none';

export type WorkflowOperatorQuestion =
	| 'schedule_private_sessions'
	| 'choose_or_create_session'
	| 'choose_run'
	| 'reserve_inventory'
	| 'sell_credits'
	| 'confirm_booking';

export type ServiceWorkflowMetadata = {
	archetype: ServiceWorkflowArchetype;
	bookingAction: WorkflowBookingAction;
	sessionOwner: WorkflowSessionOwner;
	capacityScope: WorkflowCapacityScope;
	calendarSurface: WorkflowCalendarSurface;
	operatorQuestion: WorkflowOperatorQuestion;
};

const WORKFLOW_METADATA: Record<ServiceWorkflowArchetype, ServiceWorkflowMetadata> = {
	private_lesson: {
		archetype: 'private_lesson',
		bookingAction: 'create_booking_private_sessions',
		sessionOwner: 'booking',
		capacityScope: 'booking_session',
		calendarSurface: 'sessions',
		operatorQuestion: 'schedule_private_sessions'
	},
	group_class: {
		archetype: 'group_class',
		bookingAction: 'enroll_into_session',
		sessionOwner: 'service',
		capacityScope: 'session_date',
		calendarSurface: 'sessions',
		operatorQuestion: 'choose_or_create_session'
	},
	camp_course_run: {
		archetype: 'camp_course_run',
		bookingAction: 'enroll_into_edition',
		sessionOwner: 'edition',
		capacityScope: 'edition',
		calendarSurface: 'edition_sessions',
		operatorQuestion: 'choose_run'
	},
	rental_equipment_accommodation: {
		archetype: 'rental_equipment_accommodation',
		bookingAction: 'reserve_inventory_date',
		sessionOwner: 'none',
		capacityScope: 'inventory_date',
		calendarSurface: 'inventory_reservations',
		operatorQuestion: 'reserve_inventory'
	},
	credit_pack: {
		archetype: 'credit_pack',
		bookingAction: 'sell_entitlement',
		sessionOwner: 'none',
		capacityScope: 'none',
		calendarSurface: 'none',
		operatorQuestion: 'sell_credits'
	},
	simple_booking: {
		archetype: 'simple_booking',
		bookingAction: 'create_commercial_record',
		sessionOwner: 'none',
		capacityScope: 'none',
		calendarSurface: 'optional',
		operatorQuestion: 'confirm_booking'
	}
};

export function classifyServiceWorkflow(modules: ServiceModules = {}): ServiceWorkflowArchetype {
	// Current schema uses `credits` for products that sell credits/bonos.
	// Future work should split this from “operational service accepts credits”.
	if (modules.credits) return 'credit_pack';

	if (modules.editions) return 'camp_course_run';
	if (modules.inventory) return 'rental_equipment_accommodation';
	if (modules.sessions && modules.roster) return 'group_class';
	if (modules.sessions) return 'private_lesson';

	return 'simple_booking';
}

export function getServiceWorkflowMetadata(modules: ServiceModules = {}): ServiceWorkflowMetadata {
	return WORKFLOW_METADATA[classifyServiceWorkflow(modules)];
}

export function getServiceWorkflowMetadataByServiceId(
	services: { id: string; modules: ServiceModules }[]
): Record<string, ServiceWorkflowMetadata> {
	return Object.fromEntries(
		services.map((service) => [service.id, getServiceWorkflowMetadata(service.modules)])
	);
}
