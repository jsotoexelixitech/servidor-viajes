import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Cobro por viaje de la póliza de flota (Ridery):
 * - flota_tarifas_distancia: clasificación urbano / extra urbano y tarifa por km por flota.
 * - flota_certificados: conductor/vehículo → certificado (vhcerti.ccerti) de la póliza.
 * - flota_pagos_viaje: pago informado por la plataforma y recibo por viaje.
 * - flota_viajes: columnas de cobro por viaje.
 *
 * Idempotente (IF NOT EXISTS): en el 120/121 DB_SYNCHRONIZE=true ya crea todo y esta migración no cambia nada;
 * sirve para ambientes sin synchronize. Respeta DB_SCHEMA (ej. 'flota').
 */
export class FlotaCobroPorViaje1761955200000 implements MigrationInterface {
  name = 'FlotaCobroPorViaje1761955200000';

  private s(q: QueryRunner): string {
    const schema = (q.connection.options as { schema?: string }).schema;
    return schema ? `"${schema}".` : '';
  }

  public async up(q: QueryRunner): Promise<void> {
    const s = this.s(q);
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).catch(() => undefined);

    await q.query(`
      CREATE TABLE IF NOT EXISTS ${s}"flota_tarifas_distancia" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "clasificacion" varchar(20) NOT NULL,
        "nombre" varchar(60) NOT NULL,
        "km_desde" numeric(10,3) NOT NULL DEFAULT 0,
        "km_hasta" numeric(10,3),
        "tarifa_km" numeric(18,4) NOT NULL DEFAULT 0,
        "minimo" numeric(18,2) NOT NULL DEFAULT 0,
        "redondeo" varchar(12) NOT NULL DEFAULT 'KM_ARRIBA',
        "moneda" varchar(4) NOT NULL DEFAULT 'USD',
        "activa" boolean NOT NULL DEFAULT true,
        "actualizado_por" varchar(100),
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_flota_tarifas_tenant_clasif" ON ${s}"flota_tarifas_distancia" ("tenant_id", "clasificacion")`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS ${s}"flota_certificados" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "cnpoliza" varchar(30) NOT NULL,
        "ccerti" int NOT NULL,
        "placa" varchar(20),
        "conductor_doc" varchar(30),
        "conductor_doc_norm" varchar(30),
        "conductor_nombre" varchar(150),
        "istatcer" varchar(2),
        "activo" boolean NOT NULL DEFAULT true,
        "origen" varchar(10) NOT NULL DEFAULT 'MANUAL',
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_flota_cert_tenant_pol_cert" ON ${s}"flota_certificados" ("tenant_id", "cnpoliza", "ccerti")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_flota_cert_doc" ON ${s}"flota_certificados" ("tenant_id", "conductor_doc_norm")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_flota_cert_placa" ON ${s}"flota_certificados" ("tenant_id", "placa")`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS ${s}"flota_pagos_viaje" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "viaje_id" uuid NOT NULL,
        "id_externo" varchar(100) NOT NULL,
        "monto" numeric(18,2) NOT NULL,
        "moneda" varchar(4) NOT NULL,
        "referencia" varchar(100) NOT NULL,
        "metodo" varchar(30),
        "fecha_pago" timestamptz NOT NULL,
        "cnpoliza" varchar(30),
        "ccerti" int,
        "estado" varchar(20) NOT NULL,
        "modo" varchar(10) NOT NULL,
        "cnrecibo" varchar(30),
        "crecibo" varchar(30),
        "payload" jsonb,
        "respuesta" jsonb,
        "error" text,
        "intentos" int NOT NULL DEFAULT 1,
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_flota_pagos_tenant_viaje" ON ${s}"flota_pagos_viaje" ("tenant_id", "id_externo")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_flota_pagos_creado" ON ${s}"flota_pagos_viaje" ("tenant_id", "creado_en")`);

    await q.query(`
      ALTER TABLE IF EXISTS ${s}"flota_viajes"
        ADD COLUMN IF NOT EXISTS "modo_cobro" varchar(12) NOT NULL DEFAULT 'MENSUAL',
        ADD COLUMN IF NOT EXISTS "clasificacion" varchar(20),
        ADD COLUMN IF NOT EXISTS "tarifa_km" numeric(18,4),
        ADD COLUMN IF NOT EXISTS "km_estimados" numeric(12,3),
        ADD COLUMN IF NOT EXISTS "monto_estimado" numeric(18,2),
        ADD COLUMN IF NOT EXISTS "cnpoliza" varchar(30),
        ADD COLUMN IF NOT EXISTS "ccerti" int,
        ADD COLUMN IF NOT EXISTS "estado_pago" varchar(12)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    const s = this.s(q);
    await q.query(`DROP TABLE IF EXISTS ${s}"flota_pagos_viaje"`);
    await q.query(`DROP TABLE IF EXISTS ${s}"flota_certificados"`);
    await q.query(`DROP TABLE IF EXISTS ${s}"flota_tarifas_distancia"`);
    await q.query(`
      ALTER TABLE IF EXISTS ${s}"flota_viajes"
        DROP COLUMN IF EXISTS "modo_cobro", DROP COLUMN IF EXISTS "clasificacion", DROP COLUMN IF EXISTS "tarifa_km",
        DROP COLUMN IF EXISTS "km_estimados", DROP COLUMN IF EXISTS "monto_estimado", DROP COLUMN IF EXISTS "cnpoliza",
        DROP COLUMN IF EXISTS "ccerti", DROP COLUMN IF EXISTS "estado_pago"`);
  }
}
