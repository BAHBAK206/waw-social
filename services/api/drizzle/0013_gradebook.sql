CREATE TABLE "component_marks" (
	"component_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"marks" real NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "component_marks_component_id_student_id_pk" PRIMARY KEY("component_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "grade_components" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"course_id" uuid NOT NULL,
	"name" text NOT NULL,
	"max_marks" real NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "component_id" uuid;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "subject_code" text;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "max_marks" real DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "pass_marks" real DEFAULT 50 NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "counts_in_total" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "courses" ADD COLUMN "term" text;--> statement-breakpoint
ALTER TABLE "component_marks" ADD CONSTRAINT "component_marks_component_id_grade_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."grade_components"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_marks" ADD CONSTRAINT "component_marks_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "component_marks" ADD CONSTRAINT "component_marks_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grade_components" ADD CONSTRAINT "grade_components_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "component_marks_student_idx" ON "component_marks" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "grade_components_course_idx" ON "grade_components" USING btree ("course_id","position");--> statement-breakpoint
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_component_id_grade_components_id_fk" FOREIGN KEY ("component_id") REFERENCES "public"."grade_components"("id") ON DELETE set null ON UPDATE no action;