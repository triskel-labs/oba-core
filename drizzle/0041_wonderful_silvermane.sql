ALTER TABLE "booking_participants" ADD COLUMN "amount_paid" numeric(10, 2) DEFAULT '0' NOT NULL;--> statement-breakpoint
ALTER TABLE "booking_participants" ADD COLUMN "payment_status" "payment_status" DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD COLUMN "booking_participant_id" text;--> statement-breakpoint
ALTER TABLE "session_participants" ADD COLUMN "paid" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "inventory_allocations" ADD CONSTRAINT "inventory_allocations_booking_participant_id_booking_participants_id_fk" FOREIGN KEY ("booking_participant_id") REFERENCES "public"."booking_participants"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_booking_clients_booking" ON "booking_clients" USING btree ("booking_id") WHERE "booking_clients"."status" = 'enrolled';--> statement-breakpoint
CREATE INDEX "idx_inventory_allocations_participant" ON "inventory_allocations" USING btree ("booking_participant_id");