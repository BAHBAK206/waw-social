CREATE TABLE "timetable_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid,
	"day" integer NOT NULL,
	"start" text NOT NULL,
	"end" text NOT NULL,
	"title" text NOT NULL,
	"room" text DEFAULT '' NOT NULL,
	"color" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timetable_entries" ADD CONSTRAINT "timetable_entries_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timetable_user_idx" ON "timetable_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "timetable_course_idx" ON "timetable_entries" USING btree ("course_id");