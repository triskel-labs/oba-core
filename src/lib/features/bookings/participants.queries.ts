import { eq, sql } from 'drizzle-orm'
import { db } from '$lib/server/db'
import { bookingParticipants, bookingClients, sessionParticipants, inventoryAllocations } from '$lib/server/db/schema'
import type { BookingParticipant, PaymentStatus } from './types'

export async function listParticipantsForEnrollment(bookingClientId: string): Promise<BookingParticipant[]> {
	return db
		.select()
		.from(bookingParticipants)
		.where(eq(bookingParticipants.bookingClientId, bookingClientId))
		.orderBy(bookingParticipants.sortOrder, bookingParticipants.createdAt)
}

export async function addParticipant(
	bookingClientId: string,
	name: string,
	notes?: string | null
): Promise<BookingParticipant> {
	const existing = await listParticipantsForEnrollment(bookingClientId)
	const [row] = await db
		.insert(bookingParticipants)
		.values({ bookingClientId, name, notes: notes ?? null, sortOrder: existing.length })
		.returning()
	return row
}

export async function renameParticipant(id: string, name: string): Promise<void> {
	await db.update(bookingParticipants).set({ name }).where(eq(bookingParticipants.id, id))
}

export async function removeParticipant(id: string): Promise<void> {
	await db.delete(bookingParticipants).where(eq(bookingParticipants.id, id))
}

export async function syncParticipantCount(bookingClientId: string): Promise<void> {
	const [{ cnt }] = await db
		.select({ cnt: sql<string>`COUNT(*)` })
		.from(bookingParticipants)
		.where(eq(bookingParticipants.bookingClientId, bookingClientId))
	const count = Math.max(1, parseInt(cnt))
	await db.update(bookingClients).set({ participantCount: count }).where(eq(bookingClients.id, bookingClientId))
}

export async function updateParticipantPayment(
	participantId: string,
	amountPaid: string,
	paymentStatus: PaymentStatus
): Promise<void> {
	await db
		.update(bookingParticipants)
		.set({ amountPaid, paymentStatus })
		.where(eq(bookingParticipants.id, participantId))
}

export async function bulkAddParticipants(
	bookingClientId: string,
	names: string[]
): Promise<BookingParticipant[]> {
	const existing = await listParticipantsForEnrollment(bookingClientId)
	const existingNames = new Set(existing.map(p => p.name.trim().toLowerCase()))
	const toAdd = names
		.map(n => n.trim())
		.filter(n => n.length > 0 && !existingNames.has(n.toLowerCase()))
	if (toAdd.length === 0) return []
	const rows = await db
		.insert(bookingParticipants)
		.values(toAdd.map((name, i) => ({
			bookingClientId,
			name,
			sortOrder: existing.length + i
		})))
		.returning()
	return rows
}

export async function getParticipantRemovalImpact(
	participantId: string
): Promise<{ sessionCount: number; allocationCount: number }> {
	const [spCount, iaCount] = await Promise.all([
		db
			.select({ cnt: sql<string>`COUNT(*)` })
			.from(sessionParticipants)
			.where(eq(sessionParticipants.bookingParticipantId, participantId)),
		db
			.select({ cnt: sql<string>`COUNT(*)` })
			.from(inventoryAllocations)
			.where(eq(inventoryAllocations.bookingParticipantId, participantId))
	])
	return {
		sessionCount: parseInt(spCount[0].cnt),
		allocationCount: parseInt(iaCount[0].cnt)
	}
}

export async function removeParticipantWithCascade(participantId: string): Promise<void> {
	await db
		.update(inventoryAllocations)
		.set({ bookingParticipantId: null })
		.where(eq(inventoryAllocations.bookingParticipantId, participantId))
	await db
		.delete(sessionParticipants)
		.where(eq(sessionParticipants.bookingParticipantId, participantId))
	await db
		.delete(bookingParticipants)
		.where(eq(bookingParticipants.id, participantId))
}

export async function setEnrollmentParticipantCount(
	bookingClientId: string,
	count: number,
	clientFirstName?: string
): Promise<BookingParticipant[]> {
	const current = await listParticipantsForEnrollment(bookingClientId)

	if (count > current.length) {
		const toAdd = count - current.length
		const suffix = clientFirstName ? ` - [${clientFirstName}]` : ''
		await db.insert(bookingParticipants).values(
			Array.from({ length: toAdd }, (_, i) => ({
				bookingClientId,
				name: `Participante ${current.length + i + 1}${suffix}`,
				sortOrder: current.length + i
			}))
		)
	} else if (count < current.length) {
		const toRemove = current.slice(count)
		for (const p of toRemove) {
			await db.delete(bookingParticipants).where(eq(bookingParticipants.id, p.id))
		}
	}

	return listParticipantsForEnrollment(bookingClientId)
}
