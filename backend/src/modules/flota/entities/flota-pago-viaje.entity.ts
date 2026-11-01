import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum EstadoReciboViaje {
  RECIBO_SIMULADO = 'RECIBO_SIMULADO',
  RECIBO_GENERADO = 'RECIBO_GENERADO',
  /** El pago quedó registrado pero el recibo falló (sin certificado, nest-api caído, SP pendiente…). Se reintenta. */
  ERROR = 'ERROR',
}

/**
 * Pago informado por la plataforma para UN viaje y el recibo generado sobre el certificado del conductor.
 * Único por viaje: un viaje no se paga dos veces.
 */
@Entity('flota_pagos_viaje')
@Index('ux_flota_pagos_tenant_viaje', ['tenantId', 'idExterno'], { unique: true })
@Index('ix_flota_pagos_creado', ['tenantId', 'creadoEn'])
export class FlotaPagoViaje {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ name: 'viaje_id', type: 'uuid' })
  viajeId: string;

  @Column({ name: 'id_externo', type: 'varchar', length: 100 })
  idExterno: string;

  @Column({ type: 'numeric', precision: 18, scale: 2 })
  monto: string;

  @Column({ type: 'varchar', length: 4 })
  moneda: string;

  /** Referencia del pago en la plataforma. */
  @Column({ type: 'varchar', length: 100 })
  referencia: string;

  @Column({ type: 'varchar', length: 30, nullable: true })
  metodo: string | null;

  @Column({ name: 'fecha_pago', type: 'timestamptz' })
  fechaPago: Date;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cnpoliza: string | null;

  @Column({ type: 'int', nullable: true })
  ccerti: number | null;

  @Column({ type: 'varchar', length: 20 })
  estado: EstadoReciboViaje;

  /** SIMULADO (no toca Sis2000) o REAL (nest-api). */
  @Column({ type: 'varchar', length: 10 })
  modo: 'SIMULADO' | 'REAL';

  @Column({ type: 'varchar', length: 30, nullable: true })
  cnrecibo: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true })
  crecibo: string | null;

  /** Lo que se mandó (o se mandaría) a nest-api. */
  @Column({ type: 'jsonb', nullable: true })
  payload: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  respuesta: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ type: 'int', default: 1 })
  intentos: number;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
