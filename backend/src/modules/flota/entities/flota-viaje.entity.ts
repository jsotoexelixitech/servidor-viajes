import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum EstadoViajeFlota {
  INICIADO = 'INICIADO',
  FINALIZADO = 'FINALIZADO',
  CANCELADO = 'CANCELADO',
}

/**
 * Viaje de un conductor bajo la póliza de flota. A diferencia del flujo "una póliza
 * por viaje", aquí NO se emite nada y el viaje se conserva para el cobro mensual.
 */
@Entity('flota_viajes')
@Index(['tenantId', 'idExterno'], { unique: true })
@Index(['tenantId', 'estado'])
@Index(['tenantId', 'fin'])
export class FlotaViaje {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Id del viaje en la plataforma (Ridery). Evita duplicados. */
  @Column({ name: 'id_externo', type: 'varchar', length: 100 })
  idExterno: string;

  @Column({ type: 'varchar', length: 20 })
  placa: string;

  @Column({ name: 'conductor_doc', type: 'varchar', length: 30, nullable: true })
  conductorDoc: string | null;

  @Column({ name: 'conductor_nombre', type: 'varchar', length: 150, nullable: true })
  conductorNombre: string | null;

  @Column({ type: 'varchar', length: 12, default: EstadoViajeFlota.INICIADO })
  estado: EstadoViajeFlota;

  @Column({ type: 'timestamptz' })
  inicio: Date;

  @Column({ type: 'timestamptz', nullable: true })
  fin: Date | null;

  @Column({ type: 'numeric', precision: 12, scale: 3, nullable: true })
  km: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 2, nullable: true })
  minutos: string | null;

  @Column({ type: 'numeric', precision: 18, scale: 2, nullable: true })
  costo: string | null;

  @Column({ type: 'varchar', length: 4, nullable: true })
  moneda: string | null;

  /** Configuración de cobro con la que se costeó. */
  @Column({ name: 'config_id', type: 'uuid', nullable: true })
  configId: string | null;

  /** Cierre mensual que incluyó este viaje (null = aún no cerrado). */
  @Column({ name: 'cierre_id', type: 'uuid', nullable: true })
  cierreId: string | null;

  @Column({ type: 'jsonb', nullable: true })
  origen: Record<string, unknown> | null;

  @Column({ type: 'jsonb', nullable: true })
  destino: Record<string, unknown> | null;

  /** Generado por el simulador (pruebas). */
  @Column({ type: 'boolean', default: false })
  simulado: boolean;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
