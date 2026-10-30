CREATE TABLE "comment_votes" (
	"comment_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "comment_votes_comment_id_user_id_pk" PRIMARY KEY("comment_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "pronunciation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"language" text NOT NULL,
	"phrase" text NOT NULL,
	"heard" text DEFAULT '' NOT NULL,
	"score" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "video_notes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"video_id" uuid NOT NULL,
	"at_sec" integer DEFAULT 0 NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "comments" ADD COLUMN "votes" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "kind" text DEFAULT 'discussion' NOT NULL;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "material_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "accepted_comment_id" uuid;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN "solved_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "quiz_id" uuid;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "comment_votes" ADD CONSTRAINT "comment_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pronunciation_attempts" ADD CONSTRAINT "pronunciation_attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_notes" ADD CONSTRAINT "video_notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "video_notes" ADD CONSTRAINT "video_notes_video_id_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pron_user_idx" ON "pronunciation_attempts" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "video_notes_user_video_idx" ON "video_notes" USING btree ("user_id","video_id","at_sec");--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_material_id_edu_materials_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."edu_materials"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "videos" ADD CONSTRAINT "videos_quiz_id_quizzes_id_fk" FOREIGN KEY ("quiz_id") REFERENCES "public"."quizzes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "posts_kind_idx" ON "posts" USING btree ("kind","solved_at","created_at");--> statement-breakpoint
CREATE INDEX "posts_material_idx" ON "posts" USING btree ("material_id","created_at");