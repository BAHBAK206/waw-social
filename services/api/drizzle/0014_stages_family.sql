CREATE TABLE "guardian_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"from" text NOT NULL,
	"student_id" uuid NOT NULL,
	"guardian_id" uuid,
	"email" text,
	"token_hash" text,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "grade_level" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "parental_controls" jsonb;--> statement-breakpoint
ALTER TABLE "guardian_requests" ADD CONSTRAINT "guardian_requests_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "guardian_requests" ADD CONSTRAINT "guardian_requests_guardian_id_users_id_fk" FOREIGN KEY ("guardian_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "guardian_requests_student_idx" ON "guardian_requests" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "guardian_requests_guardian_idx" ON "guardian_requests" USING btree ("guardian_id");--> statement-breakpoint
CREATE UNIQUE INDEX "guardian_requests_token_uq" ON "guardian_requests" USING btree ("token_hash");