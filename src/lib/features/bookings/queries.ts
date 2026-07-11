// src/lib/features/bookings/queries.ts
import { and, count, eq, gte, lte, desc, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import { calculateAmount, defaultPricingMode, billableParticipants } from '$lib/utils/pricing';
import { db } from '$lib/server/db';
import {
	bookings,
	bookingClients,
	bookingInstructors,
	bookingSessions,
	clients,
	services,
	serviceEditions,
	sessions,
	inventoryAllocations,
	inventoryItemTypes,
	inventoryItems
} from '$lib/server/db/schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import type { Service } from '$lib/features/services/types';
import type {
	Booking,
	BookingClient,
	BookingListItem,
	BookingSummary,
	ClientBookingSummary,
	CreateBookingInput,
	UpdateBookingInput
} from './types';
import { listAllocationsForBooking } from '$lib/features/inventory/allocations.queries';
import { getService } from '$lib/features/services/queries';

function formatAllocationSummary(
	itemName: string | null,
	typeName: string | null,
	quantity: number | null
): string | null {
	if (!typeName) return null;
	if (itemName) return itemName;
	if (quantity && quantity > 1) return `${quantity}× ${typeName}`;
	return typeName;
}

async function fetchAllocationSummaries(ids: string[]): Promise<Record<string, string | null>> {
	if (ids.length === 0) return {};
	const rows = await db
		.select({
			bookingId: inventoryAllocations.bookingId,
			itemTypeName: inventoryItemTypes.name,
			itemName: inventoryItems.name,
			quantity: inventoryAllocations.quantity
		})
		.from(inventoryAllocations)
		.leftJoin(inventoryItemTypes, eq(inventoryAllocations.itemTypeId, inventoryItemTypes.id))
		.leftJoin(inventoryItems, eq(inventoryAllocations.itemId, inventoryItems.id))
		.where(inArray(inventoryAllocations.bookingId, ids));

	const result: Record<string, string | null> = {};
	for (const r of rows) {
		if (!result[r.bookingId]) {
			result[r.bookingId] = formatAllocationSummary(r.itemName ?? null, r.itemTypeName ?? null, r.quantity);
		}
	}
	return result;
}

async function attachInstructorsToBookings<T extends { id: string }>(
	rows: T[]
): Promise<(T & { instructorId: string | null; instructorName: string | null })[]> {
	if (rows.length === 0) return rows.map(r => ({ ...r, instructorId: null, instructorName: null }));

	const ids = rows.map(r => r.id);
	const instrRows = await db
		.select({
			bookingId: bookingInstructors.bookingId,
			instructorId: bookingInstructors.instructorId,
			instructorName: userTable.name
		})
		.from(bookingInstructors)
		.leftJoin(userTable, eq(bookingInstructors.instructorId, userTable.id))
		.where(inArray(bookingInstructors.bookingId, ids));

	const byBooking: Record<string, { instructorId: string; instructorName: string | null }> = {};
	for (const r of instrRows) {
		if (!byBooking[r.bookingId]) {
			byBooking[r.bookingId] = { instructorId: r.instructorId, instructorName: r.instructorName };
		}
	}

	return rows.map(r => ({
		...r,
		instructorId: byBooking[r.id]?.instructorId ?? null,
		instructorName: byBooking[r.id]?.instructorName ?? null
	}));
}

export async function listBookingsForDateRange(
	from: string,
	to: string
): Promise<BookingSummary[]> {
	const rows = await db
		.select({
			id: bookings.id,
			serviceId: bookings.serviceId,
			serviceName: services.name,
			serviceType: services.type,
			serviceColor: services.color,
			serviceModules: services.modules,
			serviceMaxCapacity: services.maxCapacity,
			allocationSummary: sql<string | null>`null`,
			date: bookings.date,
			dateEnd: bookings.dateEnd,
			serviceEditionId: bookings.serviceEditionId,
			serviceEditionStartDate: serviceEditions.startDate,
			serviceEditionEndDate: serviceEditions.endDate,
			time: bookings.time,
			sessionsIncluded: bookings.sessionsIncluded,
			isFlexible: bookings.isFlexible,
			status: bookings.status
		})
		.from(bookings)
		.leftJoin(services, eq(bookings.serviceId, services.id))
		.leftJoin(serviceEditions, eq(bookings.serviceEditionId, serviceEditions.id))
		// Overlap: booking starts before range ends AND booking ends (or is same-day) after range starts
		.where(and(
			lte(bookings.date, to),
			gte(sql`COALESCE(${bookings.dateEnd}, ${bookings.date})`, from)
		))
		.orderBy(bookings.date, bookings.time);

	const withInstructors = await attachInstructorsToBookings(rows);

	const ids = withInstructors.map(r => r.id);
	const allocationSummaries = await fetchAllocationSummaries(ids);
	const counts: Record<string, number> = {};
	const firstClientNames: Record<string, string> = {};
	if (ids.length > 0) {
		const clientRows = await db
			.select({ bookingId: bookingClients.bookingId, firstName: clients.firstName })
			.from(bookingClients)
			.leftJoin(clients, eq(bookingClients.clientId, clients.id))
			.where(inArray(bookingClients.bookingId, ids));
		for (const row of clientRows) {
			counts[row.bookingId] = (counts[row.bookingId] ?? 0) + 1;
			if (!firstClientNames[row.bookingId] && row.firstName) firstClientNames[row.bookingId] = row.firstName;
		}
	}

	return withInstructors.map(r => ({
		...r,
		serviceHasSessions: 'sessions' in (r.serviceModules ?? {}),
		serviceHasRoster: 'roster' in (r.serviceModules ?? {}),
		serviceHasDateRange: 'editions' in (r.serviceModules ?? {}),
		serviceHasInventoryUnits: 'inventory' in (r.serviceModules ?? {}),
		serviceRequiresInstructor: (r.serviceModules as { instructor?: { required?: boolean } } | null)?.instructor?.required ?? false,
		allocationSummary: allocationSummaries[r.id] ?? null,
		clientCount: counts[r.id] ?? 0,
		firstClientName: firstClientNames[r.id] ?? null
	})) as BookingSummary[];
}

export async function listBookingsForRun(runId: string): Promise<BookingSummary[]> {
	// Fetch edition to get serviceId + dates for overlap matching
	const [edition] = await db
		.select({ serviceId: serviceEditions.serviceId, startDate: serviceEditions.startDate, endDate: serviceEditions.endDate })
		.from(serviceEditions)
		.where(eq(serviceEditions.id, runId))
		.limit(1);
	if (!edition) return [];

	const rows = await db
		.select({
			id: bookings.id,
			serviceId: bookings.serviceId,
			serviceName: services.name,
			serviceType: services.type,
			serviceColor: services.color,
			serviceModules: services.modules,
			serviceMaxCapacity: services.maxCapacity,
			allocationSummary: sql<string | null>`null`,
			date: bookings.date,
			dateEnd: bookings.dateEnd,
			serviceEditionId: bookings.serviceEditionId,
			serviceEditionStartDate: serviceEditions.startDate,
			serviceEditionEndDate: serviceEditions.endDate,
			time: bookings.time,
			sessionsIncluded: bookings.sessionsIncluded,
			isFlexible: bookings.isFlexible,
			status: bookings.status
		})
		.from(bookings)
		.leftJoin(services, eq(bookings.serviceId, services.id))
		.leftJoin(serviceEditions, eq(bookings.serviceEditionId, serviceEditions.id))
		.where(and(
			ne(bookings.status, 'cancelled'),
			or(
				// Exact edition link
				eq(bookings.serviceEditionId, runId),
				// Overlap: same service, no edition set, dates overlap this run
				and(
					eq(bookings.serviceId, edition.serviceId),
					isNull(bookings.serviceEditionId),
					lte(bookings.date, edition.endDate),
					gte(sql`COALESCE(${bookings.dateEnd}, ${bookings.date})`, edition.startDate)
				)
			)
		))
		.orderBy(bookings.date, bookings.createdAt);

	const withInstructors = await attachInstructorsToBookings(rows);
	const ids = withInstructors.map(r => r.id);
	const allocationSummaries = await fetchAllocationSummaries(ids);
	const counts: Record<string, number> = {};
	const participantCounts: Record<string, number> = {};
	const firstClientNames: Record<string, string> = {};
	if (ids.length > 0) {
		const clientRows = await db
			.select({ bookingId: bookingClients.bookingId, firstName: clients.firstName, participantCount: bookingClients.participantCount })
			.from(bookingClients)
			.leftJoin(clients, eq(bookingClients.clientId, clients.id))
			.where(and(inArray(bookingClients.bookingId, ids), eq(bookingClients.status, 'enrolled')));
		for (const row of clientRows) {
			counts[row.bookingId] = (counts[row.bookingId] ?? 0) + 1;
			participantCounts[row.bookingId] = (participantCounts[row.bookingId] ?? 0) + (row.participantCount ?? 1);
			if (!firstClientNames[row.bookingId] && row.firstName) firstClientNames[row.bookingId] = row.firstName;
		}
	}
	return withInstructors.map(r => ({
		...r,
		serviceHasSessions: 'sessions' in (r.serviceModules ?? {}),
		serviceHasRoster: 'roster' in (r.serviceModules ?? {}),
		serviceHasDateRange: 'editions' in (r.serviceModules ?? {}),
		serviceHasInventoryUnits: 'inventory' in (r.serviceModules ?? {}),
		serviceRequiresInstructor: (r.serviceModules as { instructor?: { required?: boolean } } | null)?.instructor?.required ?? false,
		allocationSummary: allocationSummaries[r.id] ?? null,
		clientCount: counts[r.id] ?? 0,
		participantCount: participantCounts[r.id] ?? 0,
		firstClientName: firstClientNames[r.id] ?? null
	})) as BookingSummary[];
}

export async function listAllBookings(opts?: {
	from?: string; to?: string; serviceFilter?: string; statusFilter?: string;
}): Promise<BookingListItem[]> {
	const conditions = [];
	if (opts?.from)           conditions.push(gte(bookings.date, opts.from));
	if (opts?.to)             conditions.push(lte(bookings.date, opts.to));
	if (opts?.statusFilter && opts.statusFilter !== 'all')
		conditions.push(eq(bookings.status, opts.statusFilter as 'confirmed' | 'pending' | 'cancelled'));

	const rows = await db
		.select({
			id: bookings.id,
			serviceId: bookings.serviceId,
			serviceName: services.name,
			serviceType: services.type,
			serviceColor: services.color,
			serviceModules: services.modules,
			serviceMaxCapacity: services.maxCapacity,
			allocationSummary: sql<string | null>`null`,
			date: bookings.date,
			dateEnd: bookings.dateEnd,
			serviceEditionId: bookings.serviceEditionId,
			serviceEditionStartDate: serviceEditions.startDate,
			serviceEditionEndDate: serviceEditions.endDate,
			time: bookings.time,
			sessionsIncluded: bookings.sessionsIncluded,
			isFlexible: bookings.isFlexible,
			status: bookings.status
		})
		.from(bookings)
		.leftJoin(services, eq(bookings.serviceId, services.id))
		.leftJoin(serviceEditions, eq(bookings.serviceEditionId, serviceEditions.id))
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(desc(bookings.date));

	const withInstructors = await attachInstructorsToBookings(rows);
	const ids = withInstructors.map(r => r.id);
	if (ids.length === 0) return [];

	const allocationSummaries = await fetchAllocationSummaries(ids);

	const [clientRows, sessionRows] = await Promise.all([
		db.select({ bookingId: bookingClients.bookingId, firstName: clients.firstName })
			.from(bookingClients)
			.leftJoin(clients, eq(bookingClients.clientId, clients.id))
			.where(inArray(bookingClients.bookingId, ids)),
		db.select({
			bookingId: bookingSessions.bookingId,
			sessionId: bookingSessions.sessionId,
			status: sessions.status
		})
			.from(bookingSessions)
			.leftJoin(sessions, eq(bookingSessions.sessionId, sessions.id))
			.where(inArray(bookingSessions.bookingId, ids))
	]);

	const counts: Record<string, number> = {};
	const firstClientNames: Record<string, string> = {};
	for (const r of clientRows) {
		counts[r.bookingId] = (counts[r.bookingId] ?? 0) + 1;
		if (!firstClientNames[r.bookingId] && r.firstName) firstClientNames[r.bookingId] = r.firstName;
	}

	const sessionCounts: Record<string, number> = {};
	const scheduledCounts: Record<string, number> = {};
	for (const r of sessionRows) {
		sessionCounts[r.bookingId] = (sessionCounts[r.bookingId] ?? 0) + 1;
		if (r.status === 'scheduled') scheduledCounts[r.bookingId] = (scheduledCounts[r.bookingId] ?? 0) + 1;
	}

	return withInstructors.map(r => ({
		...r,
		serviceHasSessions: 'sessions' in (r.serviceModules ?? {}),
		serviceHasRoster: 'roster' in (r.serviceModules ?? {}),
		serviceHasDateRange: 'editions' in (r.serviceModules ?? {}),
		serviceHasInventoryUnits: 'inventory' in (r.serviceModules ?? {}),
		serviceRequiresInstructor: (r.serviceModules as { instructor?: { required?: boolean } } | null)?.instructor?.required ?? false,
		allocationSummary: allocationSummaries[r.id] ?? null,
		clientCount: counts[r.id] ?? 0,
		firstClientName: firstClientNames[r.id] ?? null,
		sessionCount: sessionCounts[r.id] ?? 0,
		scheduledCount: scheduledCounts[r.id] ?? 0
	})) as BookingListItem[];
}

export async function getBooking(id: string): Promise<Booking | undefined> {
	const [booking] = await db
		.select({
			id: bookings.id,
			serviceId: bookings.serviceId,
			serviceName: services.name,
			serviceType: services.type,
			serviceColor: services.color,
			serviceModules: services.modules,
			serviceMaxCapacity: services.maxCapacity,
			date: bookings.date,
			dateEnd: bookings.dateEnd,
			serviceEditionId: bookings.serviceEditionId,
			serviceEditionStartDate: serviceEditions.startDate,
			serviceEditionEndDate: serviceEditions.endDate,
			serviceEditionMaxCapacity: serviceEditions.maxCapacity,
			sessionId: bookings.sessionId,
			time: bookings.time,
			quantity: bookings.quantity,
			sessionsIncluded: bookings.sessionsIncluded,
			isFlexible: bookings.isFlexible,
			status: bookings.status,
			source: bookings.source,
			spotNotes: bookings.spotNotes,
			notes: bookings.notes,
			serviceBasePrice: services.basePrice,
			createdAt: bookings.createdAt,
			updatedAt: bookings.updatedAt
		})
		.from(bookings)
		.leftJoin(services, eq(bookings.serviceId, services.id))
		.leftJoin(serviceEditions, eq(bookings.serviceEditionId, serviceEditions.id))
		.where(eq(bookings.id, id));

	if (!booking) return undefined;

	const [instrRow] = await db
		.select({ instructorId: bookingInstructors.instructorId, instructorName: userTable.name })
		.from(bookingInstructors)
		.leftJoin(userTable, eq(bookingInstructors.instructorId, userTable.id))
		.where(eq(bookingInstructors.bookingId, id))
		.limit(1);

	const bookingClientRows = await db
		.select({
			id: bookingClients.id,
			bookingId: bookingClients.bookingId,
			clientId: bookingClients.clientId,
			clientFirstName: clients.firstName,
			clientLastName: clients.lastName,
			clientPhone: clients.phone,
			clientEmail: clients.email,
			status: bookingClients.status,
			amountDue: bookingClients.amountDue,
			amountPaid: bookingClients.amountPaid,
			paymentStatus: bookingClients.paymentStatus,
			cancelledAt: bookingClients.cancelledAt,
			participantCount: bookingClients.participantCount,
			creditSourceId: bookingClients.creditSourceId,
			creditCount: bookingClients.creditCount,
			priceOverride: bookingClients.priceOverride,
			overrideReason: bookingClients.overrideReason
		})
		.from(bookingClients)
		.leftJoin(clients, eq(bookingClients.clientId, clients.id))
		.where(eq(bookingClients.bookingId, id));

	const allocations = await listAllocationsForBooking(booking.id);
	return {
		...booking,
		serviceHasSessions: 'sessions' in (booking.serviceModules ?? {}),
		serviceHasRoster: 'roster' in (booking.serviceModules ?? {}),
		serviceHasDateRange: 'editions' in (booking.serviceModules ?? {}),
		instructorId: instrRow?.instructorId ?? null,
		instructorName: instrRow?.instructorName ?? null,
		clients: bookingClientRows,
		participants: [],
		allocations
	} as Booking;
}

export async function getBookingsForClient(clientId: string): Promise<ClientBookingSummary[]> {
	const rows = await db
		.select({
			id: bookings.id,
			date: bookings.date,
			time: bookings.time,
			serviceId: bookings.serviceId,
			serviceName: services.name,
			serviceColor: services.color,
			status: bookings.status,
			participantCount: bookingClients.participantCount,
			amountDue: bookingClients.amountDue,
			amountPaid: bookingClients.amountPaid,
			paymentStatus: bookingClients.paymentStatus
		})
		.from(bookingClients)
		.innerJoin(bookings, eq(bookingClients.bookingId, bookings.id))
		.leftJoin(services, eq(bookings.serviceId, services.id))
		.where(and(eq(bookingClients.clientId, clientId), eq(bookingClients.status, 'enrolled')))
		.orderBy(desc(bookings.date));
	return rows;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
	const [booking] = await db
		.insert(bookings)
		.values({
			serviceId: input.serviceId,
			quantity: input.quantity ?? 1,
			serviceEditionId: input.serviceEditionId,
			date: input.date,
			dateEnd: input.dateEnd,
			time: input.time,
			sessionsIncluded: input.sessionsIncluded,
			isFlexible: input.isFlexible,
			status: input.status ?? (input.source === 'whatsapp_bot' ? 'pending' : 'confirmed'),
			source: input.source ?? 'admin',
			spotNotes: input.spotNotes,
			notes: input.notes
		})
		.returning();

	if (input.instructorId) {
		await db.insert(bookingInstructors).values({
			bookingId: booking.id,
			instructorId: input.instructorId
		});
	}

	if (input.clients.length > 0) {
		await db.insert(bookingClients).values(
			input.clients.map((c) => ({
				bookingId: booking.id,
				clientId: c.clientId,
				amountDue: c.amountDue,
				amountPaid: '0',
				paymentStatus: 'pending' as const,
				participantCount: c.participantCount ?? 1
			}))
		);
	}

	if (input.allocations && input.allocations.length > 0) {
		const { createAllocations } = await import('$lib/features/inventory/allocations.queries');
		await createAllocations(input.allocations.map((a) => ({ ...a, bookingId: booking.id })));
	}

	return (await getBooking(booking.id))!;
}

/** Count enrolled clients across all active bookings for a service. Used for capacity checks. */
export async function countEnrolledClientsForService(serviceId: string): Promise<number> {
	const [row] = await db
		.select({ total: sql<string>`COALESCE(SUM(${bookingClients.participantCount}), 0)` })
		.from(bookingClients)
		.innerJoin(bookings, eq(bookingClients.bookingId, bookings.id))
		.where(and(
			eq(bookings.serviceId, serviceId),
			ne(bookings.status, 'cancelled'),
			eq(bookingClients.status, 'enrolled')
		));
	return parseInt(row?.total ?? '0');
}

/** For camps: find the single booking for this service+date, or create it (empty, no clients yet). */
export async function getOrCreateCampBooking(
	serviceId: string,
	startDate: string,
	endDate: string
): Promise<Booking> {
	const [existing] = await db
		.select({ id: bookings.id })
		.from(bookings)
		.where(and(
			eq(bookings.serviceId, serviceId),
			eq(bookings.date, startDate),
			ne(bookings.status, 'cancelled')
		))
		.limit(1);

	if (existing) return (await getBooking(existing.id))!;

	const [created] = await db
		.insert(bookings)
		.values({
			serviceId,
			date: startDate,
			dateEnd: endDate,
			isFlexible: false,
			status: 'confirmed'
		})
		.returning();

	return (await getBooking(created.id))!;
}

/** Enroll a single client in an existing booking (camp roster add). */
export async function addClientToBooking(
	bookingId: string,
	clientId: string,
	amountDue: string
): Promise<void> {
	await db.insert(bookingClients).values({
		bookingId,
		clientId,
		amountDue,
		amountPaid: '0',
		paymentStatus: 'pending'
	});
}

/** Remove a client from a booking (camp unenroll). */
export async function removeClientFromBooking(
	bookingId: string,
	clientId: string
): Promise<void> {
	await db
		.delete(bookingClients)
		.where(and(eq(bookingClients.bookingId, bookingId), eq(bookingClients.clientId, clientId)));
}

export async function updateBooking(id: string, input: UpdateBookingInput): Promise<Booking> {
	const { instructorId, ...rest } = input;
	await db
		.update(bookings)
		.set({ ...rest, updatedAt: new Date() })
		.where(eq(bookings.id, id));

	if (instructorId !== undefined) {
		await db.delete(bookingInstructors).where(eq(bookingInstructors.bookingId, id));
		if (instructorId) {
			await db.insert(bookingInstructors).values({ bookingId: id, instructorId });
		}
	}

	return (await getBooking(id))!;
}

export async function updateBookingClientPayment(
	bookingClientId: string,
	amountPaid: string,
	paymentStatus: 'pending' | 'partial' | 'paid'
): Promise<void> {
	await db
		.update(bookingClients)
		.set({ amountPaid, paymentStatus })
		.where(eq(bookingClients.id, bookingClientId));
}

export async function updateBookingClientAmountDue(
	bookingClientId: string,
	amountDue: string
): Promise<void> {
	const due = parseFloat(amountDue);
	const [bc] = await db.select({ amountPaid: bookingClients.amountPaid }).from(bookingClients).where(eq(bookingClients.id, bookingClientId));
	const paid = parseFloat(bc?.amountPaid ?? '0');
	const paymentStatus = paid >= due ? 'paid' : paid > 0 ? 'partial' : 'pending';
	await db.update(bookingClients).set({ amountDue, paymentStatus }).where(eq(bookingClients.id, bookingClientId));
}

export async function cancelBookingClient(bookingClientId: string): Promise<void> {
	await db
		.update(bookingClients)
		.set({ status: 'cancelled', cancelledAt: new Date() })
		.where(eq(bookingClients.id, bookingClientId));
}

export async function reenrollBookingClient(bookingClientId: string): Promise<void> {
	await db
		.update(bookingClients)
		.set({ status: 'enrolled', cancelledAt: null })
		.where(eq(bookingClients.id, bookingClientId));
}

export async function cancelBooking(id: string): Promise<void> {
	// Cancel the booking
	await db.update(bookings).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(bookings.id, id));

	// Cancel sessions that are exclusively linked to this booking (not shared with others)
	const links = await db
		.select({ sessionId: bookingSessions.sessionId })
		.from(bookingSessions)
		.where(eq(bookingSessions.bookingId, id));

	for (const { sessionId } of links) {
		const otherActiveLinks = await db
			.select({ id: bookingSessions.id })
			.from(bookingSessions)
			.innerJoin(bookings, eq(bookingSessions.bookingId, bookings.id))
			.where(and(
				eq(bookingSessions.sessionId, sessionId),
				ne(bookingSessions.bookingId, id),
				ne(bookings.status, 'cancelled')
			))
			.limit(1);

		if (otherActiveLinks.length === 0) {
			// No other active booking holds this session — cancel it
			await db.update(sessions)
				.set({ status: 'cancelled', updatedAt: new Date() })
				.where(eq(sessions.id, sessionId));
		}
	}
}

