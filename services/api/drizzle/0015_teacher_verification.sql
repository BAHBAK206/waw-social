CREATE TABLE "teacher_verifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"institution" text NOT NULL,
	"subject" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"proof" jsonb,
	"proof_url" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" text DEFAULT '' NOT NULL,
	"reviewed_by" uuid,
	"reviewed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "teacher_verified_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "teacher_verifications" ADD CONSTRAINT "teacher_verifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teacher_verifications" ADD CONSTRAINT "teacher_verifications_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "teacher_verifications_status_idx" ON "teacher_verifications" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "teacher_verifications_user_idx" ON "teacher_verifications" USING btree ("user_id");