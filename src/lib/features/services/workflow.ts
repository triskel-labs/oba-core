import type { ServiceModules } from './modules';
import type { PricingMode } from './types';

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

export type ServiceWorkflowPresentation = {
	label: string;
	operatorPrompt: string;
	ownership: string;
	capacity: string;
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

export type ServiceWorkflowInput = {
	id?: string;
	type?: string | null;
	modules?: ServiceModules | null;
	pricingMode?: PricingMode | null;
	defaultSessionsIncluded?: number | null;
};

function hasSessionPricingSignal(service: ServiceWorkflowInput): boolean {
	return service.pricingMode === 'per_session' || service.pricingMode === 'per_person_per_session';
}

export function classifyServiceWorkflowForService(service: ServiceWorkflowInput): ServiceWorkflowArchetype {
	const modules = service.modules ?? {};
	const baseClassification = classifyServiceWorkflow(modules);

	if (baseClassification !== 'simple_booking') return baseClassification;

	// Legacy Tipiti/OBA services can carry the old lesson/category + session pricing
	// shape without the new `sessions` module. Treat those as private lessons so
	// booking creation offers the session scheduling flow instead of a plain date.
	if (service.type === 'lesson' && hasSessionPricingSignal(service)) return 'private_lesson';

	return baseClassification;
}

export function getServiceWorkflowMetadata(modules: ServiceModules = {}): ServiceWorkflowMetadata {
	return WORKFLOW_METADATA[classifyServiceWorkflow(modules)];
}

export function getServiceWorkflowMetadataByServiceId(
	services: ServiceWorkflowInput[]
): Record<string, ServiceWorkflowMetadata> {
	return Object.fromEntries(
		services
			.filter((service): service is ServiceWorkflowInput & { id: string } => Boolean(service.id))
			.map((service) => [
				service.id,
				WORKFLOW_METADATA[classifyServiceWorkflowForService(service)]
			])
	);
}

const WORKFLOW_PRESENTATION: Record<ServiceWorkflowArchetype, ServiceWorkflowPresentation> = {
	private_lesson: {
		label: 'Clase privada',
		operatorPrompt: 'Programa las sesiones privadas después de crear la reserva.',
		ownership: 'Sesiones propias de esta reserva',
		capacity: 'Capacidad por reserva/sesión'
	},
	group_class: {
		label: 'Clase de grupo',
		operatorPrompt: 'Elige o crea la sesión de grupo a la que se apuntan los participantes.',
		ownership: 'Sesiones compartidas del servicio',
		capacity: 'Capacidad por sesión y fecha'
	},
	camp_course_run: {
		label: 'Campamento / curso',
		operatorPrompt: 'Elige la edición o run donde se inscriben los participantes.',
		ownership: 'Sesiones propias de la edición/run',
		capacity: 'Capacidad de la edición/run'
	},
	rental_equipment_accommodation: {
		label: 'Reserva de recurso',
		operatorPrompt: 'Reserva fechas y recurso; la asignación exacta se confirma después.',
		ownership: 'Sin sesiones; reserva de inventario/recurso',
		capacity: 'Capacidad por recurso y fecha'
	},
	credit_pack: {
		label: 'Bono / créditos',
		operatorPrompt: 'Vende el bono; no crea trabajo de calendario por sí mismo.',
		ownership: 'Sin sesiones; derecho comercial del cliente',
		capacity: 'Sin capacidad operativa'
	},
	simple_booking: {
		label: 'Reserva simple',
		operatorPrompt: 'Confirma el registro comercial sin workflow operativo especial.',
		ownership: 'Sin sesiones dedicadas',
		capacity: 'Sin capacidad operativa'
	}
};

export function getServiceWorkflowPresentation(
	metadata: ServiceWorkflowMetadata
): ServiceWorkflowPresentation {
	return WORKFLOW_PRESENTATION[metadata.archetype];
}
