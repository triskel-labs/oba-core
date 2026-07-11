import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import { inventoryAllocations, inventoryItemTypes, inventoryItems } from '$lib/server/db/schema';
import type {
	InventoryAllocation,
	InventoryAllocationWithDetails,
	CreateAllocationInput,
	AllocationStatus
} from './types';

export async function createAllocations(
	inputs: CreateAllocationInput[]
): Promise<InventoryAllocation[]> {
	if (inputs.length === 0) return [];
	const rows = await db
		.insert(inventoryAllocations)
		.values(
			inputs.map((i) => ({
				bookingId: i.bookingId,
				bookingParticipantId: i.bookingParticipantId ?? null,
				itemTypeId: i.itemTypeId,
				itemId: i.itemId ?? null,
				quantity: i.quantity ?? 1,
				attributeFilter: i.attributeFilter ?? null,
				startDate: i.startDate,
				endDate: i.endDate ?? null
			}))
		)
		.returning();
	return rows as InventoryAllocation[];
}

export async function listAllocationsForBooking(
	bookingId: string
): Promise<InventoryAllocationWithDetails[]> {
	const rows = await db
		.select({
			id: inventoryAllocations.id,
			bookingId: inventoryAllocations.bookingId,
			bookingParticipantId: inventoryAllocations.bookingParticipantId,
			itemTypeId: inventoryAllocations.itemTypeId,
			itemId: inventoryAllocations.itemId,
			quantity: inventoryAllocations.quantity,
			attributeFilter: inventoryAllocations.attributeFilter,
			startDate: inventoryAllocations.startDate,
			endDate: inventoryAllocations.endDate,
			status: inventoryAllocations.status,
			createdAt: inventoryAllocations.createdAt,
			updatedAt: inventoryAllocations.updatedAt,
			itemTypeName: inventoryItemTypes.name,
			itemName: inventoryItems.name
		})
		.from(inventoryAllocations)
		.leftJoin(inventoryItemTypes, eq(inventoryAllocations.itemTypeId, inventoryItemTypes.id))
		.leftJoin(inventoryItems, eq(inventoryAllocations.itemId, inventoryItems.id))
		.where(eq(inventoryAllocations.bookingId, bookingId));
	return rows as InventoryAllocationWithDetails[];
}

export async function deleteAllocationsForBooking(bookingId: string): Promise<void> {
	await db
		.delete(inventoryAllocations)
		.where(eq(inventoryAllocations.bookingId, bookingId));
}

export async function updateAllocationStatus(
	id: string,
	status: AllocationStatus
): Promise<void> {
	await db
		.update(inventoryAllocations)
		.set({ status, updatedAt: new Date() })
		.where(eq(inventoryAllocations.id, id));
}

export async function updateAllocation(
	id: string,
	patch: { itemId?: string | null; status?: AllocationStatus; quantity?: number }
): Promise<void> {
	await db
		.update(inventoryAllocations)
		.set({ ...patch, updatedAt: new Date() })
		.where(eq(inventoryAllocations.id, id));
}

export async function deleteAllocation(id: string): Promise<void> {
	await db.delete(inventoryAllocations).where(eq(inventoryAllocations.id, id));
}

export async function createAllocation(input: CreateAllocationInput): Promise<InventoryAllocation> {
	const [row] = await db
		.insert(inventoryAllocations)
		.values({
			bookingId: input.bookingId,
			bookingParticipantId: input.bookingParticipantId ?? null,
			itemTypeId: input.itemTypeId,
			itemId: input.itemId ?? null,
			quantity: input.quantity ?? 1,
			attributeFilter: input.attributeFilter ?? null,
			startDate: input.startDate,
			endDate: input.endDate ?? null
		})
		.returning();
	return row as InventoryAllocation;
}

export async function assignParticipantToAllocation(
	allocationId: string,
	bookingParticipantId: string | null
): Promise<void> {
	await db
		.update(inventoryAllocations)
		.set({ bookingParticipantId, updatedAt: new Date() })
		.where(eq(inventoryAllocations.id, allocationId));
}
