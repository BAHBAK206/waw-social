CREATE TABLE "focus_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"started_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp (3) with time zone NOT NULL,
	"ended_at" timestamp (3) with time zone,
	"minutes" integer DEFAULT 0 NOT NULL,
	"muted" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "glossary_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"course_id" uuid,
	"subject" text NOT NULL,
	"term" text NOT NULL,
	"definition" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "question_reviews" (
	"user_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"ease" real DEFAULT 2.5 NOT NULL,
	"level" integer DEFAULT 0 NOT NULL,
	"repetitions" integer DEFAULT 0 NOT NULL,
	"lapses" integer DEFAULT 0 NOT NULL,
	"interval_days" double precision DEFAULT 0 NOT NULL,
	"misses" integer DEFAULT 0 NOT NULL,
	"due_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_result" boolean,
	"last_reviewed_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "question_reviews_user_id_question_id_pk" PRIMARY KEY("user_id","question_id")
);
--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "paper_year" integer;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "paper_board" text;--> statement-breakpoint
ALTER TABLE "focus_sessions" ADD CONSTRAINT "focus_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "glossary_terms" ADD CONSTRAINT "glossary_terms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reviews" ADD CONSTRAINT "question_reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "question_reviews" ADD CONSTRAINT "question_reviews_question_id_quiz_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."quiz_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "focus_sessions_user_idx" ON "focus_sessions" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "glossary_subject_idx" ON "glossary_terms" USING btree ("user_id","subject");--> statement-breakpoint
CREATE INDEX "glossary_course_idx" ON "glossary_terms" USING btree ("course_id");--> statement-breakpoint
CREATE INDEX "question_reviews_due_idx" ON "question_reviews" USING btree ("user_id","due_at");