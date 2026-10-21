CREATE TABLE "queue_agenda" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"room" text DEFAULT '' NOT NULL,
	"walk_in_mode" text DEFAULT 'queue' NOT NULL,
	"slot_minutes" integer DEFAULT 15 NOT NULL,
	"opens_at" text DEFAULT '09:00' NOT NULL,
	"closes_at" text DEFAULT '18:00' NOT NULL,
	"number_prefix" text NOT NULL,
	"notify_before" integer DEFAULT 2 NOT NULL,
	"receives_bookings" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "queue_agenda_slot_ck" CHECK ("queue_agenda"."slot_minutes" > 0)
);
--> statement-breakpoint
CREATE TABLE "turn" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"agenda_id" text NOT NULL,
	"day" date NOT NULL,
	"number" integer NOT NULL,
	"display_name" text NOT NULL,
	"scheduled_at" timestamp,
	"status" text DEFAULT 'waiting' NOT NULL,
	"token_hash" text NOT NULL,
	"source" text NOT NULL,
	"contact_id" text,
	"conversation_id" text,
	"booking_id" text,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	"called_at" timestamp,
	"started_at" timestamp,
	"finished_at" timestamp,
	"confirmed_at" timestamp,
	"notice_failed" boolean DEFAULT false NOT NULL,
	"status_changed_by" text,
	"status_changed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_event" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"turn_id" text NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor" text NOT NULL,
	"user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "turn_notice" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"turn_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "queue_agenda" ADD CONSTRAINT "queue_agenda_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_agenda_id_queue_agenda_id_fk" FOREIGN KEY ("agenda_id") REFERENCES "public"."queue_agenda"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_contact_id_contact_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contact"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_conversation_id_conversation_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn" ADD CONSTRAINT "turn_booking_id_booking_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."booking"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_event" ADD CONSTRAINT "turn_event_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_event" ADD CONSTRAINT "turn_event_turn_id_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_notice" ADD CONSTRAINT "turn_notice_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "turn_notice" ADD CONSTRAINT "turn_notice_turn_id_turn_id_fk" FOREIGN KEY ("turn_id") REFERENCES "public"."turn"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "queue_agenda_org_prefix_uq" ON "queue_agenda" USING btree ("organization_id","number_prefix");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_token_uq" ON "turn" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_agenda_day_number_uq" ON "turn" USING btree ("agenda_id","day","number");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_booking_uq" ON "turn" USING btree ("booking_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_contact_activo_uq" ON "turn" USING btree ("agenda_id","day","contact_id") WHERE "turn"."status" in ('waiting','called','in_service') and "turn"."contact_id" is not null;--> statement-breakpoint
CREATE INDEX "turn_org_day_idx" ON "turn" USING btree ("organization_id","day");--> statement-breakpoint
CREATE INDEX "turn_event_turn_idx" ON "turn_event" USING btree ("turn_id");--> statement-breakpoint
CREATE UNIQUE INDEX "turn_notice_turn_kind_uq" ON "turn_notice" USING btree ("turn_id","kind");