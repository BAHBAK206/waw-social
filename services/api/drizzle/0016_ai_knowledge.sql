CREATE TABLE "assistant_gaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question" text NOT NULL,
	"normalized" text NOT NULL,
	"language" text DEFAULT 'ar' NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"last_asked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assistant_knowledge" ADD COLUMN "course_id" uuid;--> statement-breakpoint
ALTER TABLE "assistant_knowledge" ADD COLUMN "created_by" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "assistant_gaps_normalized_uq" ON "assistant_gaps" USING btree ("normalized");--> statement-breakpoint
CREATE INDEX "assistant_gaps_count_idx" ON "assistant_gaps" USING btree ("count");--> statement-breakpoint
ALTER TABLE "assistant_knowledge" ADD CONSTRAINT "assistant_knowledge_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assistant_knowledge" ADD CONSTRAINT "assistant_knowledge_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assistant_knowledge_course_idx" ON "assistant_knowledge" USING btree ("course_id");