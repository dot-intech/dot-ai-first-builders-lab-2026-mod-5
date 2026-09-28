CREATE TABLE "consumos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"descripcion" text NOT NULL,
	"calorias" integer NOT NULL,
	"pct_carbohidratos" smallint NOT NULL,
	"pct_proteinas" smallint NOT NULL,
	"pct_grasas" smallint NOT NULL,
	"pct_otros" smallint NOT NULL,
	"origen" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "consumos_descripcion_check" CHECK (char_length("consumos"."descripcion") BETWEEN 1 AND 500),
	CONSTRAINT "consumos_calorias_check" CHECK ("consumos"."calorias" BETWEEN 0 AND 10000),
	CONSTRAINT "consumos_pct_carbohidratos_check" CHECK ("consumos"."pct_carbohidratos" BETWEEN 0 AND 100),
	CONSTRAINT "consumos_pct_proteinas_check" CHECK ("consumos"."pct_proteinas" BETWEEN 0 AND 100),
	CONSTRAINT "consumos_pct_grasas_check" CHECK ("consumos"."pct_grasas" BETWEEN 0 AND 100),
	CONSTRAINT "consumos_pct_otros_check" CHECK ("consumos"."pct_otros" BETWEEN 0 AND 100),
	CONSTRAINT "consumos_origen_check" CHECK ("consumos"."origen" IN ('camara', 'galeria')),
	CONSTRAINT "consumos_desglose_suma_check" CHECK ("consumos"."pct_carbohidratos" + "consumos"."pct_proteinas" + "consumos"."pct_grasas" + "consumos"."pct_otros" = 100)
);
--> statement-breakpoint
ALTER TABLE "consumos" ADD CONSTRAINT "consumos_usuario_id_usuarios_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuarios"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "consumos_usuario_id_idx" ON "consumos" USING btree ("usuario_id");