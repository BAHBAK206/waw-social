ALTER TABLE "saved_items" ADD COLUMN "remind_at" timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "saved_items" ADD COLUMN "reminded_at" timestamp (3) with time zone;--> statement-breakpoint
CREATE INDEX "saved_items_remind_idx" ON "saved_items" USING btree ("remind_at");