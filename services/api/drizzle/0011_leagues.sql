CREATE TABLE "league_members" (
	"week" date NOT NULL,
	"user_id" uuid NOT NULL,
	"tier" integer NOT NULL,
	"group_no" integer NOT NULL,
	"xp" integer DEFAULT 0 NOT NULL,
	"joined_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"result" text,
	CONSTRAINT "league_members_week_user_id_pk" PRIMARY KEY("week","user_id")
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "league_tier" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "league_members" ADD CONSTRAINT "league_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "league_members_group_idx" ON "league_members" USING btree ("week","tier","group_no");