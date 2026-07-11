import {
	pgTable,
	pgEnum,
	text,
	timestamp,
	boolean,
	numeric,
	integer,
	date,
	time,
	jsonb,
	index,
	uniqueIndex,
	type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { user } from './auth.schema';
import type { ServiceModules } from '$lib/features/services/modules';

// ── Enums ─────────────────────────────────────────────────────────────────────

export const skillLevelEnum = pgEnum('skill_level', ['beginner', 'intermediate', 'advanced']);

export const bookingStatusEnum = pgEnum('booking_status', ['pending', 'confirmed', 'cancelled']);

export const paymentStatusEnum = pgEnum('payment_status', ['pending', 'partial', 'paid']);

export const pricingModeEnum = pgEnum('pricing_mode', [
	'flat',
	'per_person',
	'per_session',
	'per_person_per_session',
	'per_day',
	'per_night',
	'per_unit',
	'per_unit_per_day',
	'per_person_per_day',
	'per_hour',
	'per_half_day'
]);

export const sessionStatusEnum = pgEnum('session_status', ['unscheduled', 'scheduled', 'completed', 'cancelled']);
export const sessionOwnerTypeEnum = pgEnum('session_owner_type', ['booking', 'service', 'edition']);
export const bookingClientStatusEnum = pgEnum('booking_client_status', ['enrolled', 'cancelled']);
export const trackingModeEnum = pgEnum('tracking_mode', ['pool', 'specific']);
export const itemStatusEnum = pgEnum('item_status', ['available', 'maintenance', 'retired']);
export const allocationStatusEnum = pgEnum('allocation_status', ['allocated', 'returned', 'damaged', 'lost']);

// ── Tables ────────────────────────────────────────────────────────────────────

export const clients = pgTable('clients', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	firstName: text('first_name').notNull(),
	lastName: text('last_name').notNull(),
	phone: text('phone'),
	email: text('email'),
	nationality: text('nationality'),
	skillLevel: skillLevelEnum('skill_level'),
	notes: text('notes'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const services = pgTable('services', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	description: text('description'),
	// `type` kept as a display template hint — business logic now driven by modules JSONB below
	type: text('type').notNull().default('other'),
	// ── Modules ───────────────────────────────────────────────────────────────
	modules: jsonb('modules').$type<ServiceModules>().notNull().default({}),
	// ── Type-specific config ──────────────────────────────────────────────────
	durationMinutes: integer('duration_minutes'),
	defaultSessionsIncluded: integer('default_sessions_included'),
	basePrice: numeric('base_price', { precision: 10, scale: 2 }).notNull(),
	// How the service is priced — applies to all service types
	pricingMode: pricingModeEnum('pricing_mode'),
	maxCapacity: integer('max_capacity'),
	color: text('color').notNull().default('ocean'),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});

// Default instructors for a service — proper junction table replacing the old JSONB column.
// Cascade deletes: removing a service or user cleans up automatically.
export const serviceInstructors = pgTable('service_instructors', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	serviceId: text('service_id')
		.notNull()
		.references(() => services.id, { onDelete: 'cascade' }),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').notNull().defaultNow()
}, (t) => [
	index('idx_service_instructors_service').on(t.serviceId),
	index('idx_service_instructors_user').on(t.userId)
]);

export const serviceEditions = pgTable('service_editions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	serviceId: text('service_id')
		.notNull()
		.references(() => services.id, { onDelete: 'cascade' }),
	startDate: date('start_date').notNull(),
	endDate: date('end_date').notNull(),
	maxCapacity: integer('max_capacity'),
	notes: text('notes'),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (t) => [
	index('idx_service_editions_service').on(t.serviceId),
	index('idx_service_editions_dates').on(t.startDate, t.endDate)
]);

export const bookings = pgTable('bookings', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	serviceId: text('service_id')
		.references(() => services.id),
	date: date('date').notNull(),
	dateEnd: date('date_end'),
	serviceEditionId: text('service_edition_id')
		.references(() => serviceEditions.id, { onDelete: 'set null' }),
	time: time('time'),
	sessionsIncluded: integer('sessions_included'),
	isFlexible: boolean('is_flexible').notNull().default(false),
	status: bookingStatusEnum('status').notNull().default('pending'),
	source: text('source').notNull().default('admin'),
	quantity: integer('quantity').notNull().default(1),
	spotNotes: text('spot_notes'),
	notes: text('notes'),
	sessionId: text('session_id')
		.references((): AnyPgColumn => sessions.id, { onDelete: 'set null' }),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (t) => [
	index('idx_bookings_date').on(t.date),
	index('idx_bookings_status').on(t.status),
	index('idx_bookings_service').on(t.serviceId),
	index('idx_bookings_service_edition').on(t.serviceEditionId),
	index('idx_bookings_session_id').on(t.sessionId)
]);

export const bookingClients = pgTable('booking_clients', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	bookingId: text('booking_id')
		.notNull()
		.references(() => bookings.id, { onDelete: 'cascade' }),
	clientId: text('client_id')
		.notNull()
		.references(() => clients.id),
	status: bookingClientStatusEnum('status').notNull().default('enrolled'),
	participantCount: integer('participant_count').notNull().default(1),
	creditSourceId: text('credit_source_id').references((): AnyPgColumn => bookings.id),
	creditCount: integer('credit_count').notNull().default(0),
	priceOverride: numeric('price_override', { precision: 10, scale: 2 }),
	overrideReason: text('override_reason'),
	amountDue: numeric('amount_due', { precision: 10, scale: 2 }).notNull(),
	amountPaid: numeric('amount_paid', { precision: 10, scale: 2 }).notNull().default('0'),
	paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
	cancelledAt: timestamp('cancelled_at')
}, (t) => [
	index('idx_booking_clients_booking').on(t.bookingId),
	index('idx_booking_clients_client').on(t.clientId),
	uniqueIndex('uq_booking_clients_booking').on(t.bookingId).where(sql`${t.status} = 'enrolled'`)
]);

