import { error, fail } from '@sveltejs/kit';
import {
	cancelBooking,
	deleteBooking,
	getBooking,
	updateBooking,
	updateBookingClientPayment,
	updateBookingClientAmountDue,
	cancelBookingClient,
	reenrollBookingClient,
	addClientToBooking,
	removeClientFromBooking
} from '$lib/features/bookings/queries';
import {
	listSessionsForContext,
	resolveSessionContext,
	assignBookingToSession,
	syncAllParticipantsToEditionSessions,
	createSession,
	updateSession,
	cancelSession,
	deleteSession,
	deleteSessionsForBooking,
	addParticipant,
	removeParticipant,
	renameSessionParticipantsByBookingParticipantId
} from '$lib/features/sessions/queries';
import {
	addParticipant as addEnrollmentParticipant,
	removeParticipant as removeEnrollmentParticipant,
	renameParticipant,
	setEnrollmentParticipantCount,
	listParticipantsForEnrollment,
	syncParticipantCount,
	bulkAddParticipants,
	getParticipantRemovalImpact,
	removeParticipantWithCascade,
	updateParticipantPayment
} from '$lib/features/bookings/participants.queries';
import {
	recalcBookingAmounts,
	applyCreditsToEnrollment,
	removeCreditsFromEnrollment,
	recalcEditionBookingAmounts
} from '$lib/features/bookings/queries';
import {
	getAvailableCreditsForClient,
	getCreditsUsedFromBooking
} from '$lib/features/credits/queries';
import type { CreditSource } from '$lib/features/credits/queries';
import {
	assertBookingHasCapacity,
	getBookingCapacitySnapshot
} from '$lib/features/bookings/capacity.server';
import { getService } from '$lib/features/services/queries';
import { listInstructors } from '$lib/features/instructors/queries';
import { listClients } from '$lib/features/clients/queries';
import type { BookingStatus } from '$lib/features/bookings/types';
import type { Actions, PageServerLoad } from './$types';
import { requireRole, canSeeFinancials } from '$lib/server/permissions';
import { listLinksForService } from '$lib/features/inventory/serviceLinks.queries';
import {
	listItemsByType,
	getInventoryItemType,
	checkAvailability
} from '$lib/features/inventory/queries';
import {
	updateAllocation,
	deleteAllocation,
	createAllocation,
	createAllocations,
	assignParticipantToAllocation
} from '$lib/features/inventory/allocations.queries';
import type { AllocationStatus } from '$lib/features/inventory/types';
import type { PaymentStatus } from '$lib/features/bookings/types';

