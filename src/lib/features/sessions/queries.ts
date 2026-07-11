import { and, desc, eq, gte, inArray, isNull, lte, ne, or, sql, sum } from 'drizzle-orm';
import { db } from '$lib/server/db';
import {
	sessions,
	sessionInstructors,
	sessionParticipants,
	bookings,
	bookingClients,
	bookingParticipants,
	clients,
	services,
	serviceEditions
} from '$lib/server/db/schema';
import { user as userTable } from '$lib/server/db/auth.schema';
import type {
	AgendaSession,
	BaseSessionInput,
	BookingEnrollment,
	BookingSessionContext,
	BulkGenOptions,
	ClientGroup,
	CreateParticipantInput,
	CreateSessionInput,
	Session,
	SessionContext,
	ClientSessionSummary,
	SessionForDay,
	SessionInstructor,
	SessionOwnerType,
	SessionParticipant,
	SessionWithGroups,
	UpdateSessionInput
} from './types';

// Shared column selector — one edit point when schema changes
const SESSION_COLS = {
	id: sessions.id,
	ownerType: sessions.ownerType,
	bookingId: sessions.bookingId,
	serviceId: sessions.serviceId,
	serviceEditionId: sessions.serviceEditionId,
	date: sessions.date,
	time: sessions.time,
	durationMinutes: sessions.durationMinutes,
	notes: sessions.notes,
	skillLevel: sessions.skillLevel,
	status: sessions.status,
	sortOrder: sessions.sortOrder,
	createdAt: sessions.createdAt,
	updatedAt: sessions.updatedAt
} as const;

// ── Attachment helpers ────────────────────────────────────────────────────────

async function attachInstructors<T extends { id: string }>(
	sessionRows: T[]
): Promise<(T & { instructors: SessionInstructor[] })[]> {
	if (sessionRows.length === 0) return sessionRows.map((s) => ({ ...s, instructors: [] }));
	const ids = sessionRows.map((s) => s.id);
	const rows = await db
		.select({
			id: sessionInstructors.id,
			sessionId: sessionInstructors.sessionId,
			instructorId: sessionInstructors.instructorId,
			instructorName: userTable.name
		})
		.from(sessionInstructors)
		.leftJoin(userTable, eq(sessionInstructors.instructorId, userTable.id))
		.where(
			sql`${sessionInstructors.sessionId} = ANY(ARRAY[${sql.join(
				ids.map((id) => sql`${id}`),
				sql`, `
			)}]::text[])`
		);

	const bySession: Record<string, typeof rows> = {};
	for (const row of rows) (bySession[row.sessionId] ??= []).push(row);

	return sessionRows.map((s) => ({
		...s,
		instructors: (bySession[s.id] ?? []).map((r) => ({
			id: r.id,
			sessionId: r.sessionId,
			instructorId: r.instructorId,
			instructorName: r.instructorName
		}))
	}));
}

async function attachParticipants<T extends { id: string }>(
	sessionRows: T[]
): Promise<(T & { participants: SessionParticipant[] })[]> {
	if (sessionRows.length === 0) return sessionRows.map((s) => ({ ...s, participants: [] }));
	const ids = sessionRows.map((s) => s.id);
	const rows = await db
		.select({
			id: sessionParticipants.id,
			sessionId: sessionParticipants.sessionId,
			bookingParticipantId: sessionParticipants.bookingParticipantId,
			name: sessionParticipants.name,
			notes: sessionParticipants.notes,
			sortOrder: sessionParticipants.sortOrder
		})
		.from(sessionParticipants)
		.where(
			sql`${sessionParticipants.sessionId} = ANY(ARRAY[${sql.join(
				ids.map((id) => sql`${id}`),
				sql`, `
			)}]::text[])`
		)
		.orderBy(sessionParticipants.sortOrder);

	const bySession: Record<string, SessionParticipant[]> = {};
	for (const r of rows) (bySession[r.sessionId] ??= []).push(r);
	return sessionRows.map((s) => ({ ...s, participants: bySession[s.id] ?? [] }));
}

async function attachClientGroups<T extends { id: string; participants: SessionParticipant[] }>(
	sessionRows: T[]
): Promise<(T & { clientGroups: ClientGroup[]; participantNames: string[] })[]> {
	if (sessionRows.length === 0)
		return sessionRows.map((s) => ({ ...s, clientGroups: [], participantNames: [] }));

	// Collect all bookingParticipantIds that are linked
	const linkedPairs: { sessionId: string; bpId: string }[] = [];
	for (const s of sessionRows) {
		for (const p of s.participants) {
			if (p.bookingParticipantId) linkedPairs.push({ sessionId: s.id, bpId: p.bookingParticipantId });
		}
	}

	const bpIds = [...new Set(linkedPairs.map((lp) => lp.bpId))];

	if (bpIds.length === 0) {
		return sessionRows.map((s) => ({
			...s,
			clientGroups: [],
			participantNames: s.participants.map((p) => p.name).filter(Boolean)
		}));
	}

	const rows = await db
		.select({
			bookingParticipantId: bookingParticipants.id,
			bookingId: bookingClients.bookingId,
			clientFirstName: clients.firstName,
			clientLastName: clients.lastName
		})
		.from(bookingParticipants)
		.innerJoin(bookingClients, eq(bookingParticipants.bookingClientId, bookingClients.id))
		.innerJoin(clients, eq(bookingClients.clientId, clients.id))
		.where(inArray(bookingParticipants.id, bpIds));

	// Map: bookingParticipantId → { bookingId, clientName }
	const bpMeta = new Map<string, { bookingId: string; clientName: string }>();
	for (const row of rows) {
		bpMeta.set(row.bookingParticipantId, {
			bookingId: row.bookingId,
			clientName: [row.clientFirstName, row.clientLastName].filter(Boolean).join(' ') || 'Desconocido'
		});
	}

	return sessionRows.map((s) => {
		// Group participants by bookingId
		const byBooking = new Map<string, { clientName: string; participants: { id: string; name: string }[] }>();
		const unlinkedNames: string[] = [];

		for (const p of s.participants) {
			if (p.bookingParticipantId && bpMeta.has(p.bookingParticipantId)) {
				const meta = bpMeta.get(p.bookingParticipantId)!;
				const group = byBooking.get(meta.bookingId) ?? { clientName: meta.clientName, participants: [] };
				group.participants.push({ id: p.id, name: p.name });
				byBooking.set(meta.bookingId, group);
			} else {
				unlinkedNames.push(p.name);
			}
		}

		const clientGroups: ClientGroup[] = [...byBooking.entries()].map(([bookingId, group]) => ({
			clientName: group.clientName,
			bookingId,
			participants: group.participants
		}));

		const participantNames = [
			...clientGroups.flatMap((g) => g.participants.map((p) => p.name)),
			...unlinkedNames
		].filter(Boolean);

		return { ...s, clientGroups, participantNames };
	});
}

