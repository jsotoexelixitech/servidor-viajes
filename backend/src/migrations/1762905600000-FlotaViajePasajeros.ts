import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Viaje por trayecto (12-nov): personas que viajan, informadas por la plataforma en cada INICIO.
 * - flota_viajes.pasajeros: jsonb con la lista (tipoDoc, documento, nombres, apellidos, telefono, correo,
 *   fechaNacimiento, esConductor). NULL en los viajes anteriores y en los simulados.
 *
 * Aditiva e idempotente (IF NOT EXISTS). Respeta DB_SCHEMA (ej. 'flota').
 */
export class FlotaViajePasajeros1762905600000 implements MigrationInterface {
  name = 'FlotaViajePasajeros1762905600000';

  private s(q: QueryRunner): string {
    const schema = (q.connection.options as { schema?: string }).schema;
    return schema ? `"${schema}".` : '';
  }

  public async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ${this.s(q)}"flota_viajes" ADD COLUMN IF NOT EXISTS "pasajeros" jsonb`);
  }

  public async down(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE ${this.s(q)}"flota_viajes" DROP COLUMN IF EXISTS "pasajeros"`);
  }
}
