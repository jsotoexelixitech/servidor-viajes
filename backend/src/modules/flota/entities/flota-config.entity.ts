import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum ModalidadCobro {
  TIEMPO = 'TIEMPO',
  KM = 'KM',
}

export enum ModoCierre {
  MANUAL = 'MANUAL',
  AUTO = 'AUTO',
}

/**
 * Configuración de cobro por uso de la póliza de flota del tenant.
 * Se versiona: cada cambio crea una fila nueva y desactiva la anterior, así cada
 * viaje queda costeado con la tarifa vigente cuando terminó.
 */
@Entity('flota_cobro_config')
@Index(['tenantId', 'activa'])
export class FlotaConfig {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  /** Póliza de flota en Sis2000 (ej. 18-1-1130480881). */
  @Column({ type: 'varchar', length: 30 })
  cnpoliza: string;

  /** Plan de la póliza, se envía al generar el recibo. */
  @Column({ type: 'varchar', length: 10, nullable: true })
  cplan: string | null;

  @Column({ type: 'varchar', length: 10, default: ModalidadCobro.TIEMPO })
  modalidad: ModalidadCobro;

  /** Monto por minuto (TIEMPO) o por km (KM). */
  @Column({ type: 'numeric', precision: 18, scale: 4, default: 0 })
  tarifa: string;

  @Column({ type: 'varchar', length: 4, default: 'USD' })
  moneda: string;

  /** Mínimo a cobrar por viaje finalizado. */
  @Column({ name: 'minimo_por_viaje', type: 'numeric', precision: 18, scale: 2, default: 0 })
  minimoPorViaje: string;

  /** true = se cobra el minuto/km iniciado (redondeo hacia arriba). */
  @Column({ name: 'redondear_unidad', type: 'boolean', default: true })
  redondearUnidad: boolean;

  @Column({ name: 'modo_cierre', type: 'varchar', length: 10, default: ModoCierre.MANUAL })
  modoCierre: ModoCierre;

  /** Día del mes en que corre el cierre automático del mes anterior (1-28). */
  @Column({ name: 'dia_cierre', type: 'int', default: 1 })
  diaCierre: number;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @Column({ name: 'creado_por', type: 'varchar', length: 100, nullable: true })
  creadoPor: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;
}
