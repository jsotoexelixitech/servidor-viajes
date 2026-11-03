import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fase 1 Ridery (3-nov): póliza registrada y recibos por viaje en NUESTRA base.
 * - flota_polizas: póliza ya emitida por La Mundial, registrada y validada con nest-api (no escribe en Sis2000).
 * - flota_recibos: recibo por viaje con numeración propia RDY-<cnpoliza>-<ccerti>-<seq>, estado
 *   PENDIENTE / COBRADO / ANULADO y sync_sis2000 PENDIENTE / OK / ERROR (+ cnrecibo de Sis2000 cuando exista).
 * - flota_pagos_viaje.cnrecibo: 30 → 60 (el número propio puede pasar de 30).
 *
 * Aditiva e idempotente (IF NOT EXISTS). Respeta DB_SCHEMA (ej. 'flota').
 */
export class FlotaRecibosNexus1762128000000 implements MigrationInterface {
  name = 'FlotaRecibosNexus1762128000000';

  private s(q: QueryRunner): string {
    const schema = (q.connection.options as { schema?: string }).schema;
    return schema ? `"${schema}".` : '';
  }

  public async up(q: QueryRunner): Promise<void> {
    const s = this.s(q);
    await q.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`).catch(() => undefined);

    await q.query(`
      CREATE TABLE IF NOT EXISTS ${s}"flota_polizas" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "cnpoliza" varchar(30) NOT NULL,
        "origen" varchar(12) NOT NULL DEFAULT 'REGISTRADA',
        "tomador_nombre" varchar(150),
        "tomador_rif" varchar(20),
        "validada" boolean NOT NULL DEFAULT false,
        "validacion" jsonb,
        "activa" boolean NOT NULL DEFAULT true,
        "registrado_por" varchar(100),
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_flota_polizas_tenant_pol" ON ${s}"flota_polizas" ("tenant_id", "cnpoliza")`);

    await q.query(`
      CREATE TABLE IF NOT EXISTS ${s}"flota_recibos" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4() PRIMARY KEY,
        "tenant_id" uuid NOT NULL,
        "numero" varchar(60) NOT NULL,
        "cnpoliza" varchar(30) NOT NULL,
        "ccerti" int NOT NULL,
        "secuencia" int NOT NULL,
        "viaje_id" uuid NOT NULL,
        "id_externo" varchar(100) NOT NULL,
        "monto" numeric(18,2) NOT NULL,
        "moneda" varchar(4) NOT NULL,
        "fdesde" timestamptz NOT NULL,
        "fhasta" timestamptz,
        "estado" varchar(10) NOT NULL DEFAULT 'PENDIENTE',
        "fecha_cobro" timestamptz,
        "referencia_pago" varchar(100),
        "metodo_pago" varchar(30),
        "pago_id" uuid,
        "anulado_en" timestamptz,
        "motivo_anulacion" varchar(250),
        "sync_sis2000" varchar(10) NOT NULL DEFAULT 'PENDIENTE',
        "cnrecibo_sis2000" varchar(30),
        "crecibo_sis2000" varchar(30),
        "sync_error" text,
        "sync_en" timestamptz,
        "creado_en" timestamptz NOT NULL DEFAULT now(),
        "actualizado_en" timestamptz NOT NULL DEFAULT now()
      )`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_flota_recibos_tenant_viaje" ON ${s}"flota_recibos" ("tenant_id", "id_externo")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_flota_recibos_tenant_numero" ON ${s}"flota_recibos" ("tenant_id", "numero")`);
    await q.query(`CREATE UNIQUE INDEX IF NOT EXISTS "ux_flota_recibos_pol_cert_seq" ON ${s}"flota_recibos" ("tenant_id", "cnpoliza", "ccerti", "secuencia")`);
    await q.query(`CREATE INDEX IF NOT EXISTS "ix_flota_recibos_desde" ON ${s}"flota_recibos" ("tenant_id", "cnpoliza", "fdesde")`);

    await q.query(`ALTER TABLE IF EXISTS ${s}"flota_pagos_viaje" ALTER COLUMN "cnrecibo" TYPE varchar(60)`);
  }

  public async down(q: QueryRunner): Promise<void> {
    const s = this.s(q);
    await q.query(`DROP TABLE IF EXISTS ${s}"flota_recibos"`);
    await q.query(`DROP TABLE IF EXISTS ${s}"flota_polizas"`);
    // flota_pagos_viaje.cnrecibo se deja en 60 (achicarla podría truncar números ya emitidos).
  }
}
