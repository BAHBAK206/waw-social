ALTER TABLE "comments" ADD COLUMN "audio" jsonb;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "feedback_audio" jsonb;