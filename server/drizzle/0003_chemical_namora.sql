ALTER TABLE "batches" RENAME TO "collages";--> statement-breakpoint
ALTER TABLE "collages" RENAME COLUMN "batch_id" TO "collage_id";--> statement-breakpoint
ALTER TABLE "batch_photos" DROP CONSTRAINT "batch_photos_batch_id_batches_batch_id_fk";
--> statement-breakpoint
ALTER TABLE "batch_photos" ADD CONSTRAINT "batch_photos_batch_id_collages_collage_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."collages"("collage_id") ON DELETE cascade ON UPDATE no action;