type BookingClientRow = {
	bookingId: string;
	firstName: string | null;
	lastName: string | null;
	participantCount?: number | null;
	amountDue?: string | null;
	amountPaid?: string | null;
};

type BookingPaymentMap = Record<string, { due: number; paid: number }>;

function formatClientName(firstName: string | null, lastName: string | null): string | null {
	const name = [firstName, lastName].filter(Boolean).join(' ').trim();
	return name || null;
}

function uniqueNames(names: Array<string | null | undefined>): string[] {
	return [...new Set(names.filter((name): name is string => Boolean(name && name.trim())))];
}

function groupBookingClients<T extends BookingClientRow>(rows: T[]): Record<string, T[]> {
	const byBooking: Record<string, T[]> = {};
	for (const row of rows) (byBooking[row.bookingId] ??= []).push(row);
	return byBooking;
}

async function loadBookingPaymentMap(bookingIds: string[]): Promise<BookingPaymentMap> {
	if (bookingIds.length === 0) return {};

	const payRows = await db
		.select({
			bookingId: bookingClients.bookingId,
			due: sum(bookingClients.amountDue),
			paid: sum(bookingClients.amountPaid)
		})
		.from(bookingClients)
		.where(inArray(bookingClients.bookingId, bookingIds))
		.groupBy(bookingClients.bookingId);

	const payMap: BookingPaymentMap = {};
	for (const row of payRows) {
		payMap[row.bookingId] = {
			due: parseFloat(row.due ?? '0'),
			paid: parseFloat(row.paid ?? '0')
		};
	}

	return payMap;
}

function sumBookingPayments(
	bookingIds: string[],
	payMap: BookingPaymentMap
): { due: number; paid: number } {
	return bookingIds.reduce(
		(totals, bookingId) => ({
			due: totals.due + (payMap[bookingId]?.due ?? 0),
			paid: totals.paid + (payMap[bookingId]?.paid ?? 0)
		}),
		{ due: 0, paid: 0 }
	);
}

