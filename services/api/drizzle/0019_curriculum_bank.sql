CREATE TABLE "curriculum_links" (
	"node_id" uuid NOT NULL,
	"target_type" text NOT NULL,
	"target_id" uuid NOT NULL,
	"created_by" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "curriculum_links_node_id_target_type_target_id_pk" PRIMARY KEY("node_id","target_type","target_id")
);
--> statement-breakpoint
CREATE TABLE "curriculum_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"parent_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"code" text,
	"description" text,
	"system" text DEFAULT 'general' NOT NULL,
	"grade_level" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"search_text" text DEFAULT '' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "objective_samples" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"objective_id" uuid NOT NULL,
	"correct" integer NOT NULL,
	"total" integer NOT NULL,
	"attempt_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "option_orders" jsonb;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "integrity" jsonb;--> statement-breakpoint
ALTER TABLE "quiz_attempts" ADD COLUMN "placement_subject_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "objective_id" uuid;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "bloom" text;--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "shuffle_options" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "integrity" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "blueprint" jsonb;--> statement-breakpoint
ALTER TABLE "quizzes" ADD COLUMN "curriculum_id" uuid;--> statement-breakpoint
ALTER TABLE "curriculum_links" ADD CONSTRAINT "curriculum_links_node_id_curriculum_nodes_id_fk" FOREIGN KEY ("node_id") REFERENCES "public"."curriculum_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_links" ADD CONSTRAINT "curriculum_links_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_parent_id_curriculum_nodes_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."curriculum_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "curriculum_nodes" ADD CONSTRAINT "curriculum_nodes_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_samples" ADD CONSTRAINT "objective_samples_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objective_samples" ADD CONSTRAINT "objective_samples_objective_id_curriculum_nodes_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."curriculum_nodes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "curriculum_links_target_idx" ON "curriculum_links" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "curriculum_parent_idx" ON "curriculum_nodes" USING btree ("parent_id","sort");--> statement-breakpoint
CREATE INDEX "curriculum_subject_idx" ON "curriculum_nodes" USING btree ("kind","system","grade_level");--> statement-breakpoint
CREATE INDEX "objective_samples_user_idx" ON "objective_samples" USING btree ("user_id","objective_id","created_at");--> statement-breakpoint
ALTER TABLE "quiz_questions" ADD CONSTRAINT "quiz_questions_objective_id_curriculum_nodes_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."curriculum_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quizzes" ADD CONSTRAINT "quizzes_curriculum_id_curriculum_nodes_id_fk" FOREIGN KEY ("curriculum_id") REFERENCES "public"."curriculum_nodes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quiz_questions_objective_idx" ON "quiz_questions" USING btree ("objective_id");