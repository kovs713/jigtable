ALTER TABLE "collages" RENAME TO "compositions";
ALTER TABLE "collage_source_images" RENAME TO "composition_source_images";
ALTER TABLE "compositions" RENAME COLUMN "collage_id" TO "composition_id";
ALTER TABLE "composition_source_images" RENAME COLUMN "collage_id" TO "composition_id";
ALTER TABLE "compositions" RENAME COLUMN "output_key" TO "jigsaw_image_key";
ALTER TABLE "compositions" RENAME COLUMN "output_format" TO "jigsaw_image_format";
ALTER TABLE "composition_source_images"
RENAME CONSTRAINT
  "collage_source_images_collage_id_collages_collage_id_fk"
TO
  "composition_source_images_composition_id_compositions_composition_id_fk";
