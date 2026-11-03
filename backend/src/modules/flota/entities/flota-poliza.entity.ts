import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/**
 * Póliza de flota registrada en Nexus (Fase 1 Ridery, opción b): una póliza YA emitida por La Mundial en Sis2000
 * (`cnpoliza`) que se valida con nest-api GET /api/flota/polizas/:cnpoliza. No escribe nada en Sis2000.
 */
@Entity('flota_polizas')
@Index('ux_flota_polizas_tenant_pol', ['tenantId', 'cnpoliza'], { unique: true })
export class FlotaPoliza {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 30 })
  cnpoliza: string;

  /** REGISTRADA = emitida por La Mundial y registrada aquí. */
  @Column({ type: 'varchar', length: 12, default: 'REGISTRADA' })
  origen: string;

  @Column({ name: 'tomador_nombre', type: 'varchar', length: 150, nullable: true })
  tomadorNombre: string | null;

  @Column({ name: 'tomador_rif', type: 'varchar', length: 20, nullable: true })
  tomadorRif: string | null;

  /** true = nest-api devolvió la póliza (adpoliza). */
  @Column({ type: 'boolean', default: false })
  validada: boolean;

  /** Cabecera devuelta por nest-api, o el error si se registró sin validar. */
  @Column({ type: 'jsonb', nullable: true })
  validacion: Record<string, unknown> | null;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  /** Plan Sis2000 con que se creó/registró (RIDERY / RIDER1 / RIDER2). */
  @Column({ type: 'varchar', length: 10, nullable: true })
  cplan: string | null;

  /**
   * Token aleatorio largo del link público de solo lectura (/poliza/<token>). El link nunca lleva el cnpoliza crudo.
   * Se genera la primera vez que se consulta la póliza y no cambia.
   */
  @Index('ux_flota_polizas_token', { unique: true, where: 'token_publico IS NOT NULL' })
  @Column({ name: 'token_publico', type: 'varchar', length: 64, nullable: true })
  tokenPublico: string | null;

  /** Cuándo se desasoció de nuestro lado (para pruebas; no toca Sis2000). */
  @Column({ name: 'desasociada_en', type: 'timestamptz', nullable: true })
  desasociadaEn: Date | null;

  @Column({ name: 'registrado_por', type: 'varchar', length: 100, nullable: true })
  registradoPor: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
