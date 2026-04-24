import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, ManyToOne, JoinColumn, Index, Unique,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

export enum TipoVehiculo {
  SEDAN      = 'SEDAN',
  SUV        = 'SUV',
  CAMIONETA  = 'CAMIONETA',
  BUS        = 'BUS',
  MINIBUS    = 'MINIBUS',
  MOTO       = 'MOTO',
  OTRO       = 'OTRO',
}

@Entity('vehiculos')
@Unique('UQ_vehiculo_placa_tenant', ['placa', 'tenantId'])
@Index('IDX_vehiculo_tenant', ['tenantId'])
@Index('IDX_vehiculo_placa', ['placa'])
export class Vehiculo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Tenant propietario de este registro */
  @Column({ type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenantId' })
  tenant: Tenant;

  // ── Identificación ─────────────────────────────────────────
  @Column({ length: 20 })
  placa: string;

  @Column({ length: 100 })
  marca: string;

  @Column({ length: 100 })
  modelo: string;

  @Column({ type: 'smallint' })
  anio: number;

  @Column({ length: 40, nullable: true })
  color: string | null;

  @Column({ type: 'enum', enum: TipoVehiculo, default: TipoVehiculo.SEDAN })
  tipoVehiculo: TipoVehiculo;

  // ── Datos del propietario / conductor ──────────────────────
  @Column({ length: 20, nullable: true })
  cedulaPropietario: string | null;

  @Column({ length: 150, nullable: true })
  nombrePropietario: string | null;

  // ── Datos técnicos ─────────────────────────────────────────
  @Column({ type: 'smallint', nullable: true })
  capacidadPasajeros: number | null;

  @Column({ length: 30, nullable: true })
  numeroSerial: string | null;

  @Column({ length: 30, nullable: true })
  numeroMotor: string | null;

  // ── Estado ─────────────────────────────────────────────────
  @Column({ default: true })
  activo: boolean;

  /** Campos extra del cliente en formato libre */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any> | null;

  @CreateDateColumn()
  creadoEn: Date;

  @UpdateDateColumn()
  actualizadoEn: Date;
}
