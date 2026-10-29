CREATE TABLE "school_templates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"school_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"payload" jsonb NOT NULL,
	"author_id" uuid,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"teacher_id" uuid,
	"text" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "school_templates" ADD CONSTRAINT "school_templates_school_id_schools_id_fk" FOREIGN KEY ("school_id") REFERENCES "public"."schools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "school_templates" ADD CONSTRAINT "school_templates_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_comments" ADD CONSTRAINT "student_comments_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_comments" ADD CONSTRAINT "student_comments_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_comments" ADD CONSTRAINT "student_comments_teacher_id_users_id_fk" FOREIGN KEY ("teacher_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "school_templates_school_idx" ON "school_templates" USING btree ("school_id","kind","created_at");--> statement-breakpoint
CREATE INDEX "student_comments_idx" ON "student_comments" USING btree ("student_id","created_at");--> statement-breakpoint
CREATE INDEX "student_comments_course_idx" ON "student_comments" USING btree ("course_id","created_at");