export const load: PageServerLoad = async ({ params, locals }) => {
	requireRole(locals, 'admin', 'owner', 'manager');
	const [booking, instructors] = await Promise.all([getBooking(params.id), listInstructors()]);
	if (!booking) error(404, 'Booking not found');

	const hasSessions = booking.serviceHasSessions;
	const hasEditions = 'editions' in (booking.serviceModules ?? {});
	const showSessionsCard = hasSessions || hasEditions;
	const [service, clients, sessions] = await Promise.all([
		booking.serviceId ? getService(booking.serviceId) : Promise.resolve(undefined),
		booking.serviceHasRoster ? listClients() : Promise.resolve([]),
		showSessionsCard ? listSessionsForContext(booking) : Promise.resolve([]),
		Promise.resolve([]) // allDateSessions no longer used
	]);

	const ctx = showSessionsCard ? resolveSessionContext(booking) : null;
	// Edition services always show edition UI, even if no specific edition is selected
	const sessionOwnerType: 'booking' | 'service' | 'edition' | null = hasEditions
		? 'edition'
		: (ctx?.type ?? null);

	// Load named participants per enrollment
	const participantsByEnrollment: Record<
		string,
		Awaited<ReturnType<typeof listParticipantsForEnrollment>>
	> = {};
	await Promise.all(
		booking.clients.map(async (bc) => {
			participantsByEnrollment[bc.id] = await listParticipantsForEnrollment(bc.id);
		})
	);

	const serviceInventoryLinks =
		service && 'inventory' in (service.modules ?? {}) ? await listLinksForService(service.id) : [];

	// Load items for all relevant types: existing allocations + service link types (for the add form)
	const allocItemTypeIds = [
		...new Set([
			...booking.allocations.map((a) => a.itemTypeId),
			...serviceInventoryLinks.map((l) => l.itemTypeId)
		])
	];
	const itemsByAllocType: Record<string, Awaited<ReturnType<typeof listItemsByType>>> = {};
	const allocTypeTracking: Record<string, 'pool' | 'specific'> = {};
	await Promise.all(
		allocItemTypeIds.map(async (typeId) => {
			const type = await getInventoryItemType(typeId);
			allocTypeTracking[typeId] = type?.trackingMode ?? 'specific';
			itemsByAllocType[typeId] =
				type?.trackingMode === 'specific' ? await listItemsByType(typeId) : [];
		})
	);

	const capacity = await getBookingCapacitySnapshot(booking);
	const editionEnrolledCount = capacity.scope === 'edition' ? capacity.activeCount : null;
	const editionMaxCapacity = capacity.scope === 'edition' ? capacity.maxCapacity : null;

	const hasCreditsModule = 'credits' in (booking.serviceModules ?? {});

	const [creditsUsedFromThisBooking, availableCreditsPerEnrollment] = await Promise.all([
		hasCreditsModule ? getCreditsUsedFromBooking(params.id) : Promise.resolve(0),
		booking.serviceId
			? (async () => {
					const map: Record<string, CreditSource[]> = {};
					await Promise.all(
						booking.clients.map(async (bc) => {
							map[bc.id] = await getAvailableCreditsForClient(
								bc.clientId,
								booking.serviceId!,
								booking.date
							);
						})
					);
					return map;
				})()
			: Promise.resolve({} as Record<string, CreditSource[]>)
	]);

	return {
		booking,
		instructors,
		service: service ?? null,
		clients,
		sessions,
		allDateSessions: [],
		sessionOwnerType,
		canSeeFinancials: canSeeFinancials(locals),
		userRole: locals.user?.role ?? '',
		itemsByAllocType,
		allocTypeTracking,
		serviceInventoryLinks,
		participantsByEnrollment,
		creditsUsedFromThisBooking,
		availableCreditsPerEnrollment,
		editionEnrolledCount,
		editionMaxCapacity
	};
};

