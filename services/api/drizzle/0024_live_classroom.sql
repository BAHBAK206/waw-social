CREATE TABLE "live_attendance" (
	"room_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"first_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"last_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"seconds" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "live_attendance_room_id_user_id_pk" PRIMARY KEY("room_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "live_poll_votes" (
	"poll_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"choice" integer NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "live_poll_votes_poll_id_user_id_pk" PRIMARY KEY("poll_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "live_polls" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_id" uuid NOT NULL,
	"created_by" uuid,
	"question" text NOT NULL,
	"options" jsonb NOT NULL,
	"correct" integer,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp (3) with time zone
);
--> statement-breakpoint
ALTER TABLE "live_rooms" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "live_rooms" ADD COLUMN "breakout_name" text;--> statement-breakpoint
ALTER TABLE "live_rooms" ADD COLUMN "breakouts" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "live_rooms" ADD COLUMN "attendance_session_id" uuid;--> statement-breakpoint
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_room_id_live_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."live_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_attendance" ADD CONSTRAINT "live_attendance_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_poll_votes" ADD CONSTRAINT "live_poll_votes_poll_id_live_polls_id_fk" FOREIGN KEY ("poll_id") REFERENCES "public"."live_polls"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_poll_votes" ADD CONSTRAINT "live_poll_votes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_polls" ADD CONSTRAINT "live_polls_room_id_live_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."live_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "live_polls" ADD CONSTRAINT "live_polls_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_polls_room_idx" ON "live_polls" USING btree ("room_id");--> statement-breakpoint
ALTER TABLE "live_rooms" ADD CONSTRAINT "live_rooms_parent_id_live_rooms_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."live_rooms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "live_rooms_parent_idx" ON "live_rooms" USING btree ("parent_id");