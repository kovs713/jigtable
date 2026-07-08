ALTER TABLE "jigsaw_room_results" 
ADD COLUMN IF NOT EXISTS "jigsaw_config" jsonb;
