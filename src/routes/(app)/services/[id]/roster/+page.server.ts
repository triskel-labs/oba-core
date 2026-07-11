import { error, fail } from '@sveltejs/kit';
import { eq, and, inArray } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { bookingClients } from '$lib/server/db/schema';
import { getService } from '$lib/features/services/queries';
import { listEditionsForService } from '$lib/features/services/editions.queries';
import { listBookingsForRun, recalcEditionBookingAmounts } from '$lib/features/bookings/queries';
import {
	listParticipantsForEnrollment,
	addParticipant,
	renameParticipant,
	removeParticipantWithCascade,
	syncParticipantCount
} from '$lib/features/bookings/participants.queries';
import { requireRole } from '$lib/server/permissions';
import {
	updateSession,
	listSessionsForEdition,
	createSession,
	cancelSession,
	deleteSession,
	bulkGenerateSessionsForEdition
} from '$lib/features/sessions/queries';
import { listInstructors } from '$lib/features/instructors/queries';
import type { Actions, PageServerLoad } from './$types';
import type { BulkGenOptions } from '$lib/features/sessions/types';

export const load: PageServerLoad = async ({ params, url, locals }) => {
	requireRole(locals, 'admin', 'owner', 'manager');
	const service = await getService(params.id);
	if (!service) error(404, 'Service not found');

	const editions = await listEditionsForService(params.id);
	const focusEditionId = url.searchParams.get('run') ?? editions[0]?.id ?? null;

	const bookingsByEdition: Record<string, Awaited<ReturnType<typeof listBookingsForRun>>> = {};
	await Promise.all(
		editions.map(async edition => {
			bookingsByEdition[edition.id] = await listBookingsForRun(edition.id);
		})
	);

	// Gather all booking IDs across all editions
	const allBookingIds = Object.values(bookingsByEdition).flat().map(b => b.id);

	// Load enrolled client IDs and participants per booking
	const enrolledClientByBooking: Record<string, string> = {}; // bookingId → bookingClients.id
	const participantsByEnrollment: Record<string, Awaited<ReturnType<typeof listParticipantsForEnrollment>>> = {};

	if (allBookingIds.length > 0) {
		const clientRows = await db
			.select({ id: bookingClients.id, bookingId: bookingClients.bookingId })
			.from(bookingClients)
			.where(and(inArray(bookingClients.bookingId, allBookingIds), eq(bookingClients.status, 'enrolled')));
		await Promise.all(clientRows.map(async row => {
			enrolledClientByBooking[row.bookingId] = row.id;
			participantsByEnrollment[row.id] = await listParticipantsForEnrollment(row.id);
		}));
	}

	const [sessionsByEdition, instructors] = await Promise.all([
		(async () => {
			const map: Record<string, Awaited<ReturnType<typeof listSessionsForEdition>>> = {};
			await Promise.all(
				editions.map(async e => {
					map[e.id] = await listSessionsForEdition(e.id);
				})
			);
			return map;
		})(),
		listInstructors()
	]);

	return { service, editions, focusEditionId, bookingsByEdition, sessionsByEdition, instructors, enrolledClientByBooking, participantsByEnrollment };
};

export const actions: Actions = {
	addEditionSession: async ({ request, params, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const editionId = form.get('editionId')?.toString() ?? '';
		const date      = form.get('date')?.toString() ?? '';
		if (!editionId || !date) return fail(400, { error: 'editionId and date required' });
		await createSession({
			ownerType: 'edition', editionId, date,
			time: form.get('time')?.toString() || undefined,
			durationMinutes: form.get('durationMinutes') ? parseInt(form.get('durationMinutes')!.toString()) : undefined,
			instructorIds: form.getAll('instructorId').map(String).filter(Boolean)
		});
		await recalcEditionBookingAmounts(editionId);
		return { error: null, message: 'Sesión añadida' };
	},

	updateEditionSession: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		if (!sessionId) return fail(400, { error: 'sessionId required' });
		await updateSession(sessionId, {
			time: form.get('time')?.toString() || null,
			durationMinutes: form.get('durationMinutes') ? parseInt(form.get('durationMinutes')!.toString()) : null,
			notes: form.get('notes')?.toString() || null,
			instructorIds: form.getAll('instructorId').map(String).filter(Boolean)
		});
		return { error: null, message: 'Sesión actualizada' };
	},

	cancelEditionSession: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form      = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		const editionId = form.get('editionId')?.toString() ?? '';
		if (!sessionId) return fail(400, { error: 'sessionId required' });
		await cancelSession(sessionId);
		if (editionId) await recalcEditionBookingAmounts(editionId);
		return { error: null, message: 'Sesión cancelada' };
	},

	deleteEditionSession: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form      = await request.formData();
		const sessionId = form.get('sessionId')?.toString() ?? '';
		const editionId = form.get('editionId')?.toString() ?? '';
		if (!sessionId) return fail(400, { error: 'sessionId required' });
		await deleteSession(sessionId);
		if (editionId) await recalcEditionBookingAmounts(editionId);
		return { error: null, message: 'Sesión eliminada' };
	},

	addRosterParticipant: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		const name = form.get('name')?.toString().trim() ?? '';
		if (!bookingClientId || !name) return fail(400, { error: 'bookingClientId and name required' });
		await addParticipant(bookingClientId, name);
		await syncParticipantCount(bookingClientId);
		return { error: null, message: 'Participante añadido' };
	},

	renameRosterParticipant: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const participantId = form.get('participantId')?.toString() ?? '';
		const name = form.get('name')?.toString().trim() ?? '';
		if (!participantId || !name) return fail(400, { error: 'participantId and name required' });
		await renameParticipant(participantId, name);
		return { error: null, message: 'Nombre actualizado' };
	},

	removeRosterParticipant: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form = await request.formData();
		const participantId = form.get('participantId')?.toString() ?? '';
		const bookingClientId = form.get('bookingClientId')?.toString() ?? '';
		if (!participantId) return fail(400, { error: 'participantId required' });
		await removeParticipantWithCascade(participantId);
		if (bookingClientId) await syncParticipantCount(bookingClientId);
		return { error: null, message: 'Participante eliminado' };
	},

	bulkGenerateEditionSessions: async ({ request, locals }) => {
		requireRole(locals, 'admin', 'owner', 'manager');
		const form      = await request.formData();
		const editionId = form.get('editionId')?.toString() ?? '';
		const startDate = form.get('startDate')?.toString() ?? '';
		const endDate   = form.get('endDate')?.toString() ?? '';
		if (!editionId || !startDate || !endDate) return fail(400, { error: 'Missing required fields' });

		const opts: BulkGenOptions = {
			sessionsPerDay: parseInt(form.get('sessionsPerDay')?.toString() ?? '1'),
			times: form.getAll('sessionTime').map(t => t.toString() || undefined),
			weekdaysOnly: form.get('weekdaysOnly') === 'true',
			durationMinutes: form.get('durationMinutes') ? parseInt(form.get('durationMinutes')!.toString()) : undefined,
			clearExisting: form.get('clearExisting') === 'true'
		};
		await bulkGenerateSessionsForEdition(editionId, { startDate, endDate }, opts);
		await recalcEditionBookingAmounts(editionId);
		return { error: null, message: 'Sesiones generadas' };
	}
};
