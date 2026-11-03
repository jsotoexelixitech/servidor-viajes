import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Presentación Ridery (4-nov): crear flota por Excel, link público, desasociar póliza e interurbano.
 * - flota_polizas: cplan, token_publico (único, link /poliza/<token>), desasociada_en.
 * - flota_certificados: vehiculo (jsonb con los datos del Excel).
 * - INTERURBANO entra como valor nuevo de flota_tarifas_distancia.clasificacion (varchar, sin cambio de esquema).
 *
 * Aditiva e idempotente (IF NOT EXISTS). Respeta DB_SCHEMA (ej. 'flota').
 */
export class FlotaPresentacion1762214400000 implements MigrationInterface {
  name = 'FlotaPresentacion1762214400000';

  private s(q: QueryRunner): string {
    const schema = (q.connection.options as { schema?: string }).schema;
    return schema ? `"${schema}".` : '';
  }

  public async up(q: QueryRunner): Promise<void> {
    const s = this.s(q);
    await q.query(`ALTER TABLE ${s}"flota_polizas" ADD COLUMN IF NOT EXISTS "cplan" varchar(10)`);
    await q.query(`ALTER TABLE ${s}"flota_polizas" ADD COLUMN IF NOT EXISTS "token_publico" varchar(64)`);
    await q.query(`ALTER TABLE ${s}"flota_polizas" ADD COLUMN IF NOT EXISTS "desasociada_en" timestamptz`);
    await q.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "ux_flota_polizas_token" ON ${s}"flota_polizas" ("token_publico") WHERE token_publico IS NOT NULL`,
    );
    await q.query(`ALTER TABLE ${s}"flota_certificados" ADD COLUMN IF NOT EXISTS "vehiculo" jsonb`);
  }

  public async down(q: QueryRunner): Promise<void> {
    const s = this.s(q);
    await q.query(`DROP INDEX IF EXISTS ${s}"ux_flota_polizas_token"`);
    await q.query(`ALTER TABLE ${s}"flota_certificados" DROP COLUMN IF EXISTS "vehiculo"`);
    await q.query(`ALTER TABLE ${s}"flota_polizas" DROP COLUMN IF EXISTS "desasociada_en"`);
    await q.query(`ALTER TABLE ${s}"flota_polizas" DROP COLUMN IF EXISTS "token_publico"`);
    await q.query(`ALTER TABLE ${s}"flota_polizas" DROP COLUMN IF EXISTS "cplan"`);
  }
}
