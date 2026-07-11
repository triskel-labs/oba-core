import { error, fail, redirect } from '@sveltejs/kit';
import {
	getSession,
	updateSession,
	cancelSession,
	deleteSession,
	listEnrollmentsForSession,
	listEnrollmentsForEdition,
	listUnassignedEnrollments,
	listBookingsForServiceDate,
	listParticipantsWithContext,
	assignBookingToSession,
	addParticipant,
	removeParticipant,
	renameSessionParticipant
} from '$lib/features/sessions/queries';
import { getService } from '$lib/features/services/queries';
import { getServiceEdition } from '$lib/features/services/editions.queries';
import { getBooking } from '$lib/features/bookings/queries';
import { listInstructors } from '$lib/features/instructors/queries';
import { listAllocationsForBooking } from '$lib/features/inventory/allocations.queries';
import { listLinksForService } from '$lib/features/inventory/serviceLinks.queries';
import { requireRole } from '$lib/server/permissions';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	requireRole(locals, 'admin', 'owner', 'manager');

	const session = await getSession(params.id);
	if (!session) error(404, 'Session not found');

	let serviceId: string | null = null;
	let serviceName: string | null = null;
	let serviceColor: string | null = null;
	let editionId: string | null = null;
	let serviceDurationMinutes: number | null = null;
	let backLink = '/calendar';
	let backLabel = 'Calendario';
	let bookingClientName: string | null = null;

	if (session.ownerType === 'service' && session.serviceId) {
		const svc = await getService(session.serviceId);
		serviceId = session.serviceId;
		serviceName = svc?.name ?? null;
		serviceColor = svc?.color ?? null;
		serviceDurationMinutes = svc?.durationMinutes ?? null;
		backLink = `/services/${serviceId}/sessions/`;
		backLabel = serviceName ?? 'Sesiones';
	} else if (session.ownerType === 'edition' && session.serviceEditionId) {
		const edition = await getServiceEdition(session.serviceEditionId);
		if (edition) {
			const svc = await getService(edition.serviceId);
			serviceId = edition.serviceId;
			editionId = edition.id;
			serviceName = svc?.name ?? null;
			serviceColor = svc?.color ?? null;
			serviceDurationMinutes = svc?.durationMinutes ?? null;
			backLink = `/services/${serviceId}/roster?run=${editionId}`;
			backLabel = serviceName ?? 'Campamento';
		}
	} else if (session.ownerType === 'booking' && session.bookingId) {
		const booking = await getBooking(session.bookingId);
		if (booking) {
			const svc = await getService(booking.serviceId!);
			serviceId = booking.serviceId ?? null;
			serviceName = booking.serviceName ?? null;
			serviceColor = booking.serviceColor ?? null;
			serviceDurationMinutes = svc?.durationMinutes ?? null;
			backLink = `/bookings/${session.bookingId}`;
			const firstClient = booking.clients?.[0];
			backLabel = [firstClient?.clientFirstName, firstClient?.clientLastName].filter(Boolean).join(' ') || 'Reserva';
			bookingClientName = backLabel;
		}
	}

	// Allow caller to specify a custom back destination via ?from= query param
	const fromParam = url.searchParams.get('from');
	if (fromParam?.startsWith('/')) {
		backLink = fromParam;
		if (fromParam.startsWith('/calendar')) backLabel = 'Calendario';
	}

	const [enrollments, instructors, assignableBookings, participants] = await Promise.all([
		session.ownerType === 'edition' && editionId
			? listEnrollmentsForEdition(editionId)
			: listEnrollmentsForSession(params.id),
		listInstructors(),
		session.ownerType === 'service' && session.serviceId
			? listBookingsForServiceDate(session.serviceId, session.date, params.id)
			: Promise.resolve([]),
		listParticipantsWithContext(params.id)
	]);

	// Deduplicate to one row per booking (joins return one row per enrolled client)
	const seenBookings = new Set<string>();
	const assignableBookingsSummary = assignableBookings
		.filter(u => { if (seenBookings.has(u.bookingId)) return false; seenBookings.add(u.bookingId); return true; });

	// For booking sessions: load allocations + service inventory links for inline display
	let bookingAllocations: Awaited<ReturnType<typeof listAllocationsForBooking>> = [];
	let serviceInventoryLinks: Awaited<ReturnType<typeof listLinksForService>> = [];
	if (session.ownerType === 'booking' && session.bookingId) {
		const [allocs, links] = await Promise.all([
			listAllocationsForBooking(session.bookingId),
			serviceId ? listLinksForService(serviceId) : Promise.resolve([])
		]);
		bookingAllocations = allocs;
		serviceInventoryLinks = links;
	}

	// For group sessions: load allocations per enrolled booking
	const enrollmentAllocations: Record<string, Awaited<ReturnType<typeof listAllocationsForBooking>>> = {};
	if (session.ownerType !== 'booking') {
		const activeEnrolls = enrollments.filter(e => e.status !== 'cancelled');
		await Promise.all(
			activeEnrolls.map(async e => {
				enrollmentAllocations[e.bookingId] = await listAllocationsForBooking(e.bookingId);
			})
		);
	}

	const effectiveDuration = session.durationMinutes ?? serviceDurationMinutes ?? 60;

	return {
		session: { ...session, effectiveDuration },
		serviceId,
		serviceName,
		serviceColor,
		editionId,
		enrollments,
		instructors,
		backLink,
		backLabel,
		bookingClientName,
		assignableBookings: assignableBookingsSummary,
		participants,
		bookingAllocations,
		serviceInventoryLinks,
		enrollmentAllocations
	};
};

