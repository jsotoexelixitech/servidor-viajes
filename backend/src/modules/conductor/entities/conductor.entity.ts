import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

export enum EstadoConductor {
  ACTIVO = 'ACTIVO',
  INACTIVO = 'INACTIVO',
  SUSPENDIDO = 'SUSPENDIDO',
}

/**
 * Conductor del tenant — persona que ejecuta el viaje y para la cual se
 * emite la póliza. Cada viaje queda asociado a un conductor para fines de:
 *   - Cálculo de comisiones por viaje
 *   - Métricas de rendimiento (top viajes, top prima, top comisiones)
 *   - Trazabilidad operativa (conductores en curso)
 */
@Entity('conductores')
@Index(['tenantId', 'estado'])
@Index(['tenantId', 'cedula'], { unique: true })
export class Conductor {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @Column({ type: 'varchar', length: 150 })
  nombre: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  apellido: string;

  /** Cédula o RIF del conductor (único por tenant) */
  @Column({ type: 'varchar', length: 30 })
  cedula: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  telefono: string;

  @Column({ type: 'varchar', length: 150, nullable: true })
  email: string;

  /** Porcentaje de comisión sobre la prima (ej: 12.5 = 12.5 %) */
  @Column({
    name: 'porcentaje_comision',
    type: 'decimal',
    precision: 5,
    scale: 2,
    default: 10,
  })
  porcentajeComision: number;

  @Column({
    type: 'enum',
    enum: EstadoConductor,
    default: EstadoConductor.ACTIVO,
  })
  estado: EstadoConductor;

  /** Datos opcionales (zona, sucursal, licencia, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