export const bookingParticipants = pgTable('booking_participants', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	bookingClientId: text('booking_client_id').references(() => bookingClients.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	notes: text('notes'),
	sortOrder: integer('sort_order').notNull().default(0),
	amountPaid: numeric('amount_paid', { precision: 10, scale: 2 }).notNull().default('0'),
	paymentStatus: paymentStatusEnum('payment_status').notNull().default('pending'),
	createdAt: timestamp('created_at').notNull().defaultNow()
}, (t) => [
	index('idx_booking_participants_booking_client').on(t.bookingClientId)
]);

export const events = pgTable('events', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	title: text('title').notNull(),
	description: text('description'),
	startDate: date('start_date').notNull(),
	endDate: date('end_date').notNull(),
	// TODO: wire up as bookable entities — needs client enrollment, payments, email notifications
	serviceId: text('service_id').references(() => services.id),
	price: numeric('price', { precision: 10, scale: 2 }),
	notes: text('notes'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const whatsappSessions = pgTable('whatsapp_sessions', {
	whatsappId:    text('whatsapp_id').primaryKey(),
	state:         text('state').notNull().default('IDLE'),
	serviceType:   text('service_type'),
	collectedData: jsonb('collected_data'),
	reservationId: text('reservation_id'),
	language:      text('language').default('es'),
	lastActivity:  timestamp('last_activity').notNull().defaultNow()
});

// ── Sessions ──────────────────────────────────────────────────────────────────

export const sessions = pgTable('sessions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	ownerType: sessionOwnerTypeEnum('owner_type').notNull(),
	bookingId: text('booking_id')
		.references(() => bookings.id, { onDelete: 'cascade' }),
	serviceId: text('service_id')
		.references(() => services.id, { onDelete: 'cascade' }),
	serviceEditionId: text('service_edition_id')
		.references(() => serviceEditions.id, { onDelete: 'cascade' }),
	date: date('date').notNull(),
	time: time('time'),
	durationMinutes: integer('duration_minutes'),
	notes: text('notes'),
	skillLevel: skillLevelEnum('skill_level'),
	status: sessionStatusEnum('status').notNull().default('unscheduled'),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (t) => [
	index('idx_sessions_date').on(t.date),
	index('idx_sessions_status').on(t.status),
	index('idx_sessions_booking_id').on(t.bookingId),
	index('idx_sessions_service_id').on(t.serviceId),
	index('idx_sessions_service_edition_id').on(t.serviceEditionId)
]);

export const bookingSessions = pgTable('booking_sessions', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	sessionId: text('session_id')
		.notNull()
		.references(() => sessions.id, { onDelete: 'cascade' }),
	bookingId: text('booking_id')
		.notNull()
		.references(() => bookings.id, { onDelete: 'cascade' }),
	createdAt: timestamp('created_at').notNull().defaultNow()
}, (t) => [
	index('idx_booking_sessions_session').on(t.sessionId),
	index('idx_booking_sessions_booking').on(t.bookingId)
]);

export const sessionInstructors = pgTable('session_instructors', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	sessionId: text('session_id')
		.notNull()
		.references(() => sessions.id, { onDelete: 'cascade' }),
	instructorId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
}, (t) => [
	index('idx_session_instructors_session').on(t.sessionId),
	index('idx_session_instructors_user').on(t.instructorId)
]);

