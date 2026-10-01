ALTER TABLE "consumos" DROP CONSTRAINT "consumos_origen_check";--> statement-breakpoint
ALTER TABLE "consumos" ADD COLUMN "solicitud_id" uuid;--> statement-breakpoint
CREATE UNIQUE INDEX "consumos_usuario_solicitud_uidx" ON "consumos" USING btree ("usuario_id","solicitud_id");--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "consumos_origen_check" CHECK ("consumos"."origen" IN ('camara', 'galeria', 'manual'));