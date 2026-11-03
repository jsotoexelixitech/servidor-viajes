import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** Estado del recibo en Nexus (lo que pasó con el cobro). */
export enum EstadoReciboNexus {
  PENDIENTE = 'PENDIENTE',
  COBRADO = 'COBRADO',
  ANULADO = 'ANULADO',
}

/** Estado de la subida del recibo a Sis2000 (cuando La Mundial cree los SP de flota). */
export enum SyncSis2000 {
  PENDIENTE = 'PENDIENTE',
  OK = 'OK',
  ERROR = 'ERROR',
}

/**
 * Recibo por viaje en NUESTRA base (Fase 1 Ridery): numeración propia correlativa por póliza + certificado
 * (`RDY-<cnpoliza>-<ccerti>-<seq>`). Nace PENDIENTE al finalizar el viaje, pasa a COBRADO con el pago de la
 * plataforma y queda listo para subirse a Sis2000 (`sync_sis2000`) cuando existan los SP.
 */
@Entity('flota_recibos')
@Index('ux_flota_recibos_tenant_viaje', ['tenantId', 'idExterno'], { unique: true })
@Index('ux_flota_recibos_tenant_numero', ['tenantId', 'numero'], { unique: true })
@Index('ux_flota_recibos_pol_cert_seq', ['tenantId', 'cnpoliza', 'ccerti', 'secuencia'], { unique: true })
@Index('ix_flota_recibos_desde', ['tenantId', 'cnpoliza', 'fdesde'])
export class FlotaRecibo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Número propio: RDY-<cnpoliza>-<ccerti>-<seq 6 dígitos>. */
  @Column({ type: 'varchar', length: 60 })
  numero: string;

  @Column({ type: 'varchar', length: 30 })
  cnpoliza: string;

  @Column({ type: 'int' })
  ccerti: number;

  /** Correlativo dentro de (póliza, certificado), empieza en 1. */
  @Column({ type: 'int' })
  secuencia: number;

  @Column({ name: 'viaje_id', type: 'uuid' })
  viajeId: string;

  @Column({ name: 'id_externo', type: 'varchar', length: 100 })
  idExterno: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  monto: string;

  @Column({ type: 'varchar', length: 4 })
  moneda: string;

  /** Vigencia del recibo = inicio / fin del viaje. */
  @Column({ type: 'timestamptz' })
  fdesde: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fhasta: Date | null;

  @Column({ type: 'varchar', length: 10, default: EstadoReciboNexus.PENDIENTE })
  estado: EstadoReciboNexus;

  @Column({ name: 'fecha_cobro', type: 'timestamptz', nullable: true })
  fechaCobro: Date | null;

  @Column({ name: 'referencia_pago', type: 'varchar', length: 100, nullable: true })
  referenciaPago: string | null;

  @Column({ name: 'metodo_pago', type: 'varchar', length: 30, nullable: true })
  metodoPago: string | null;

  @Column({ name: 'pago_id', type: 'uuid', nullable: true })
  pagoId: string | null;

  @Column({ name: 'anulado_en', type: 'timestamptz', nullable: true })
  anuladoEn: Date | null;

  @Column({ name: 'motivo_anulacion', type: 'varchar', length: 250, nullable: true })
  motivoAnulacion: string | null;

  @Column({ name: 'sync_sis2000', type: 'varchar', length: 10, default: SyncSis2000.PENDIENTE })
  syncSis2000: SyncSis2000;

  /** adrecibos.cnrecibo / crecibo cuando se suba a Sis2000. */
  @Column({ name: 'cnrecibo_sis2000', type: 'varchar', length: 30, nullable: true })
  cnreciboSis2000: string | null;

  @Column({ name: 'crecibo_sis2000', type: 'varchar', length: 30, nullable: true })
  creciboSis2000: string | null;

  @Column({ name: 'sync_error', type: 'text', nullable: true })
  syncError: string | null;

  @Column({ name: 'sync_en', type: 'timestamptz', nullable: true })
  syncEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