function buildParticipantSummary(
	session: Session,
	bookingClientRows: BookingClientRow[],
	options: { fallbackToClientNames: boolean }
) {
	const explicitParticipantNames = uniqueNames(
		session.participants.map((participant) => participant.name)
	);
	const clientNames = uniqueNames(
		bookingClientRows.map((client) => formatClientName(client.firstName, client.lastName))
	);
	const participantNames =
		explicitParticipantNames.length > 0
			? explicitParticipantNames
			: options.fallbackToClientNames
				? clientNames
				: [];
	const enrolledCount = bookingClientRows.reduce(
		(sum, client) => sum + (client.participantCount ?? 1),
		0
	);

	return {
		firstClientName: formatClientName(
			bookingClientRows[0]?.firstName ?? null,
			bookingClientRows[0]?.lastName ?? null
		),
		participantNames,
		totalParticipants: participantNames.length > 0 ? participantNames.length : enrolledCount,
		enrolledCount,
		totalAmountDue: bookingClientRows.reduce(
			(sum, client) => sum + parseFloat(client.amountDue ?? '0'),
			0
		),
		totalAmountPaid: bookingClientRows.reduce(
			(sum, client) => sum + parseFloat(client.amountPaid ?? '0'),
			0
		)
	};
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

export function resolveSessionContext(booking: BookingSessionContext): SessionContext {
	const m = booking.serviceModules ?? {};
	// Edition service: always resolve as edition even if no specific editionId set
	if ('editions' in m)
		return booking.serviceEditionId
			? { type: 'edition', editionId: booking.serviceEditionId }
			: { type: 'booking', bookingId: booking.id }; // no edition selected → no sessions
	if ('roster' in m && booking.serviceId)
		return { type: 'service', serviceId: booking.serviceId, date: booking.date };
	return { type: 'booking', bookingId: booking.id };
}

export async function listSessionsForContext(booking: BookingSessionContext): Promise<Session[]> {
	const ctx = resolveSessionContext(booking);
	switch (ctx.type) {
		case 'booking':
			return listSessionsForBooking(ctx.bookingId);
		case 'service':
			return listSessionsForServiceOnDate(ctx.serviceId, ctx.date);
		case 'edition':
			return listSessionsForEdition(ctx.editionId);
	}
}

// ── Per-owner list queries ────────────────────────────────────────────────────

async function listSessionsForBooking(bookingId: string): Promise<Session[]> {
	const rows = await db
		.select(SESSION_COLS)
		.from(sessions)
		.where(and(eq(sessions.bookingId, bookingId), eq(sessions.ownerType, 'booking')))
		.orderBy(sessions.date, sessions.sortOrder, sessions.time);
	const wi = await attachInstructors(rows as Omit<Session, 'instructors' | 'participants'>[]);
	return attachParticipants(wi);
}

async function listSessionsForServiceOnDate(serviceId: string, date: string): Promise<Session[]> {
	const rows = await db
		.select(SESSION_COLS)
		.from(sessions)
		.where(
			and(
				eq(sessions.serviceId, serviceId),
				eq(sessions.date, date),
				eq(sessions.ownerType, 'service')
			)
		)
		.orderBy(sessions.sortOrder, sessions.time);
	const wi = await attachInstructors(rows as Omit<Session, 'instructors' | 'participants'>[]);
	return attachParticipants(wi);
}

export async function listSessionsForService(
	serviceId: string,
	from?: string,
	to?: string
): Promise<SessionWithGroups[]> {
	const conditions = [eq(sessions.serviceId, serviceId), eq(sessions.ownerType, 'service')];
	if (from) conditions.push(gte(sessions.date, from));
	if (to) conditions.push(lte(sessions.date, to));
	const rows = await db
		.select(SESSION_COLS)
		.from(sessions)
		.where(and(...conditions))
		.orderBy(sessions.date, sessions.sortOrder, sessions.time);
	const wi = await attachInstructors(rows as Omit<Session, 'instructors' | 'participants'>[]);
	const wb = await attachParticipants(wi);
	return attachClientGroups(wb);
}

export async function listSessionsForEdition(editionId: string): Promise<SessionWithGroups[]> {
	const rows = await db
		.select(SESSION_COLS)
		.from(sessions)
		.where(and(eq(sessions.serviceEditionId, editionId), eq(sessions.ownerType, 'edition')))
		.orderBy(sessions.date, sessions.sortOrder, sessions.time);
	const wi = await attachInstructors(rows as Omit<Session, 'instructors' | 'participants'>[]);
	const wb = await attachParticipants(wi);
	return attachClientGroups(wb);
}

// ── Group class enrollment ────────────────────────────────────────────────────

export async function listEnrollmentsForSession(sessionId: string): Promise<BookingEnrollment[]> {
	return db
		.select({
			bookingId: bookings.id,
			clientId: bookingClients.clientId,
			firstName: clients.firstName,
			lastName: clients.lastName,
			amountDue: bookingClients.amountDue,
			amountPaid: bookingClients.amountPaid,
			status: bookingClients.status
		})
		.from(bookings)
		.innerJoin(bookingClients, eq(bookingClients.bookingId, bookings.id))
		.innerJoin(clients, eq(bookingClients.clientId, clients.id))
		.where(and(eq(bookings.sessionId, sessionId), ne(bookings.status, 'cancelled')));
}

export async function listUnassignedEnrollments(serviceId: string, date: string) {
	return db
		.select({
			bookingId: bookings.id,
			clientId: bookingClients.clientId,
			firstName: clients.firstName,
			lastName: clients.lastName,
			status: bookings.status
		})
		.from(bookings)
		.innerJoin(bookingClients, eq(bookingClients.bookingId, bookings.id))
		.innerJoin(clients, eq(bookingClients.clientId, clients.id))
		.where(
			and(
				eq(bookings.serviceId, serviceId),
				eq(bookings.date, date),
				isNull(bookings.sessionId),
				ne(bookings.status, 'cancelled'),
				eq(bookingClients.status, 'enrolled')
			)
		);
}

export async function assignBookingToSession(
	bookingId: string,
	sessionId: string | null
): Promise<void> {
	if (sessionId !== null) {
		const [session] = await db.select().from(sessions).where(eq(sessions.id, sessionId));
		const [booking] = await db
			.select({ serviceId: bookings.serviceId })
			.from(bookings)
			.where(eq(bookings.id, bookingId));
		if (!session || session.ownerType !== 'service' || session.serviceId !== booking?.serviceId)
			throw new Error("Session does not belong to this booking's service");
	}
	await db.update(bookings).set({ sessionId }).where(eq(bookings.id, bookingId));
}

// ── Core CRUD ────────────────────────────────────────────────────────────────

export async function getSession(id: string): Promise<Session | undefined> {
	const [row] = await db.select(SESSION_COLS).from(sessions).where(eq(sessions.id, id));
	if (!row) return undefined;
	const [wi] = await attachInstructors([row as Omit<Session, 'instructors' | 'participants'>]);
	const [wb] = await attachParticipants([wi]);
	return wb;
}

export async function createSession(input: CreateSessionInput): Promise<Session> {
	const ownerCols =
		input.ownerType === 'booking'
			? { bookingId: input.bookingId, serviceId: null, serviceEditionId: null }
			: input.ownerType === 'service'
				? { serviceId: input.serviceId, bookingId: null, serviceEditionId: null }
				: { serviceEditionId: input.editionId, bookingId: null, serviceId: null };

	const [row] = await db
		.insert(sessions)
		.values({
			ownerType: input.ownerType,
			...ownerCols,
			date: input.date,
			time: input.time ?? null,
			durationMinutes: input.durationMinutes ?? null,
			notes: input.notes ?? null,
			status: input.time ? 'scheduled' : 'unscheduled',
			sortOrder: input.sortOrder ?? 0,
			skillLevel: input.skillLevel ?? null
		})
		.returning();

	if (input.instructorIds?.length) {
		await db
			.insert(sessionInstructors)
			.values(input.instructorIds.map((instructorId) => ({ sessionId: row.id, instructorId })));
	}

	if (input.ownerType === 'edition') {
		await syncParticipantsToEditionSession(row.id, input.editionId);
	}

	return (await getSession(row.id))!;
}

export async function updateSession(id: string, input: UpdateSessionInput): Promise<Session> {
	const updates: Record<string, unknown> = { updatedAt: new Date() };
	if (input.date !== undefined) updates.date = input.date;
	if (input.time !== undefined) {
		updates.time = input.time;
		updates.status = input.time ? 'scheduled' : 'unscheduled';
	}
	if (input.durationMinutes !== undefined) updates.durationMinutes = input.durationMinutes;
	if (input.notes !== undefined) updates.notes = input.notes;
	if (input.status !== undefined) updates.status = input.status;
	if (input.sortOrder !== undefined) updates.sortOrder = input.sortOrder;
	if (input.skillLevel !== undefined) updates.skillLevel = input.skillLevel;
	await db.update(sessions).set(updates).where(eq(sessions.id, id));

	if (input.instructorIds !== undefined) {
		await db.delete(sessionInstructors).where(eq(sessionInstructors.sessionId, id));
		if (input.instructorIds.length > 0) {
			await db
				.insert(sessionInstructors)
				.values(input.instructorIds.map((instructorId) => ({ sessionId: id, instructorId })));
		}
	}
	return (await getSession(id))!;
}

export async function cancelSession(id: string): Promise<void> {
	await db
		.update(sessions)
		.set({ status: 'cancelled', updatedAt: new Date() })
		.where(eq(sessions.id, id));
}

export async function deleteSession(id: string): Promise<void> {
	await db.delete(sessions).where(eq(sessions.id, id));
}

export async function deleteSessionsForBooking(bookingId: string): Promise<void> {
	await db
		.delete(sessions)
		.where(and(eq(sessions.bookingId, bookingId), eq(sessions.ownerType, 'booking')));
}

export async function deleteSessionsForEdition(editionId: string): Promise<void> {
	await db
		.delete(sessions)
		.where(and(eq(sessions.serviceEditionId, editionId), eq(sessions.ownerType, 'edition')));
}

export async function deleteSessionsForServiceOnDate(
	serviceId: string,
	date: string
): Promise<void> {
	await db
		.delete(sessions)
		.where(
			and(
				eq(sessions.serviceId, serviceId),
				eq(sessions.date, date),
				eq(sessions.ownerType, 'service')
			)
		);
}

// ── Bulk generate ─────────────────────────────────────────────────────────────

interface DateSlot {
	date: string;
	time: string | undefined;
}

function buildDateSlots(start: string, end: string, opts: BulkGenOptions): DateSlot[] {
	const slots: DateSlot[] = [];
	const cur = new Date(start + 'T12:00:00Z');
	const endDate = new Date(end + 'T12:00:00Z');

	while (cur <= endDate) {
		const dow = cur.getUTCDay();
		if (!opts.weekdaysOnly || (dow >= 1 && dow <= 5)) {
			for (let i = 0; i < opts.sessionsPerDay; i++) {
				slots.push({ date: cur.toISOString().slice(0, 10), time: opts.times[i] });
			}
		}
		cur.setUTCDate(cur.getUTCDate() + 1);
	}
	return slots;
}

export async function bulkGenerateSessionsForBooking(
	bookingId: string,
	booking: { date: string; dateEnd: string | null },
	opts: BulkGenOptions
): Promise<void> {
	if (opts.clearExisting) await deleteSessionsForBooking(bookingId);
	const slots = buildDateSlots(booking.date, booking.dateEnd ?? booking.date, opts);
	for (const slot of slots) {
		await createSession({
			ownerType: 'booking',
			bookingId,
			date: slot.date,
			time: slot.time,
			durationMinutes: opts.durationMinutes
		});
	}
}

export async function bulkGenerateSessionsForEdition(
	editionId: string,
	edition: { startDate: string; endDate: string },
	opts: BulkGenOptions
): Promise<void> {
	if (opts.clearExisting) await deleteSessionsForEdition(editionId);
	const slots = buildDateSlots(edition.startDate, edition.endDate, opts);
	for (const slot of slots) {
		await createSession({
			ownerType: 'edition',
			editionId,
			date: slot.date,
			time: slot.time,
			durationMinutes: opts.durationMinutes
		});
	}
}

// ── Calendar queries ──────────────────────────────────────────────────────────

export async function listSessionsForDate(
	date: string,
	instructorId?: string
): Promise<SessionForDay[]> {
	const baseWhere = instructorId
		? and(
				eq(sessions.date, date),
				ne(sessions.status, 'cancelled'),
				sql`${sessions.id} IN (SELECT session_id FROM session_instructors WHERE user_id = ${instructorId})`
			)
		: and(eq(sessions.date, date), ne(sessions.status, 'cancelled'));

	const rows = await db
		.select(SESSION_COLS)
		.from(sessions)
		.where(baseWhere)
		.orderBy(sessions.sortOrder, sessions.time);
	if (rows.length === 0) return [];

	const wi = await attachInstructors(rows as Omit<Session, 'instructors' | 'participants'>[]);
	const wb = await attachParticipants(wi);
	return enrichSessionsForCalendar(wb as Session[]);
}

export async function listSessionsForDateRange(
	from: string,
	to: string,
	instructorId?: string
): Promise<AgendaSession[]> {
	const baseWhere = instructorId
		? and(
				gte(sessions.date, from),
				lte(sessions.date, to),
				ne(sessions.status, 'cancelled'),
				sql`${sessions.id} IN (SELECT session_id FROM session_instructors WHERE user_id = ${instructorId})`
			)
		: and(gte(sessions.date, from), lte(sessions.date, to), ne(sessions.status, 'cancelled'));

	const rows = await db
		.select(SESSION_COLS)
		.from(sessions)
		.where(baseWhere)
		.orderBy(sessions.date, sessions.sortOrder, sessions.time);
	if (rows.length === 0) return [];

	const wi = await attachInstructors(rows as Omit<Session, 'instructors' | 'participants'>[]);
	const wb = await attachParticipants(wi);
	return enrichSessionsForAgenda(wb as Session[]);
}

async function enrichSessionsForCalendar(rows: Session[]): Promise<SessionForDay[]> {
	const byType: Record<SessionOwnerType, Session[]> = { booking: [], service: [], edition: [] };
	for (const s of rows) (byType[s.ownerType] ??= []).push(s);

	const [b, svc, ed] = await Promise.all([
		enrichBookingOwnedForCalendar(byType.booking),
		enrichServiceOwnedForCalendar(byType.service),
		enrichEditionOwnedForCalendar(byType.edition)
	]);
	return [...b, ...svc, ...ed].sort(
		(a, b) => a.sortOrder - b.sortOrder || (a.time ?? '').localeCompare(b.time ?? '')
	);
}

async function enrichSessionsForAgenda(rows: Session[]): Promise<AgendaSession[]> {
	const byType: Record<SessionOwnerType, Session[]> = { booking: [], service: [], edition: [] };
	for (const s of rows) (byType[s.ownerType] ??= []).push(s);

	const [b, svc, ed] = await Promise.all([
		enrichBookingOwnedForAgenda(byType.booking),
		enrichServiceOwnedForAgenda(byType.service),
		enrichEditionOwnedForAgenda(byType.edition)
	]);
	return [...b, ...svc, ...ed].sort((a, b) =>
		(a.date + (a.time ?? '')).localeCompare(b.date + (b.time ?? ''))
	);
}

async function enrichBookingOwnedForCalendar(rows: Session[]): Promise<SessionForDay[]> {
	if (rows.length === 0) return [];
	const bookingIds = rows.map((s) => s.bookingId!);
	const bRows = await db
		.select({ id: bookings.id, status: bookings.status, serviceId: bookings.serviceId })
		.from(bookings)
		.where(inArray(bookings.id, bookingIds));
	const svcIds = [...new Set(bRows.map((b) => b.serviceId).filter(Boolean))] as string[];
	const svcRows =
		svcIds.length > 0
			? await db
					.select({
						id: services.id,
						name: services.name,
						color: services.color,
						modules: services.modules,
						durationMinutes: services.durationMinutes
					})
					.from(services)
					.where(inArray(services.id, svcIds))
			: [];

	const bookingMap = Object.fromEntries(bRows.map((b) => [b.id, b]));
	const svcMap = Object.fromEntries(svcRows.map((s) => [s.id, s]));

	const clientRows =
		bookingIds.length > 0
			? await db
					.select({
						bookingId: bookingClients.bookingId,
						firstName: clients.firstName,
						lastName: clients.lastName
					})
					.from(bookingClients)
					.innerJoin(clients, eq(bookingClients.clientId, clients.id))
					.where(
						and(
							inArray(bookingClients.bookingId, bookingIds),
							eq(bookingClients.status, 'enrolled')
						)
					)
			: [];
	const clientsByBooking = groupBookingClients(clientRows);
	const payMap = await loadBookingPaymentMap(bookingIds);

	return rows.map((s) => {
		const bk = bookingMap[s.bookingId!];
		const sv = bk?.serviceId ? svcMap[bk.serviceId] : null;
		const summary = buildParticipantSummary(s, clientsByBooking[s.bookingId!] ?? [], {
			fallbackToClientNames: true
		});

		return {
			...s,
			primaryBookingId: s.bookingId,
			bookingIds: [s.bookingId!],
			editionId: null,
			bookingStatus: bk?.status ?? null,
			serviceName: sv?.name ?? null,
			serviceColor: sv?.color ?? null,
			serviceHasSessions: 'sessions' in (sv?.modules ?? {}),
			serviceDurationMinutes: sv?.durationMinutes ?? null,
			effectiveDuration: s.durationMinutes ?? sv?.durationMinutes ?? 60,
			firstClientName: summary.firstClientName,
			participantNames: summary.participantNames,
			totalParticipants: summary.totalParticipants,
			totalAmountDue: payMap[s.bookingId!]?.due ?? 0,
			totalAmountPaid: payMap[s.bookingId!]?.paid ?? 0,
			clientGroups: []
		} satisfies SessionForDay;
	});
}

async function enrichServiceOwnedForCalendar(rows: Session[]): Promise<SessionForDay[]> {
	if (rows.length === 0) return [];
	const sessionIds = rows.map((s) => s.id);
	const svcIds = [...new Set(rows.map((s) => s.serviceId!))];
	const svcRows = await db
		.select({
			id: services.id,
			name: services.name,
			color: services.color,
			modules: services.modules,
			durationMinutes: services.durationMinutes
		})
		.from(services)
		.where(inArray(services.id, svcIds));
	const svcMap = Object.fromEntries(svcRows.map((s) => [s.id, s]));

	const enrolledBookings =
		sessionIds.length > 0
			? await db
					.select({
						sessionId: bookings.sessionId,
						bookingId: bookings.id,
						status: bookings.status
					})
					.from(bookings)
					.where(and(inArray(bookings.sessionId, sessionIds), ne(bookings.status, 'cancelled')))
			: [];
	const enrolledBySession: Record<string, string[]> = {};
	for (const booking of enrolledBookings) {
		(enrolledBySession[booking.sessionId!] ??= []).push(booking.bookingId);
	}

	const enrolledBookingIds = enrolledBookings.map((booking) => booking.bookingId);
	const clientRows =
		enrolledBookingIds.length > 0
			? await db
					.select({
						bookingId: bookingClients.bookingId,
						firstName: clients.firstName,
						lastName: clients.lastName,
						participantCount: bookingClients.participantCount
					})
					.from(bookingClients)
					.leftJoin(clients, eq(bookingClients.clientId, clients.id))
					.where(
						and(
							inArray(bookingClients.bookingId, enrolledBookingIds),
							eq(bookingClients.status, 'enrolled')
						)
					)
			: [];
	const clientsByBooking = groupBookingClients(clientRows);
	const payMap = await loadBookingPaymentMap(enrolledBookingIds);

	return rows.map((s) => {
		const sv = svcMap[s.serviceId!];
		const bookingIds = enrolledBySession[s.id] ?? [];
		const summary = buildParticipantSummary(
			s,
			bookingIds.flatMap((bookingId) => clientsByBooking[bookingId] ?? []),
			{ fallbackToClientNames: true }
		);
		const totals = sumBookingPayments(bookingIds, payMap);

		return {
			...s,
			primaryBookingId: bookingIds[0] ?? null,
			bookingIds,
			editionId: null,
			bookingStatus: null,
			serviceName: sv?.name ?? null,
			serviceColor: sv?.color ?? null,
			serviceHasSessions: true,
			serviceDurationMinutes: sv?.durationMinutes ?? null,
			effectiveDuration: s.durationMinutes ?? sv?.durationMinutes ?? 60,
			firstClientName: summary.firstClientName,
			participantNames: summary.participantNames,
			totalParticipants: summary.totalParticipants,
			totalAmountDue: totals.due,
			totalAmountPaid: totals.paid,
			clientGroups: []
		} satisfies SessionForDay;
	});
}

async function enrichEditionOwnedForCalendar(rows: Session[]): Promise<SessionForDay[]> {
	if (rows.length === 0) return [];
	const editionIds = [...new Set(rows.map((s) => s.serviceEditionId!))];
	const edRows = await db
		.select({ id: serviceEditions.id, serviceId: serviceEditions.serviceId })
		.from(serviceEditions)
		.where(inArray(serviceEditions.id, editionIds));
	const edMap = Object.fromEntries(edRows.map((edition) => [edition.id, edition]));
	const svcIds = [...new Set(edRows.map((edition) => edition.serviceId))];
	const svcRows =
		svcIds.length > 0
			? await db
					.select({
						id: services.id,
						name: services.name,
						color: services.color,
						modules: services.modules,
						durationMinutes: services.durationMinutes
					})
					.from(services)
					.where(inArray(services.id, svcIds))
			: [];
	const svcMap = Object.fromEntries(svcRows.map((service) => [service.id, service]));

	const editionBookings =
		editionIds.length > 0
			? await db
					.select({ bookingId: bookings.id, editionId: bookings.serviceEditionId })
					.from(bookings)
					.where(
						and(inArray(bookings.serviceEditionId, editionIds), ne(bookings.status, 'cancelled'))
					)
			: [];
	const bookingsByEdition: Record<string, string[]> = {};
	for (const booking of editionBookings) {
		(bookingsByEdition[booking.editionId!] ??= []).push(booking.bookingId);
	}

	const allEditionBookingIds = editionBookings.map((booking) => booking.bookingId);
	const clientRows =
		allEditionBookingIds.length > 0
			? await db
					.select({
						bookingId: bookingClients.bookingId,
						firstName: clients.firstName,
						lastName: clients.lastName,
						participantCount: bookingClients.participantCount
					})
					.from(bookingClients)
					.leftJoin(clients, eq(bookingClients.clientId, clients.id))
					.where(
						and(
							inArray(bookingClients.bookingId, allEditionBookingIds),
							eq(bookingClients.status, 'enrolled')
						)
					)
			: [];
	const clientsByBooking = groupBookingClients(clientRows);
	const payMap = await loadBookingPaymentMap(allEditionBookingIds);

	return rows.map((s) => {
		const edition = edMap[s.serviceEditionId!];
		const service = edition ? svcMap[edition.serviceId] : null;
		const bookingIds = edition ? (bookingsByEdition[edition.id] ?? []) : [];
		const summary = buildParticipantSummary(
			s,
			bookingIds.flatMap((bookingId) => clientsByBooking[bookingId] ?? []),
			{ fallbackToClientNames: true }
		);
		const totals = sumBookingPayments(bookingIds, payMap);

		return {
			...s,
			serviceId: service?.id ?? null, // edition sessions have null serviceId in DB; override for routing
			primaryBookingId: null,
			bookingIds,
			editionId: s.serviceEditionId,
			bookingStatus: null,
			serviceName: service?.name ?? null,
			serviceColor: service?.color ?? null,
			serviceHasSessions: true,
			serviceDurationMinutes: service?.durationMinutes ?? null,
			effectiveDuration: s.durationMinutes ?? service?.durationMinutes ?? 60,
			firstClientName: summary.firstClientName,
			participantNames: summary.participantNames,
			totalParticipants: summary.totalParticipants,
			totalAmountDue: totals.due,
			totalAmountPaid: totals.paid,
			clientGroups: []
		} satisfies SessionForDay;
	});
}

async function enrichBookingOwnedForAgenda(rows: Session[]): Promise<AgendaSession[]> {
	if (rows.length === 0) return [];
	const bookingIds = rows.map((s) => s.bookingId!);
	const bRows = await db
		.select({
			id: bookings.id,
			status: bookings.status,
			serviceId: bookings.serviceId,
			date: bookings.date,
			dateEnd: bookings.dateEnd,
			isFlexible: bookings.isFlexible,
			sessionsIncluded: bookings.sessionsIncluded
		})
		.from(bookings)
		.where(inArray(bookings.id, bookingIds));

	const svcIds = [
		...new Set(bRows.map((booking) => booking.serviceId).filter(Boolean))
	] as string[];
	const svcRows =
		svcIds.length > 0
			? await db
					.select({
						id: services.id,
						name: services.name,
						color: services.color,
						modules: services.modules,
						durationMinutes: services.durationMinutes,
						maxCapacity: services.maxCapacity
					})
					.from(services)
					.where(inArray(services.id, svcIds))
			: [];
	const bookingMap = Object.fromEntries(bRows.map((booking) => [booking.id, booking]));
	const svcMap = Object.fromEntries(svcRows.map((service) => [service.id, service]));

	const clientRows =
		bookingIds.length > 0
			? await db
					.select({
						bookingId: bookingClients.bookingId,
						clientId: bookingClients.clientId,
						firstName: clients.firstName,
						lastName: clients.lastName,
						phone: clients.phone,
						amountDue: bookingClients.amountDue,
						amountPaid: bookingClients.amountPaid,
						participantCount: bookingClients.participantCount
					})
					.from(bookingClients)
					.leftJoin(clients, eq(bookingClients.clientId, clients.id))
					.where(
						and(
							inArray(bookingClients.bookingId, bookingIds),
							eq(bookingClients.status, 'enrolled')
						)
					)
			: [];
	const clientsByBooking = groupBookingClients(clientRows);

	const wb = rows as Session[];
	const wg = await attachClientGroups(wb.map((s) => ({ ...s, participants: s.participants })));
	const wgMap = new Map(wg.map((s) => [s.id, s]));

	return rows.map((s) => {
		const booking = bookingMap[s.bookingId!];
		const service = booking?.serviceId ? svcMap[booking.serviceId] : null;
		const summary = buildParticipantSummary(s, clientsByBooking[s.bookingId!] ?? [], {
			fallbackToClientNames: true
		});
		const enriched = wgMap.get(s.id)!;

		return {
			...s,
			primaryBookingId: s.bookingId,
			bookingIds: [s.bookingId!],
			editionId: null,
			bookingStatus: booking?.status ?? null,
			bookingDate: booking?.date ?? s.date,
			bookingDateEnd: booking?.dateEnd ?? null,
			isFlexible: booking?.isFlexible ?? false,
			sessionsIncluded: booking?.sessionsIncluded ?? null,
			serviceName: service?.name ?? null,
			serviceColor: service?.color ?? null,
			serviceHasSessions: 'sessions' in (service?.modules ?? {}),
			serviceHasRoster: 'roster' in (service?.modules ?? {}),
			serviceDurationMinutes: service?.durationMinutes ?? null,
			effectiveDuration: s.durationMinutes ?? service?.durationMinutes ?? 60,
			firstClientName: summary.firstClientName,
			participantNames: summary.participantNames,
			totalParticipants: summary.totalParticipants,
			enrolledCount: summary.enrolledCount,
			maxCapacity: service?.maxCapacity ?? null,
			totalAmountDue: summary.totalAmountDue,
			totalAmountPaid: summary.totalAmountPaid,
			clientGroups: enriched.clientGroups
		} satisfies AgendaSession;
	});
}

async function enrichServiceOwnedForAgenda(rows: Session[]): Promise<AgendaSession[]> {
	if (rows.length === 0) return [];
	const svcIds = [...new Set(rows.map((s) => s.serviceId!))];
	const svcRows = await db
		.select({
			id: services.id,
			name: services.name,
			color: services.color,
			modules: services.modules,
			durationMinutes: services.durationMinutes,
			maxCapacity: services.maxCapacity
		})
		.from(services)
		.where(inArray(services.id, svcIds));
	const svcMap = Object.fromEntries(svcRows.map((service) => [service.id, service]));
	const sessionIds = rows.map((s) => s.id);

	const enrolledBookings =
		sessionIds.length > 0
			? await db
					.select({
						sessionId: bookings.sessionId,
						bookingId: bookings.id,
						status: bookings.status,
						date: bookings.date,
						dateEnd: bookings.dateEnd,
						isFlexible: bookings.isFlexible,
						sessionsIncluded: bookings.sessionsIncluded
					})
					.from(bookings)
					.where(and(inArray(bookings.sessionId, sessionIds), ne(bookings.status, 'cancelled')))
			: [];
	const enrolledBySession: Record<string, typeof enrolledBookings> = {};
	for (const booking of enrolledBookings) {
		(enrolledBySession[booking.sessionId!] ??= []).push(booking);
	}

	const enrolledBookingIds = enrolledBookings.map((booking) => booking.bookingId);
	const clientRows =
		enrolledBookingIds.length > 0
			? await db
					.select({
						bookingId: bookingClients.bookingId,
						firstName: clients.firstName,
						lastName: clients.lastName,
						amountDue: bookingClients.amountDue,
						amountPaid: bookingClients.amountPaid,
						participantCount: bookingClients.participantCount
					})
					.from(bookingClients)
					.leftJoin(clients, eq(bookingClients.clientId, clients.id))
					.where(
						and(
							inArray(bookingClients.bookingId, enrolledBookingIds),
							eq(bookingClients.status, 'enrolled')
						)
					)
			: [];
	const clientsByBooking = groupBookingClients(clientRows);

	const wb = rows as Session[];
	const wg = await attachClientGroups(wb.map((s) => ({ ...s, participants: s.participants })));
	const wgMap = new Map(wg.map((s) => [s.id, s]));

	return rows.map((s) => {
		const service = svcMap[s.serviceId!];
		const sessionBookings = enrolledBySession[s.id] ?? [];
		const summary = buildParticipantSummary(
			s,
			sessionBookings.flatMap((booking) => clientsByBooking[booking.bookingId] ?? []),
			{ fallbackToClientNames: false }
		);
		const enriched = wgMap.get(s.id)!;

		return {
			...s,
			primaryBookingId: sessionBookings[0]?.bookingId ?? null,
			bookingIds: sessionBookings.map((booking) => booking.bookingId),
			editionId: null,
			bookingStatus: sessionBookings[0]?.status ?? null,
			bookingDate: sessionBookings[0]?.date ?? s.date,
			bookingDateEnd: sessionBookings[0]?.dateEnd ?? null,
			isFlexible: sessionBookings[0]?.isFlexible ?? false,
			sessionsIncluded: null,
			serviceName: service?.name ?? null,
			serviceColor: service?.color ?? null,
			serviceHasSessions: 'sessions' in (service?.modules ?? {}),
			serviceHasRoster: 'roster' in (service?.modules ?? {}),
			serviceDurationMinutes: service?.durationMinutes ?? null,
			effectiveDuration: s.durationMinutes ?? service?.durationMinutes ?? 60,
			firstClientName: summary.firstClientName,
			participantNames: summary.participantNames,
			totalParticipants: summary.totalParticipants,
			enrolledCount: summary.enrolledCount,
			maxCapacity: service?.maxCapacity ?? null,
			totalAmountDue: summary.totalAmountDue,
			totalAmountPaid: summary.totalAmountPaid,
			clientGroups: enriched.clientGroups
		} satisfies AgendaSession;
	});
}

async function enrichEditionOwnedForAgenda(rows: Session[]): Promise<AgendaSession[]> {
	if (rows.length === 0) return [];
	const editionIds = [...new Set(rows.map((s) => s.serviceEditionId!))];
	const edRows = await db
		.select({
			id: serviceEditions.id,
			serviceId: serviceEditions.serviceId,
			startDate: serviceEditions.startDate,
			endDate: serviceEditions.endDate
		})
		.from(serviceEditions)
		.where(inArray(serviceEditions.id, editionIds));
	const edMap = Object.fromEntries(edRows.map((edition) => [edition.id, edition]));
	const svcIds = [...new Set(edRows.map((edition) => edition.serviceId))];
	const svcRows =
		svcIds.length > 0
			? await db
					.select({
						id: services.id,
						name: services.name,
						color: services.color,
						modules: services.modules,
						durationMinutes: services.durationMinutes,
						maxCapacity: services.maxCapacity
					})
					.from(services)
					.where(inArray(services.id, svcIds))
			: [];
	const svcMap = Object.fromEntries(svcRows.map((service) => [service.id, service]));

	const editionBookings =
		editionIds.length > 0
			? await db
					.select({
						bookingId: bookings.id,
						editionId: bookings.serviceEditionId,
						status: bookings.status,
						date: bookings.date,
						dateEnd: bookings.dateEnd,
						isFlexible: bookings.isFlexible,
						sessionsIncluded: bookings.sessionsIncluded
					})
					.from(bookings)
					.where(
						and(inArray(bookings.serviceEditionId, editionIds), ne(bookings.status, 'cancelled'))
					)
			: [];
	const bookingsByEdition: Record<string, typeof editionBookings> = {};
	for (const booking of editionBookings) {
		(bookingsByEdition[booking.editionId!] ??= []).push(booking);
	}

	const allBookingIds = editionBookings.map((booking) => booking.bookingId);
	const clientRows =
		allBookingIds.length > 0
			? await db
					.select({
						bookingId: bookingClients.bookingId,
						firstName: clients.firstName,
						lastName: clients.lastName,
						amountDue: bookingClients.amountDue,
						amountPaid: bookingClients.amountPaid,
						participantCount: bookingClients.participantCount
					})
					.from(bookingClients)
					.leftJoin(clients, eq(bookingClients.clientId, clients.id))
					.where(
						and(
							inArray(bookingClients.bookingId, allBookingIds),
							eq(bookingClients.status, 'enrolled')
						)
					)
			: [];
	const clientsByBooking = groupBookingClients(clientRows);

	const wb = rows as Session[];
	const wg = await attachClientGroups(wb.map((s) => ({ ...s, participants: s.participants })));
	const wgMap = new Map(wg.map((s) => [s.id, s]));

	return rows.map((s) => {
		const edition = edMap[s.serviceEditionId!];
		const service = edition ? svcMap[edition.serviceId] : null;
		const sessionBookings = edition ? (bookingsByEdition[edition.id] ?? []) : [];
		const summary = buildParticipantSummary(
			s,
			sessionBookings.flatMap((booking) => clientsByBooking[booking.bookingId] ?? []),
			{ fallbackToClientNames: false }
		);
		const enriched = wgMap.get(s.id)!;

		return {
			...s,
			serviceId: service?.id ?? null, // edition sessions have null serviceId in DB; override for routing
			primaryBookingId: null,
			bookingIds: sessionBookings.map((booking) => booking.bookingId),
			editionId: s.serviceEditionId,
			bookingStatus: null,
			bookingDate: edition?.startDate ?? s.date,
			bookingDateEnd: edition?.endDate ?? null,
			isFlexible: false,
			sessionsIncluded: null,
			serviceName: service?.name ?? null,
			serviceColor: service?.color ?? null,
			serviceHasSessions: true,
			serviceHasRoster: true,
			serviceDurationMinutes: service?.durationMinutes ?? null,
			effectiveDuration: s.durationMinutes ?? service?.durationMinutes ?? 60,
			firstClientName: summary.firstClientName,
			participantNames: summary.participantNames,
			totalParticipants: summary.totalParticipants,
			enrolledCount: summary.enrolledCount,
			maxCapacity: service?.maxCapacity ?? null,
			totalAmountDue: summary.totalAmountDue,
			totalAmountPaid: summary.totalAmountPaid,
			clientGroups: enriched.clientGroups
		} satisfies AgendaSession;
	});
}

// ── Edition participant sync ───────────────────────────────────────────────────

export async function syncParticipantsToEditionSession(
	sessionId: string,
	editionId: string
): Promise<void> {
	const editionBPs = await db
		.select({
			id: bookingParticipants.id,
			name: bookingParticipants.name,
			sortOrder: bookingParticipants.sortOrder
		})
		.from(bookingParticipants)
		.innerJoin(bookingClients, eq(bookingParticipants.bookingClientId, bookingClients.id))
		.innerJoin(bookings, eq(bookingClients.bookingId, bookings.id))
		.where(
			and(
				eq(bookings.serviceEditionId, editionId),
				ne(bookings.status, 'cancelled'),
				eq(bookingClients.status, 'enrolled')
			)
		);

	if (editionBPs.length === 0) return;

	await db
		.insert(sessionParticipants)
		.values(
			editionBPs.map((bp, i) => ({
				id: crypto.randomUUID(),
				sessionId,
				bookingParticipantId: bp.id,
				name: bp.name,
				sortOrder: bp.sortOrder ?? i
			}))
		)
		.onConflictDoNothing();
}

export async function syncAllParticipantsToEditionSessions(editionId: string): Promise<void> {
	const editionSessions = await db
		.select({ id: sessions.id })
		.from(sessions)
		.where(and(eq(sessions.serviceEditionId, editionId), ne(sessions.status, 'cancelled')));

	await Promise.all(editionSessions.map((s) => syncParticipantsToEditionSession(s.id, editionId)));
}

// ── Session participants ──────────────────────────────────────────────────────

export async function listParticipantsForSession(sessionId: string): Promise<SessionParticipant[]> {
	return db
		.select({
			id: sessionParticipants.id,
			sessionId: sessionParticipants.sessionId,
			bookingParticipantId: sessionParticipants.bookingParticipantId,
			name: sessionParticipants.name,
			notes: sessionParticipants.notes,
			sortOrder: sessionParticipants.sortOrder
		})
		.from(sessionParticipants)
		.where(eq(sessionParticipants.sessionId, sessionId))
		.orderBy(sessionParticipants.sortOrder);
}

export async function addParticipant(
	input: CreateParticipantInput
): Promise<SessionParticipant | null> {
	// Deduplicate: if a bookingParticipantId is given, skip if already present on this session
	if (input.bookingParticipantId) {
		const [existing] = await db
			.select({ id: sessionParticipants.id })
			.from(sessionParticipants)
			.where(
				and(
					eq(sessionParticipants.sessionId, input.sessionId),
					eq(sessionParticipants.bookingParticipantId, input.bookingParticipantId)
				)
			);
		if (existing) return null;
	}
	const [row] = await db
		.insert(sessionParticipants)
		.values({
			id: crypto.randomUUID(),
			sessionId: input.sessionId,
			bookingParticipantId: input.bookingParticipantId ?? null,
			name: input.name.trim(),
			notes: input.notes ?? null,
			sortOrder: input.sortOrder ?? 0
		})
		.returning();
	return row ?? null;
}

export async function removeParticipant(participantId: string): Promise<void> {
	await db.delete(sessionParticipants).where(eq(sessionParticipants.id, participantId));
}

export async function renameSessionParticipant(participantId: string, name: string): Promise<void> {
	await db
		.update(sessionParticipants)
		.set({ name: name.trim() })
		.where(eq(sessionParticipants.id, participantId));
}

export async function renameSessionParticipantsByBookingParticipantId(
	bookingParticipantId: string,
	name: string
): Promise<void> {
	await db
		.update(sessionParticipants)
		.set({ name })
		.where(eq(sessionParticipants.bookingParticipantId, bookingParticipantId));
}

export type ParticipantWithContext = SessionParticipant & {
	bookingId: string | null;
	clientFirstName: string | null;
	clientLastName: string | null;
};

export async function listParticipantsWithContext(
	sessionId: string
): Promise<ParticipantWithContext[]> {
	return db
		.select({
			id: sessionParticipants.id,
			sessionId: sessionParticipants.sessionId,
			bookingParticipantId: sessionParticipants.bookingParticipantId,
			name: sessionParticipants.name,
			notes: sessionParticipants.notes,
			sortOrder: sessionParticipants.sortOrder,
			bookingId: bookings.id,
			clientFirstName: clients.firstName,
			clientLastName: clients.lastName
		})
		.from(sessionParticipants)
		.leftJoin(
			bookingParticipants,
			eq(bookingParticipants.id, sessionParticipants.bookingParticipantId)
		)
		.leftJoin(bookingClients, eq(bookingClients.id, bookingParticipants.bookingClientId))
		.leftJoin(bookings, eq(bookings.id, bookingClients.bookingId))
		.leftJoin(clients, eq(clients.id, bookingClients.clientId))
		.where(eq(sessionParticipants.sessionId, sessionId))
		.orderBy(sessionParticipants.sortOrder);
}

export async function listSessionsForClient(clientId: string): Promise<ClientSessionSummary[]> {
	return db
		.selectDistinct({
			sessionId: sessions.id,
			date: sessions.date,
			status: sessions.status,
			serviceName: sql<string | null>`(
				SELECT name FROM services
				WHERE id = COALESCE(
					${sessions.serviceId},
					(SELECT service_id FROM bookings WHERE id = ${sessions.bookingId}),
					(SELECT service_id FROM service_editions WHERE id = ${sessions.serviceEditionId})
				)
				LIMIT 1
			)`
		})
		.from(sessions)
		.innerJoin(sessionParticipants, eq(sessionParticipants.sessionId, sessions.id))
		.innerJoin(
			bookingParticipants,
			eq(bookingParticipants.id, sessionParticipants.bookingParticipantId)
		)
		.innerJoin(bookingClients, eq(bookingClients.id, bookingParticipants.bookingClientId))
		.where(eq(bookingClients.clientId, clientId))
		.orderBy(desc(sessions.date))
		.limit(20);
}

// All bookings for a service on a date, excluding those already on the given session
export async function listBookingsForServiceDate(
	serviceId: string,
	date: string,
	excludeSessionId: string
) {
	return db
		.select({
			bookingId: bookings.id,
			firstName: clients.firstName,
			lastName: clients.lastName,
			currentSessionId: bookings.sessionId
		})
		.from(bookings)
		.innerJoin(bookingClients, eq(bookingClients.bookingId, bookings.id))
		.innerJoin(clients, eq(clients.id, bookingClients.clientId))
		.where(
			and(
				eq(bookings.serviceId, serviceId),
				eq(bookings.date, date),
				or(isNull(bookings.sessionId), ne(bookings.sessionId, excludeSessionId)),
				ne(bookings.status, 'cancelled'),
				eq(bookingClients.status, 'enrolled')
			)
		)
		.orderBy(clients.firstName);
}

// All bookings enrolled in an edition (all attend all sessions)
export async function listEnrollmentsForEdition(editionId: string): Promise<BookingEnrollment[]> {
	return db
		.select({
			bookingId: bookings.id,
			clientId: bookingClients.clientId,
			firstName: clients.firstName,
			lastName: clients.lastName,
			amountDue: bookingClients.amountDue,
			amountPaid: bookingClients.amountPaid,
			status: bookingClients.status
		})
		.from(bookings)
		.innerJoin(bookingClients, eq(bookingClients.bookingId, bookings.id))
		.innerJoin(clients, eq(bookingClients.clientId, clients.id))
		.where(
			and(
				eq(bookings.serviceEditionId, editionId),
				ne(bookings.status, 'cancelled'),
				eq(bookingClients.status, 'enrolled')
			)
		);
}

// ── Unscheduled sessions (calendar strip) ─────────────────────────────────────

export async function listUnscheduledSessions(
	from: string,
	to: string
): Promise<
	(Session & {
		primaryBookingId: string | null;
		serviceName: string | null;
		serviceColor: string | null;
	})[]
> {
	const rows = await db
		.select(SESSION_COLS)
		.from(sessions)
		.where(
			and(eq(sessions.status, 'unscheduled'), gte(sessions.date, from), lte(sessions.date, to))
		)
		.orderBy(sessions.date, sessions.sortOrder);
	if (rows.length === 0) return [];

	const sRows = rows as Session[];
	const bookingIds = sRows.filter((s) => s.bookingId).map((s) => s.bookingId!);
	const svcLookup: Record<string, { name: string | null; color: string | null }> = {};

	if (bookingIds.length > 0) {
		const bRows = await db
			.select({ id: bookings.id, serviceId: bookings.serviceId })
			.from(bookings)
			.where(inArray(bookings.id, bookingIds));
		const svcIds = [...new Set(bRows.map((b) => b.serviceId).filter(Boolean))] as string[];
		const svcs =
			svcIds.length > 0
				? await db
						.select({ id: services.id, name: services.name, color: services.color })
						.from(services)
						.where(inArray(services.id, svcIds))
				: [];
		const svcMap = Object.fromEntries(svcs.map((s) => [s.id, s]));
		for (const b of bRows) svcLookup[b.id] = svcMap[b.serviceId!] ?? { name: null, color: null };
	}

	const wi = await attachInstructors(sRows as Omit<Session, 'instructors' | 'participants'>[]);
	return wi.map((s) => ({
		...s,
		participants: [],
		primaryBookingId: s.bookingId ?? null,
		serviceName: s.bookingId ? (svcLookup[s.bookingId]?.name ?? null) : null,
		serviceColor: s.bookingId ? (svcLookup[s.bookingId]?.color ?? null) : null
	}));
}
