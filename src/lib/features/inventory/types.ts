export type TrackingMode = 'pool' | 'specific';
export type ItemStatus = 'available' | 'maintenance' | 'retired';
export type AllocationStatus = 'allocated' | 'returned' | 'damaged' | 'lost';

export interface InventoryItemType {
	id: string;
	name: string;
	description: string | null;
	trackingMode: TrackingMode;
	totalPoolSize: number | null;
	attributeSchema: Record<string, string[]>;
	capacity: number | null;
	active: boolean;
	createdAt: Date;
	updatedAt: Date;
}

export interface InventoryItem {
	id: string;
	itemTypeId: string;
	name: string;
	attributes: Record<string, string>;
	status: ItemStatus;
	notes: string | null;
	sortOrder: number;
	createdAt: Date;
}

export interface InventoryItemTypeWithItems extends InventoryItemType {
	items: InventoryItem[];
}

export interface ServiceInventoryLink {
	id: string;
	serviceId: string;
	itemTypeId: string;
	quantityPerBooking: number;
	isIncluded: boolean;
	addonPrice: string | null;
	addonPricingMode: import('$lib/features/services/types').PricingMode | null;
	isOptional: boolean;
	createdAt: Date;
}

export interface ServiceInventoryLinkWithType extends ServiceInventoryLink {
	itemType: InventoryItemType;
}

export interface InventoryAllocation {
	id: string;
	bookingId: string;
	bookingParticipantId: string | null;
	itemTypeId: string;
	itemId: string | null;
	quantity: number;
	attributeFilter: Record<string, string> | null;
	startDate: string;
	endDate: string | null;
	status: AllocationStatus;
	createdAt: Date;
	updatedAt: Date;
}

export interface InventoryAllocationWithDetails extends InventoryAllocation {
	itemTypeName: string;
	itemName: string | null;
}

export interface AvailabilityResult {
	availableCount: number;
	availableItems: InventoryItem[];
}

export interface CreateInventoryItemTypeInput {
	name: string;
	description?: string;
	trackingMode: TrackingMode;
	totalPoolSize?: number | null;
	attributeSchema?: Record<string, string[]>;
	capacity?: number | null;
}

export interface CreateInventoryItemInput {
	name: string;
	attributes?: Record<string, string>;
	notes?: string;
	sortOrder?: number;
}

export interface CreateAllocationInput {
	bookingId: string;
	bookingParticipantId?: string | null;
	itemTypeId: string;
	itemId?: string | null;
	quantity?: number;
	attributeFilter?: Record<string, string> | null;
	startDate: string;
	endDate?: string | null;
}

export interface AddServiceInventoryLinkInput {
	itemTypeId: string;
	quantityPerBooking?: number;
	isIncluded?: boolean;
	addonPrice?: string | null;
	addonPricingMode?: import('$lib/features/services/types').PricingMode | null;
	isOptional?: boolean;
}

export interface UpdateServiceInventoryLinkInput {
	quantityPerBooking?: number;
	isIncluded?: boolean;
	addonPrice?: string | null;
	addonPricingMode?: import('$lib/features/services/types').PricingMode | null;
	isOptional?: boolean;
}
