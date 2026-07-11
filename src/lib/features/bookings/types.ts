import type { InventoryAllocationWithDetails, CreateAllocationInput } from '$lib/features/inventory/types';
import type { ServiceModules } from '$lib/features/services/modules';

export type BookingStatus = 'pending' | 'confirmed' | 'cancelled';
export type PaymentStatus = 'pending' | 'partial' | 'paid';

export interface BookingClient {
	id: string;
	bookingId: string;
	clientId: string;
	clientFirstName: string;
	clientLastName: string;
	clientPhone: string | null;
	clientEmail: string | null;
	status: 'enrolled' | 'cancelled';
	amountDue: string;
	amountPaid: string;
	paymentStatus: PaymentStatus;
	cancelledAt: Date | null;
	participantCount: number;
	creditSourceId: string | null;
	creditCount: number;
	priceOverride: string | null;
	overrideReason: string | null;
}

export interface BookingParticipant {
	id: string;
	bookingClientId: string | null;
	/** Temporary migration column — do not use */
	bookingIdTemp?: string | null;
	name: string;
	notes: string | null;
	sortOrder: number;
	amountPaid: string;
	paymentStatus: PaymentStatus;
	createdAt: Date;
}

export interface BulkAddParticipantsInput {
	bookingClientId: string;
	names: string[];
	syncToSessions: boolean;
}

export type BookingSource = 'admin' | 'whatsapp_bot';

export interface Booking {
	id: string;
	serviceId: string | null;
	serviceName: string | null;
	serviceType: string | null;
	serviceColor: string | null;
	serviceModules: ServiceModules | null;
	serviceHasSessions: boolean;
	serviceHasRoster: boolean;
	serviceHasDateRange: boolean;
	serviceMaxCapacity: number | null;
	// Instructor for non-session services (rentals, products, accommodation) only
	instructorId: string | null;
	instructorName: string | null;
	allocations: InventoryAllocationWithDetails[];
	date: string;
	dateEnd: string | null;
	serviceEditionId: string | null;
	serviceEditionStartDate: string | null;
	serviceEditionEndDate: string | null;
	serviceEditionMaxCapacity: number | null;
	sessionId: string | null;
	time: string | null;
	quantity: number;
	sessionsIncluded: number | null;
	isFlexible: boolean;
	status: BookingStatus;
	source: BookingSource;
	spotNotes: string | null;
	notes: string | null;
	serviceBasePrice: string | null;
	clients: BookingClient[];
	participants: BookingParticipant[];
	createdAt: Date;
	updatedAt: Date;
}

export interface BookingSummary {
	id: string;
	serviceId: string | null;
	serviceName: string | null;
	serviceType: string | null;
	serviceColor: string | null;
	serviceHasSessions: boolean;
	serviceHasRoster: boolean;
	serviceHasDateRange: boolean;
	serviceHasInventoryUnits: boolean;
	serviceRequiresInstructor: boolean;
	serviceMaxCapacity: number | null;
	// Instructor for non-session services only
	instructorId: string | null;
	instructorName: string | null;
	allocationSummary: string | null;
	date: string;
	dateEnd: string | null;
	serviceEditionId: string | null;
	serviceEditionStartDate: string | null;
	serviceEditionEndDate: string | null;
	time: string | null;
	sessionsIncluded: number | null;
	isFlexible: boolean;
	status: BookingStatus;
	clientCount: number;
	participantCount?: number;
	firstClientName: string | null;
}

/** Extended summary used in the /bookings list page. */
export interface BookingListItem extends BookingSummary {
	sessionCount: number;
	scheduledCount: number;
}

export interface ClientBookingSummary {
	id: string;
	date: string;
	time: string | null;
	serviceId: string | null;
	serviceName: string | null;
	serviceColor: string | null;
	status: BookingStatus;
	participantCount: number;
	amountDue: string;
	amountPaid: string;
	paymentStatus: PaymentStatus;
}

export interface CreateBookingInput {
	serviceId: string;
	quantity?: number;
	/** For non-session services (rentals, products, accommodation) only */
	instructorId?: string;
	allocations?: CreateAllocationInput[];
	date: string;
	dateEnd?: string;
	serviceEditionId?: string;
	/** For non-session services only */
	time?: string;
	sessionsIncluded?: number;
	isFlexible: boolean;
	status?: BookingStatus;
	source?: BookingSource;
	spotNotes?: string;
	notes?: string;
	clients: {
		clientId: string;
		amountDue: string;
		participantCount?: number;  // defaults to 1 if omitted
	}[];
}

export interface UpdateBookingInput {
	quantity?: number;
	/** For non-session services only */
	instructorId?: string | null;
	date?: string;
	dateEnd?: string | null;
	/** For non-session services only */
	time?: string | null;
	sessionsIncluded?: number | null;
	isFlexible?: boolean;
	status?: BookingStatus;
	spotNotes?: string | null;
	notes?: string | null;
}
