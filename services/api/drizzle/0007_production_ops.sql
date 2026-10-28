ALTER TABLE "videos" ADD COLUMN "stream_status" text DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "stream_url" text;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "stream_renditions" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "videos" ADD COLUMN "stream_error" text;--> statement-breakpoint
CREATE INDEX "videos_stream_idx" ON "videos" USING btree ("stream_status");