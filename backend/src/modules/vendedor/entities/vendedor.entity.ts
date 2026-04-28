import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

export enum EstadoVendedor {
  ACTIVO = 'ACTIVO',
  INACTIVO = 'INACTIVO',
  SUSPENDIDO = 'SUSPENDIDO',
}

/**
 * Vendedor / asesor / agente comercial que ejecuta la suscripción de pólizas
 * de un tenant. Cada viaje queda asociado a un vendedor para fines de:
 *   - Cálculo de comisiones
 *   - Métricas de rendimiento (ranking, prima generada)
 *   - Trazabilidad de la operación
 */
@Entity('vendedores')
@Index(['tenantId', 'estado'])
@Index(['tenantId', 'cedula'], { unique: true })
export class Vendedor {
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

  /** Cédula o RIF del vendedor (único por tenant) */
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
    enum: EstadoVendedor,
    default: EstadoVendedor.ACTIVO,
  })
  estado: EstadoVendedor;

  /** Datos opcionales (zona, sucursal, etc.) */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;
}
