CREATE TABLE "agenda_operator" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"agenda_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "agenda_operator" ADD CONSTRAINT "agenda_operator_organization_id_organization_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_operator" ADD CONSTRAINT "agenda_operator_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_operator" ADD CONSTRAINT "agenda_operator_agenda_id_queue_agenda_id_fk" FOREIGN KEY ("agenda_id") REFERENCES "public"."queue_agenda"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_operator_uq" ON "agenda_operator" USING btree ("agenda_id","user_id");