export const sessionParticipants = pgTable('session_participants', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	sessionId: text('session_id')
		.notNull()
		.references(() => sessions.id, { onDelete: 'cascade' }),
	bookingParticipantId: text('booking_participant_id')
		.references(() => bookingParticipants.id, { onDelete: 'set null' }),
	name: text('name').notNull(),
	notes: text('notes'),
	paid: boolean('paid').notNull().default(false),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: timestamp('created_at').notNull().defaultNow()
}, (t) => [
	index('idx_session_participants_bp').on(t.sessionId, t.bookingParticipantId)
]);

export const bookingInstructors = pgTable('booking_instructors', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	bookingId: text('booking_id')
		.notNull()
		.references(() => bookings.id, { onDelete: 'cascade' }),
	instructorId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' })
}, (t) => [
	index('idx_booking_instructors_booking').on(t.bookingId),
	index('idx_booking_instructors_user').on(t.instructorId)
]);

// ── Inventory ─────────────────────────────────────────────────────────────────

export const inventoryItemTypes = pgTable('inventory_item_types', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	name: text('name').notNull(),
	description: text('description'),
	trackingMode: trackingModeEnum('tracking_mode').notNull().default('pool'),
	totalPoolSize: integer('total_pool_size'),
	attributeSchema: jsonb('attribute_schema')
		.$type<Record<string, string[]>>()
		.notNull()
		.default({}),
	capacity: integer('capacity'),
	active: boolean('active').notNull().default(true),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
});

export const inventoryItems = pgTable('inventory_items', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	itemTypeId: text('item_type_id')
		.notNull()
		.references(() => inventoryItemTypes.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	attributes: jsonb('attributes')
		.$type<Record<string, string>>()
		.notNull()
		.default({}),
	status: itemStatusEnum('status').notNull().default('available'),
	notes: text('notes'),
	sortOrder: integer('sort_order').notNull().default(0),
	createdAt: timestamp('created_at').notNull().defaultNow()
}, (t) => [
	index('idx_inventory_items_type').on(t.itemTypeId)
]);

export const serviceInventoryLinks = pgTable('service_inventory_links', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	serviceId: text('service_id')
		.notNull()
		.references(() => services.id, { onDelete: 'cascade' }),
	itemTypeId: text('item_type_id')
		.notNull()
		.references(() => inventoryItemTypes.id, { onDelete: 'cascade' }),
	quantityPerBooking: integer('quantity_per_booking').notNull().default(1),
	isIncluded: boolean('is_included').notNull().default(true),
	// When not included: optional add-on with its own price
	addonPrice: numeric('addon_price', { precision: 10, scale: 2 }),
	addonPricingMode: pricingModeEnum('addon_pricing_mode'),
	isOptional: boolean('is_optional').notNull().default(true),
	createdAt: timestamp('created_at').notNull().defaultNow()
}, (t) => [
	index('idx_service_inventory_links_service').on(t.serviceId),
	index('idx_service_inventory_links_item_type').on(t.itemTypeId),
	uniqueIndex('uq_service_inventory_links').on(t.serviceId, t.itemTypeId)
]);

export const inventoryAllocations = pgTable('inventory_allocations', {
	id: text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID()),
	bookingId: text('booking_id')
		.notNull()
		.references(() => bookings.id, { onDelete: 'cascade' }),
	bookingParticipantId: text('booking_participant_id')
		.references(() => bookingParticipants.id, { onDelete: 'set null' }),
	itemTypeId: text('item_type_id')
		.notNull()
		.references(() => inventoryItemTypes.id, { onDelete: 'restrict' }),
	itemId: text('item_id')
		.references(() => inventoryItems.id, { onDelete: 'set null' }),
	quantity: integer('quantity').notNull().default(1),
	attributeFilter: jsonb('attribute_filter').$type<Record<string, string> | null>(),
	startDate: date('start_date').notNull(),
	endDate: date('end_date'),
	status: allocationStatusEnum('status').notNull().default('allocated'),
	createdAt: timestamp('created_at').notNull().defaultNow(),
	updatedAt: timestamp('updated_at').notNull().defaultNow()
}, (t) => [
	index('idx_inventory_allocations_booking').on(t.bookingId),
	index('idx_inventory_allocations_participant').on(t.bookingParticipantId),
	index('idx_inventory_allocations_item_type').on(t.itemTypeId),
	index('idx_inventory_allocations_item').on(t.itemId),
	index('idx_inventory_allocations_dates').on(t.startDate, t.endDate)
]);

// Re-export Better Auth schema so db/index.ts imports everything from one place
export * from './auth.schema';
