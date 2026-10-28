ALTER TABLE "courses" ADD COLUMN "transfer_info" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "method" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "receipt" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reviewed_by" uuid;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reviewed_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reason" text;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "payments_course_provider_idx" ON "payments" USING btree ("course_id","provider","status");