export const actions: Actions = {
	update: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const newStatus = form.get('status')?.toString() as BookingStatus;
		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Not found' });

		const isSessionBased = booking.serviceHasSessions;
		await updateBooking(params.id, {
			...(isSessionBased
				? {}
				: {
						instructorId: form.get('instructorId')?.toString() || null,
						time: form.get('time')?.toString() || null
					}),
			date: form.get('date')?.toString(),
			isFlexible: form.get('isFlexible') === 'true',
			status: newStatus,
			spotNotes: form.get('spotNotes')?.toString() || null,
			notes: form.get('notes')?.toString() || null
		});
		const message = newStatus === 'confirmed' ? 'Booking confirmed' : 'Booking updated';
		return { error: null, message };
	},

	updateNotes: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		await updateBooking(params.id, { notes: form.get('notes')?.toString() || null });
		return { error: null, message: 'Notas guardadas' };
	},

	updatePayment: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		const amountPaid = form.get('amountPaid')?.toString() ?? '0';
		const amountDue = parseFloat(form.get('amountDue')?.toString() ?? '0');
		const paid = parseFloat(amountPaid);
		const status = paid >= amountDue ? 'paid' : paid > 0 ? 'partial' : 'pending';
		if (!bookingClientId) return fail(400, { error: 'Missing booking client id' });
		await updateBookingClientPayment(bookingClientId, amountPaid, status);
		return { error: null, message: 'Payment updated' };
	},

	enroll: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const clientId = form.get('clientId')?.toString() ?? '';
		const amountDue = form.get('amountDue')?.toString() ?? '0';
		if (!clientId) return fail(400, { error: 'Client is required' });

		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Booking not found' });

		const alreadyEnrolled = booking.clients.some((c) => c.clientId === clientId);
		if (alreadyEnrolled) return fail(400, { error: 'Client already enrolled' });
		try {
			await assertBookingHasCapacity(booking, 1);
		} catch (error) {
			return fail(400, { error: (error as Error).message });
		}

		await addClientToBooking(params.id, clientId, amountDue);
		return { error: null, message: 'Student enrolled' };
	},

	unenroll: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const clientId = form.get('clientId')?.toString() ?? '';
		if (!clientId) return fail(400, { error: 'Client is required' });
		await removeClientFromBooking(params.id, clientId);
		return { error: null, message: 'Student removed' };
	},

	cancel: async ({ params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		await cancelBooking(params.id);
		return { cancelled: true, message: 'Booking cancelled' };
	},

	delete: async ({ params, locals }) => {
		requireRole(locals, 'admin', 'owner');
		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Not found' });
		const hasPaid = booking.clients.some((c) => parseFloat(c.amountPaid) > 0);
		if (hasPaid) return fail(400, { error: 'Cannot delete a booking with recorded payments' });
		if (booking.status !== 'cancelled') await cancelBooking(params.id);
		await deleteBooking(params.id);
		return { deleted: true, message: 'Booking deleted' };
	},

	updateAmountDue: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		const amountDue = form.get('amountDue')?.toString() ?? '0';
		if (!bookingClientId) return fail(400, { error: 'Missing booking client id' });
		await updateBookingClientAmountDue(bookingClientId, amountDue);
		return { error: null, message: 'Amount updated' };
	},

	cancelClient: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		if (!bookingClientId) return fail(400, { error: 'Missing booking client id' });
		await cancelBookingClient(bookingClientId);
		return { error: null, message: 'Client enrollment cancelled' };
	},

	reenrollClient: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		if (!bookingClientId) return fail(400, { error: 'Missing booking client id' });
		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Booking not found' });
		const bookingClient = booking.clients.find((client) => client.id === bookingClientId);
		if (!bookingClient) return fail(404, { error: 'Client enrollment not found' });
		if (bookingClient.status === 'cancelled') {
			try {
				await assertBookingHasCapacity(booking, bookingClient.participantCount ?? 1);
			} catch (error) {
				return fail(400, { error: (error as Error).message });
			}
		}
		await reenrollBookingClient(bookingClientId);
		return { error: null, message: 'Client re-enrolled' };
	},

	addServiceSession: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const date = form.get('sessionDate')?.toString() ?? '';
		const time = form.get('sessionTime')?.toString() || undefined;
		const durRaw = form.get('sessionDuration')?.toString();
		const durationMinutes = durRaw ? parseInt(durRaw) : undefined;
		const instructorIds = form.getAll('sessionInstructorId').map(String).filter(Boolean);
		if (!date) return fail(400, { error: 'Session date required' });
		const booking = await getBooking(params.id);
		if (!booking?.serviceId) return fail(400, { error: 'No service linked to booking' });
		const session = await createSession({
			ownerType: 'service',
			serviceId: booking.serviceId,
			date,
			time,
			durationMinutes,
			instructorIds
		});
		await assignBookingToSession(params.id, session.id);
		return { error: null, message: 'Sesión creada y asignada' };
	},

	addSession: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const date = form.get('sessionDate')?.toString() ?? '';
		const time = form.get('sessionTime')?.toString() || undefined;
		const durRaw = form.get('sessionDuration')?.toString();
		const durationMinutes = durRaw ? parseInt(durRaw) : undefined;
		const notes = form.get('sessionNotes')?.toString() || undefined;
		const instructorIds = form.getAll('sessionInstructorId').map(String).filter(Boolean);
		if (!date) return fail(400, { error: 'Session date required' });
		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Booking not found' });
		const ctx = resolveSessionContext(booking);
		if (ctx.type !== 'booking')
			return fail(400, {
				error: 'Sessions are managed at the service level for this booking type'
			});
		await createSession({
			ownerType: 'booking',
			bookingId: params.id,
			date,
			time,
			durationMinutes,
			notes,
			instructorIds
		});
		await recalcBookingAmounts(params.id);
		return { error: null, message: 'Session added' };
	},

	updateSession: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		const time = form.get('sessionTime')?.toString() || null;
		const durRaw = form.get('sessionDuration')?.toString();
		const durationMinutes = durRaw ? parseInt(durRaw) : null;
		const notes = form.get('sessionNotes')?.toString() || null;
		const instructorIds = form.getAll('sessionInstructorId').map(String).filter(Boolean);
		const skillLevelRaw = form.get('sessionLevel')?.toString() || null;
		const skillLevel = (skillLevelRaw as 'beginner' | 'intermediate' | 'advanced' | null) ?? null;
		if (!sessionId) return fail(400, { error: 'Missing session id' });
		await updateSession(sessionId, { time, durationMinutes, notes, instructorIds, skillLevel });
		return { error: null, message: 'Session updated' };
	},

	cancelSession: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		if (!sessionId) return fail(400, { error: 'Missing session id' });
		await cancelSession(sessionId);
		await recalcBookingAmounts(params.id);
		return { error: null, message: 'Session cancelled' };
	},

	deleteSession: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		if (!sessionId) return fail(400, { error: 'Missing session id' });
		await deleteSession(sessionId);
		await recalcBookingAmounts(params.id);
		return { error: null, message: 'Session deleted' };
	},

	assignToSession: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		if (!sessionId) return fail(400, { error: 'sessionId required' });
		try {
			await assignBookingToSession(params.id, sessionId);
		} catch (e) {
			return fail(400, { error: (e as Error).message });
		}
		return { error: null, message: 'Asignado a sesión' };
	},

	unassignFromSession: async ({ params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		await assignBookingToSession(params.id, null);
		return { error: null, message: 'Desasignado' };
	},

	addParticipant: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		const name = form.get('participantName')?.toString().trim() ?? '';
		const bookingParticipantId = form.get('bookingParticipantId')?.toString() || undefined;
		if (!sessionId || !name) return fail(400, { error: 'Session and name are required' });
		await addParticipant({ sessionId, name, bookingParticipantId });
		return { error: null, message: 'Participant added' };
	},

	removeParticipant: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const participantId = form.get('participantId')?.toString() ?? '';
		if (!participantId) return fail(400, { error: 'Missing participant id' });
		await removeParticipant(participantId);
		return { error: null, message: 'Participant removed' };
	},

	bulkGenerateSessions: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Booking not found' });
		if (!booking.dateEnd) return fail(400, { error: 'Booking has no end date' });
		if (!booking.serviceHasSessions) return fail(400, { error: 'Service does not use sessions' });
		const ctx = resolveSessionContext(booking);
		if (ctx.type !== 'booking')
			return fail(400, { error: 'Bulk generate only supported for private lesson bookings' });

		const sessionsPerDay = Math.min(
			6,
			Math.max(1, parseInt(form.get('sessionsPerDay')?.toString() ?? '1'))
		);
		const times = Array.from(
			{ length: sessionsPerDay },
			(_, i) => form.get(`sessionTime_${i}`)?.toString() || undefined
		);
		const weekdaysOnly = form.get('weekdaysOnly') === 'on';
		const clearExisting = form.get('clearExisting') === 'on';
		const durRaw = form.get('sessionDuration')?.toString();
		const durationMinutes = durRaw ? parseInt(durRaw) : undefined;

		if (clearExisting) await deleteSessionsForBooking(params.id);

		const start = new Date(booking.date + 'T00:00:00');
		const end = new Date(booking.dateEnd + 'T00:00:00');
		const toCreate: {
			ownerType: 'booking';
			bookingId: string;
			date: string;
			time?: string;
			durationMinutes?: number;
			sortOrder: number;
		}[] = [];

		for (const d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
			const dow = d.getDay();
			if (weekdaysOnly && (dow === 0 || dow === 6)) continue;
			const dateStr = d.toISOString().slice(0, 10);
			for (let i = 0; i < sessionsPerDay; i++) {
				toCreate.push({
					ownerType: 'booking',
					bookingId: params.id,
					date: dateStr,
					time: times[i],
					durationMinutes,
					sortOrder: i
				});
			}
		}

		await Promise.all(toCreate.map((s) => createSession(s)));
		return { error: null, message: `${toCreate.length} sessions generated` };
	},

	addBookingParticipant: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const name = form.get('name')?.toString().trim() ?? '';
		const addToSessions = form.get('addToSessions') === 'true';
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		const substituteIfPlaceholder = form.get('substituteIfPlaceholder') === 'true';
		if (!name) return fail(400, { error: 'Name is required' });
		if (!bookingClientId) return fail(400, { error: 'Booking client id is required' });

		if (substituteIfPlaceholder) {
			// Replace the first auto-generated placeholder name with the real name
			const existing = await listParticipantsForEnrollment(bookingClientId);
			const placeholder = existing.find((p) => /^Participante \d+/.test(p.name));
			if (placeholder) {
				await renameParticipant(placeholder.id, name);
				await renameSessionParticipantsByBookingParticipantId(placeholder.id, name);
				await recalcBookingAmounts(params.id);
				return { error: null, message: 'Participante actualizado' };
			}
		}

		const booking = await getBooking(params.id);
		const bp = await addEnrollmentParticipant(bookingClientId, name);
		if (addToSessions && booking) {
			const sessions = await listSessionsForContext(booking);
			await Promise.all(
				sessions.map((s) => addParticipant({ sessionId: s.id, name, bookingParticipantId: bp.id }))
			);
		}
		await syncParticipantCount(bookingClientId);
		await recalcBookingAmounts(params.id);
		if (booking?.serviceEditionId) {
			await syncAllParticipantsToEditionSessions(booking.serviceEditionId);
		}
		return { error: null, message: 'Participant added' };
	},

	removeBookingParticipant: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const id = form.get('participantId')?.toString() ?? '';
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		if (!id) return fail(400, { error: 'Missing participant id' });
		await removeEnrollmentParticipant(id);
		if (bookingClientId) await syncParticipantCount(bookingClientId);
		await recalcBookingAmounts(params.id);
		return { error: null, message: 'Participant removed' };
	},

	updateAllocStatus: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const allocId = form.get('allocId')?.toString() ?? '';
		const status = form.get('status')?.toString() as AllocationStatus;
		if (!allocId) return fail(400, { error: 'Missing allocation id' });
		await updateAllocation(allocId, { status });
		return { error: null, message: 'Status updated' };
	},

	reassignAllocItem: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const allocId = form.get('allocId')?.toString() ?? '';
		const itemId = form.get('itemId')?.toString() || null;
		if (!allocId) return fail(400, { error: 'Missing allocation id' });
		await updateAllocation(allocId, { itemId });
		return { error: null, message: 'Item reassigned' };
	},

	removeAlloc: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const allocId = form.get('allocId')?.toString() ?? '';
		if (!allocId) return fail(400, { error: 'Missing allocation id' });
		await deleteAllocation(allocId);
		return { error: null, message: 'Allocation removed' };
	},

	addAlloc: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Booking not found' });
		const itemTypeId = form.get('itemTypeId')?.toString() ?? '';
		if (!itemTypeId) return fail(400, { error: 'Item type required' });
		const qty = parseInt(form.get('quantity')?.toString() ?? '1');
		if (qty < 1) return fail(400, { error: 'Quantity must be at least 1' });
		const bookingParticipantId = form.get('bookingParticipantId')?.toString() || null;

		const type = await getInventoryItemType(itemTypeId);
		if (!type) return fail(400, { error: 'Item type not found' });

		const fuzzy = form.get('fuzzy') === 'true';
		const attrKeys = form.getAll('attrKey').map(String);
		const attrVals = form.getAll('attrVal').map(String);
		const attributeFilter =
			attrKeys.length > 0
				? Object.fromEntries(attrKeys.map((k, i) => [k, attrVals[i] ?? '']))
				: null;

		const startDate = booking.date;
		const endDate = booking.dateEnd ?? null;

		// For specific-tracked types with variant selected: auto-assign items and check availability
		// For fuzzy (no variant chosen) or pool mode: create pending allocation with itemId=null
		if (type.trackingMode === 'specific' && !fuzzy) {
			const avail = await checkAvailability(
				itemTypeId,
				startDate,
				endDate,
				qty,
				undefined,
				params.id
			);
			if (avail.availableCount < qty) {
				return fail(400, { error: `Not enough "${type.name}" available` });
			}
			const itemIds = avail.availableItems.slice(0, qty).map((i) => i.id);
			await createAllocations(
				itemIds.map((itemId) => ({
					bookingId: params.id,
					bookingParticipantId,
					itemTypeId,
					itemId,
					quantity: 1,
					attributeFilter,
					startDate,
					endDate
				}))
			);
		} else {
			await createAllocation({
				bookingId: params.id,
				bookingParticipantId,
				itemTypeId,
				itemId: null,
				quantity: qty,
				attributeFilter,
				startDate,
				endDate
			});
		}
		return { error: null, message: `${qty}× ${type.name} añadidos` };
	},

	setParticipantCount: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const countRaw = form.get('count')?.toString();
		const count = countRaw ? parseInt(countRaw) : 0;
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		if (isNaN(count) || count < 0) return fail(400, { error: 'Invalid count' });
		if (!bookingClientId) return fail(400, { error: 'Booking client id is required' });

		// Look up client name for meaningful default participant names
		const booking = await getBooking(params.id);
		const bc = booking?.clients.find((c) => c.id === bookingClientId);
		const clientFirstName = bc?.clientFirstName ?? undefined;
		if (!booking || !bc) return fail(404, { error: 'Booking enrollment not found' });
		const activeCountForEnrollment = bc.status !== 'cancelled' ? (bc.participantCount ?? 1) : 0;
		const delta = count - activeCountForEnrollment;
		try {
			await assertBookingHasCapacity(booking, delta);
		} catch (error) {
			return fail(400, { error: (error as Error).message });
		}

		await setEnrollmentParticipantCount(bookingClientId, count, clientFirstName);

		// Auto-sync newly created participants to all existing sessions
		if (booking?.serviceEditionId) {
			await syncAllParticipantsToEditionSessions(booking.serviceEditionId);
		} else if (booking) {
			const allParticipants = await listParticipantsForEnrollment(bookingClientId);
			const sessions = await listSessionsForContext(booking);
			if (sessions.length > 0 && allParticipants.length > 0) {
				await Promise.all(
					sessions.map((s) =>
						Promise.all(
							allParticipants.map((p) =>
								addParticipant({ sessionId: s.id, name: p.name, bookingParticipantId: p.id })
							)
						)
					)
				);
			}
		}

		await recalcBookingAmounts(params.id);
		return {
			error: null,
			message: `${count} participante${count !== 1 ? 's' : ''} configurado${count !== 1 ? 's' : ''}`
		};
	},

	renameParticipant: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const id = form.get('participantId')?.toString() ?? '';
		const name = form.get('name')?.toString().trim() ?? '';
		if (!id) return fail(400, { error: 'Missing participant id' });
		if (!name) return fail(400, { error: 'Name required' });
		await renameParticipant(id, name);
		return { error: null, message: 'Participant renamed' };
	},

	syncParticipantsToSessions: async ({ params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Booking not found' });

		if (booking.serviceEditionId) {
			await syncAllParticipantsToEditionSessions(booking.serviceEditionId);
			return { error: null, message: 'Participantes sincronizados' };
		}

		const sessions = await listSessionsForContext(booking);
		if (sessions.length === 0) return { error: null, message: 'No sessions to sync' };

		const participantRows = await Promise.all(
			booking.clients
				.filter((c) => c.status !== 'cancelled')
				.map((c) => listParticipantsForEnrollment(c.id))
		);
		// Dedup by booking_participant id — same person enrolled under multiple clients counts once
		const byId = new Map<string, { id: string; name: string }>();
		for (const p of participantRows.flat()) byId.set(p.id, { id: p.id, name: p.name });
		const participants = [...byId.values()];

		if (participants.length === 0) return { error: null, message: 'No named participants to sync' };
		// onConflictDoNothing in addParticipant makes this safe to run multiple times
		await Promise.all(
			sessions.map((s) =>
				Promise.all(
					participants.map((p) =>
						addParticipant({ sessionId: s.id, name: p.name, bookingParticipantId: p.id })
					)
				)
			)
		);
		return {
			error: null,
			message: `${participants.length} participante${participants.length !== 1 ? 's' : ''} sincronizados a ${sessions.length} sesión${sessions.length !== 1 ? 'es' : ''}`
		};
	},

	recalcPrice: async ({ params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		await recalcBookingAmounts(params.id);
		return { error: null, message: 'Price recalculated' };
	},

	applyCredits: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		const creditSourceId = form.get('creditSourceId')?.toString() ?? '';
		const creditCount = parseInt(form.get('creditCount')?.toString() ?? '0');

		if (!bookingClientId || !creditSourceId || creditCount < 1)
			return fail(400, { error: 'Missing required fields' });

		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Booking not found' });

		const bc = booking.clients.find((c) => c.id === bookingClientId);
		if (!bc) return fail(404, { error: 'Client not found in booking' });
		if (!booking.serviceId) return fail(400, { error: 'Booking has no service' });

		const available = await getAvailableCreditsForClient(
			bc.clientId,
			booking.serviceId,
			booking.date
		);
		const source = available.find((s) => s.bookingId === creditSourceId);
		if (!source)
			return fail(400, { error: 'Credit source not found or not compatible with this service' });
		if (source.expired) return fail(400, { error: 'These credits have expired' });
		if (creditCount > source.creditsRemaining)
			return fail(400, { error: `Only ${source.creditsRemaining} credits remaining` });

		await applyCreditsToEnrollment(bookingClientId, creditSourceId, creditCount);
		await recalcBookingAmounts(params.id);
		return { error: null, message: 'Credits applied' };
	},

	removeCredits: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		if (!bookingClientId) return fail(400, { error: 'Missing booking client id' });

		await removeCreditsFromEnrollment(bookingClientId);
		await recalcBookingAmounts(params.id);
		return { error: null, message: 'Credits removed' };
	},

	updateQuantity: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const quantity = Math.max(1, parseInt(form.get('quantity')?.toString() ?? '1') || 1);
		const booking = await getBooking(params.id);
		if (!booking) return fail(404, { error: 'Not found' });
		await updateBooking(params.id, { quantity });
		const basePrice = parseFloat(booking.serviceBasePrice ?? '0');
		if (basePrice > 0) {
			const newAmount = (basePrice * quantity).toFixed(2);
			for (const bc of booking.clients.filter(c => c.status === 'enrolled')) {
				await updateBookingClientAmountDue(bc.id, newAmount);
			}
		}
		return { message: 'Cantidad actualizada' };
	},

	bulkAddParticipants: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		const rawNames = form.get('names')?.toString() ?? '';
		const syncToSessions = form.get('syncToSessions') === 'true';
		if (!bookingClientId) return fail(400, { error: 'bookingClientId required' });
		const names = rawNames.split('\n').map(n => n.trim()).filter(Boolean);
		if (names.length === 0) return fail(400, { error: 'No names provided' });

		const newParticipants = await bulkAddParticipants(bookingClientId, names);
		if (syncToSessions && newParticipants.length > 0) {
			const booking = await getBooking(params.id);
			if (booking) {
				const sessions = await listSessionsForContext(booking);
				await Promise.all(
					sessions.map(s =>
						Promise.all(
							newParticipants.map(p =>
								addParticipant({ sessionId: s.id, name: p.name, bookingParticipantId: p.id })
							)
						)
					)
				);
			}
		}
		if (newParticipants.length > 0) await syncParticipantCount(bookingClientId);
		await recalcBookingAmounts(params.id);
		return { error: null, message: `${newParticipants.length} participante(s) añadidos` };
	},

	getRemovalImpact: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const participantId = form.get('participantId')?.toString() ?? '';
		if (!participantId) return fail(400, { error: 'participantId required' });
		const impact = await getParticipantRemovalImpact(participantId);
		return { error: null, impact };
	},

	removeParticipantCascade: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const participantId = form.get('participantId')?.toString() ?? '';
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		if (!participantId) return fail(400, { error: 'participantId required' });
		await removeParticipantWithCascade(participantId);
		if (bookingClientId) await syncParticipantCount(bookingClientId);
		await recalcBookingAmounts(params.id);
		return { error: null, message: 'Participante eliminado' };
	},

	updateParticipantPayment: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const participantId = form.get('participantId')?.toString() ?? '';
		const amountPaidStr = form.get('amountPaid')?.toString() ?? '0';
		const amountDue = parseFloat(form.get('amountDue')?.toString() ?? '0');
		if (!participantId) return fail(400, { error: 'participantId required' });
		const paid = parseFloat(amountPaidStr);
		const paymentStatus: PaymentStatus =
			paid >= amountDue ? 'paid' : paid > 0 ? 'partial' : 'pending';
		await updateParticipantPayment(participantId, amountPaidStr, paymentStatus);
		return { error: null, message: 'Pago actualizado' };
	},

	assignInventoryParticipant: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const allocationId = form.get('allocationId')?.toString() ?? '';
		const bookingParticipantId = form.get('bookingParticipantId')?.toString() || null;
		if (!allocationId) return fail(400, { error: 'allocationId required' });
		await assignParticipantToAllocation(allocationId, bookingParticipantId);
		return { error: null, message: 'Equipo asignado' };
	}
};
