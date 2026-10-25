import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum EstadoCierre {
  BORRADOR = 'BORRADOR',
  RECIBO_GENERADO = 'RECIBO_GENERADO',
  RECIBO_SIMULADO = 'RECIBO_SIMULADO',
  ERROR = 'ERROR',
}

/** Cierre mensual de la póliza de flota: un solo total → un solo recibo en Sis2000. */
@Entity('flota_cierres')
@Index(['tenantId', 'periodo'], { unique: true })
export class FlotaCierre {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 30 })
  cnpoliza: string;

  /** YYYY-MM */
  @Column({ type: 'varchar', length: 7 })
  periodo: string;

  @Column({ type: 'date' })
  desde: string;

  @Column({ type: 'date' })
  hasta: string;

  @Column({ name: 'total_viajes', type: 'int', default: 0 })
  totalViajes: number;

  @Column({ name: 'total_km', type: 'numeric', precision: 14, scale: 3, default: 0 })
  totalKm: string;

  @Column({ name: 'total_minutos', type: 'numeric', precision: 14, scale: 2, default: 0 })
  totalMinutos: string;

  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  monto: string;

  @Column({ type: 'varchar', length: 4, default: 'USD' })
  moneda: string;

  @Column({ type: 'varchar', length: 20, default: EstadoCierre.BORRADOR })
  estado: EstadoCierre;

  @Column({ type: 'varchar', length: 30, nullable: true })
  cnrecibo: string | null;

  /** Respuesta de nest-api o del simulador. */
  @Column({ type: 'jsonb', nullable: true })
  respuesta: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  error: string | null;

  @Column({ name: 'generado_en', type: 'timestamptz', nullable: true })
  generadoEn: Date | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