export async function deleteBooking(id: string): Promise<void> {
	// Delete sessions exclusive to this booking before deleting the booking
	const links = await db
		.select({ sessionId: bookingSessions.sessionId })
		.from(bookingSessions)
		.where(eq(bookingSessions.bookingId, id));

	for (const { sessionId } of links) {
		const otherLinks = await db
			.select({ id: bookingSessions.id })
			.from(bookingSessions)
			.where(and(eq(bookingSessions.sessionId, sessionId), ne(bookingSessions.bookingId, id)))
			.limit(1);

		if (otherLinks.length === 0) {
			await db.delete(sessions).where(eq(sessions.id, sessionId));
		}
	}

	// Deleting the booking cascades: booking_clients, booking_sessions
	await db.delete(bookings).where(eq(bookings.id, id));
}

/**
 * Recalculate amountDue for every active bookingClient based on the service's
 * pricingMode, current participant count, sessions included, and booking duration.
 * Preserves amountPaid and updates paymentStatus accordingly.
 * Called after participant count or session count changes.
 */
export async function recalcBookingAmounts(bookingId: string): Promise<void> {
	const booking = await getBooking(bookingId);
	if (!booking?.serviceId) return;

	const service = await getService(booking.serviceId);
	if (!service) return;

	const activeClients = booking.clients.filter(c => c.status !== 'cancelled');
	// Total participant count across all enrolled booking clients
	const participantCount = activeClients.reduce((sum, c) => sum + (c.participantCount ?? 1), 0) || 1;

	// Use actual non-cancelled session count; fall back to sessionsIncluded from booking creation
	const linkedSessions = await db
		.select({ status: sessions.status })
		.from(bookingSessions)
		.leftJoin(sessions, eq(bookingSessions.sessionId, sessions.id))
		.where(eq(bookingSessions.bookingId, bookingId));
	const actualSessionCount = linkedSessions.filter(s => s.status !== 'cancelled').length;
	const sessionCount = actualSessionCount > 0 ? actualSessionCount : (booking.sessionsIncluded ?? 1);

	let days = 1;
	if (booking.dateEnd) {
		const d1 = new Date(booking.date + 'T00:00:00');
		const d2 = new Date(booking.dateEnd + 'T00:00:00');
		days = Math.max(1, Math.round((d2.getTime() - d1.getTime()) / 86_400_000));
	}

	const basePrice = parseFloat(service.basePrice);
	// Fall back to smart default when pricingMode not set (e.g. legacy services).
	const mode = service.pricingMode ?? defaultPricingMode(service.modules ?? {});

	for (const bc of activeClients) {
		const billable = billableParticipants(bc);
		const amountDue = billable === 0
			? '0.00'
			: calculateAmount(basePrice, mode, { participants: billable, sessions: sessionCount, days }).toFixed(2);
		const paid = parseFloat(bc.amountPaid);
		const due = parseFloat(amountDue);
		const paymentStatus: 'pending' | 'partial' | 'paid' =
			paid >= due ? 'paid' : paid > 0 ? 'partial' : 'pending';
		await db.update(bookingClients).set({ amountDue, paymentStatus }).where(eq(bookingClients.id, bc.id));
	}
}

export async function applyCreditsToEnrollment(
	bookingClientId: string,
	creditSourceId: string,
	creditCount: number
): Promise<void> {
	await db
		.update(bookingClients)
		.set({ creditSourceId, creditCount })
		.where(eq(bookingClients.id, bookingClientId));
}

export async function removeCreditsFromEnrollment(bookingClientId: string): Promise<void> {
	await db
		.update(bookingClients)
		.set({ creditSourceId: null, creditCount: 0 })
		.where(eq(bookingClients.id, bookingClientId));
}

/**
 * Recalculate amounts for all active bookings in an edition.
 * Finds all non-cancelled bookings for the given edition and recalculates their amounts.
 */
export async function recalcEditionBookingAmounts(editionId: string): Promise<void> {
	const editionBookings = await db
		.select({ id: bookings.id })
		.from(bookings)
		.where(and(eq(bookings.serviceEditionId, editionId), ne(bookings.status, 'cancelled')));
	await Promise.all(editionBookings.map(b => recalcBookingAmounts(b.id)));
}
