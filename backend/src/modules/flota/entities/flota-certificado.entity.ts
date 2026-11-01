import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export enum OrigenCertificado {
  MANUAL = 'MANUAL',
  SIS2000 = 'SIS2000',
}

/**
 * Conductor (y su vehículo) → certificado de la póliza de flota en Sis2000 (vhcerti.ccerti).
 * El recibo de cada viaje se genera sobre este certificado.
 */
@Entity('flota_certificados')
@Index('ux_flota_cert_tenant_pol_cert', ['tenantId', 'cnpoliza', 'ccerti'], { unique: true })
@Index('ix_flota_cert_doc', ['tenantId', 'conductorDocNorm'])
@Index('ix_flota_cert_placa', ['tenantId', 'placa'])
export class FlotaCertificado {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 30 })
  cnpoliza: string;

  /** Número de certificado en Sis2000 (vhcerti.ccerti). */
  @Column({ type: 'int' })
  ccerti: number;

  @Column({ type: 'varchar', length: 20, nullable: true })
  placa: string | null;

  @Column({ name: 'conductor_doc', type: 'varchar', length: 30, nullable: true })
  conductorDoc: string | null;

  /** Documento sin guiones, puntos ni espacios (V-12.345.678 → V12345678) para buscar. */
  @Column({ name: 'conductor_doc_norm', type: 'varchar', length: 30, nullable: true })
  conductorDocNorm: string | null;

  @Column({ name: 'conductor_nombre', type: 'varchar', length: 150, nullable: true })
  conductorNombre: string | null;

  /** Estado del certificado en Sis2000 (vhcerti.istatcer) si vino de la sincronización. */
  @Column({ type: 'varchar', length: 2, nullable: true })
  istatcer: string | null;

  @Column({ type: 'boolean', default: true })
  activo: boolean;

  @Column({ type: 'varchar', length: 10, default: OrigenCertificado.MANUAL })
  origen: OrigenCertificado;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
