CREATE TABLE "room_event_sequences" (
	"room_id" text PRIMARY KEY NOT NULL,
	"next_sequence" bigint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "room_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"room_id" text NOT NULL,
	"sequence" bigint NOT NULL,
	"command_id" uuid NOT NULL,
	"event_index" integer NOT NULL,
	"player_id" text,
	"user_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_xp_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"room_id" text NOT NULL,
	"reason" text NOT NULL,
	"amount" integer NOT NULL,
	"scoring_version" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "jigsaw_sessions" RENAME TO "player_sessions";--> statement-breakpoint
ALTER TABLE "jigsaw_room_participants" RENAME TO "room_participants";--> statement-breakpoint
ALTER TABLE "jigsaw_room_results" RENAME TO "room_results";--> statement-breakpoint
ALTER TABLE "room_participants" DROP CONSTRAINT "jigsaw_room_participants_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "room_results" ADD COLUMN "summary" jsonb;--> statement-breakpoint
ALTER TABLE "room_results" ADD COLUMN "scoring_version" integer;--> statement-breakpoint
ALTER TABLE "room_results" ADD COLUMN "contribution_version" integer;--> statement-breakpoint
ALTER TABLE "room_results" ADD COLUMN "finalized_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "xp_total" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "xp_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "room_events" ADD CONSTRAINT "room_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_xp_transactions" ADD CONSTRAINT "user_xp_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "room_events_room_sequence_uidx" ON "room_events" USING btree ("room_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "room_events_room_command_event_uidx" ON "room_events" USING btree ("room_id","command_id","event_index");--> statement-breakpoint
CREATE INDEX "room_events_room_created_at_idx" ON "room_events" USING btree ("room_id","created_at");--> statement-breakpoint
CREATE INDEX "room_events_room_type_sequence_idx" ON "room_events" USING btree ("room_id","event_type","sequence");--> statement-breakpoint
CREATE INDEX "room_events_player_room_sequence_idx" ON "room_events" USING btree ("player_id","room_id","sequence");--> statement-breakpoint
CREATE INDEX "room_events_user_created_at_idx" ON "room_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "user_xp_transactions_user_room_reason_uidx" ON "user_xp_transactions" USING btree ("user_id","room_id","reason");--> statement-breakpoint
CREATE INDEX "user_xp_transactions_user_created_at_idx" ON "user_xp_transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "user_xp_transactions_room_idx" ON "user_xp_transactions" USING btree ("room_id");--> statement-breakpoint
ALTER TABLE "room_participants" ADD CONSTRAINT "room_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
WITH "ranked_room_participants" AS (
	SELECT "id", ROW_NUMBER() OVER (
		PARTITION BY "room_id", "player_id"
		ORDER BY "last_seen_at" DESC, "id" DESC
	) AS "duplicate_rank"
	FROM "room_participants"
)
DELETE FROM "room_participants"
USING "ranked_room_participants"
WHERE "room_participants"."id" = "ranked_room_participants"."id"
	AND "ranked_room_participants"."duplicate_rank" > 1;--> statement-breakpoint
CREATE UNIQUE INDEX "room_participants_room_player_uidx" ON "room_participants" USING btree ("room_id","player_id");--> statement-breakpoint
CREATE INDEX "room_participants_user_room_idx" ON "room_participants" USING btree ("user_id","room_id");--> statement-breakpoint
CREATE INDEX "room_participants_anon_session_hash_idx" ON "room_participants" USING btree ("anon_session_hash");