export const actions: Actions = {
	updateSession: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		await updateSession(params.id, {
			time:            form.get('time')?.toString() || null,
			durationMinutes: form.get('durationMinutes') ? parseInt(form.get('durationMinutes')!.toString()) : null,
			notes:           form.get('notes')?.toString() || null,
			skillLevel:      (form.get('skillLevel')?.toString() || null) as any,
			instructorIds:   form.getAll('instructorId').map(String).filter(Boolean)
		});
		return { error: null, message: 'Sesión actualizada' };
	},

	cancelSession: async ({ params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		await cancelSession(params.id);
		return { error: null, message: 'Sesión cancelada' };
	},

	deleteSession: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const backTo = form.get('backLink')?.toString() ?? '/calendar';
		await deleteSession(params.id);
		redirect(303, backTo);
	},

	addParticipant: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const name = form.get('participantName')?.toString().trim();
		if (!name) return fail(400, { error: 'Name required' });
		await addParticipant({ sessionId: params.id, name });
		return { error: null, message: 'Participante añadido' };
	},

	removeParticipant: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const id = form.get('participantId')?.toString() ?? '';
		if (!id) return fail(400, { error: 'participantId required' });
		await removeParticipant(id);
		return { error: null, message: 'Participante eliminado' };
	},

	unassignFromSession: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingId = form.get('bookingId')?.toString() ?? '';
		if (!bookingId) return fail(400, { error: 'bookingId required' });
		await assignBookingToSession(bookingId, null);
		return { error: null, message: 'Reserva desasignada' };
	},

	assignBooking: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingId = form.get('bookingId')?.toString() ?? '';
		if (!bookingId) return fail(400, { error: 'bookingId required' });
		await assignBookingToSession(bookingId, params.id);
		return { error: null, message: 'Reserva asignada a esta sesión' };
	},

	renameParticipant: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const id = form.get('participantId')?.toString() ?? '';
		const name = form.get('name')?.toString().trim() ?? '';
		if (!id || !name) return fail(400, { error: 'participantId and name required' });
		await renameSessionParticipant(id, name);
		return { error: null, message: 'Nombre actualizado' };
	}
};
