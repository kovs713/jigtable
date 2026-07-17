ALTER TABLE "batch_photos" RENAME TO "collage_source_images";--> statement-breakpoint
ALTER TABLE "collage_source_images" RENAME COLUMN "batch_id" TO "collage_id";--> statement-breakpoint
ALTER TABLE "collage_source_images" DROP CONSTRAINT "batch_photos_batch_id_collages_collage_id_fk";
--> statement-breakpoint
ALTER TABLE "collage_source_images" ADD CONSTRAINT "collage_source_images_collage_id_collages_collage_id_fk" FOREIGN KEY ("collage_id") REFERENCES "public"."collages"("collage_id") ON DELETE cascade ON UPDATE no action;