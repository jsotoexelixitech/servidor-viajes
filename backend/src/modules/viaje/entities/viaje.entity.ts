import {
  Entity, PrimaryGeneratedColumn, Column, CreateDateColumn,
  UpdateDateColumn, Index, ManyToOne, JoinColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { Conductor } from '../../conductor/entities/conductor.entity';

export enum EstadoViaje {
  INICIADO = 'INICIADO',
  EN_CURSO = 'EN_CURSO',
  FINALIZADO = 'FINALIZADO',
  CANCELADO = 'CANCELADO',
}

export type EstadoPoliza = 'EMITIENDO' | 'ACTIVA' | 'FINALIZADA' | 'ERROR' | 'CRITICO' | null;

@Entity('viajes')
@Index(['tenantId', 'estado'])
@Index(['tenantId', 'creadoEn'])
@Index(['tenantId', 'conductorId'])
export class Viaje {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  // ─── Datos del vehículo (campos internos del sistema) ────────────────────
  @Column({ name: 'numero_placa', type: 'varchar', length: 20, nullable: true })
  numeroPlaca: string;

  @Column({ name: 'nombre_conductor', type: 'varchar', length: 150, nullable: true })
  nombreConductor: string;

  @Column({ name: 'modelo_vehiculo', type: 'varchar', length: 100, nullable: true })
  modeloVehiculo: string;

  @Column({ name: 'anio_vehiculo', type: 'varchar', length: 10, nullable: true })
  anioVehiculo: string;

  // ─── Coordenadas ──────────────────────────────────────────────────────────
  @Column({ name: 'lat_inicio', type: 'decimal', precision: 10, scale: 7, nullable: true })
  latInicio: number;

  @Column({ name: 'lng_inicio', type: 'decimal', precision: 10, scale: 7, nullable: true })
  lngInicio: number;

  @Column({ name: 'lat_destino', type: 'decimal', precision: 10, scale: 7, nullable: true })
  latDestino: number;

  @Column({ name: 'lng_destino', type: 'decimal', precision: 10, scale: 7, nullable: true })
  lngDestino: number;

  // ─── Estado del viaje ────────────────────────────────────────────────────
  @Column({ type: 'enum', enum: EstadoViaje, default: EstadoViaje.INICIADO })
  estado: EstadoViaje;

  // ─── Datos de la póliza (La Mundial de Seguros) ──────────────────────────
  /** Número de póliza emitido por La Mundial (ej: "18-1-0000011500") */
  @Column({ name: 'cn_poliza', type: 'varchar', length: 50, nullable: true })
  cnpoliza: string;

  /** Número de recibo */
  @Column({ name: 'cn_recibo', type: 'varchar', length: 50, nullable: true })
  cnrecibo: string;

  /** URL del PDF de la póliza */
  @Column({ name: 'url_poliza_pdf', type: 'text', nullable: true })
  urlPolizaPDF: string;

  /** Estado de la póliza en La Mundial */
  @Column({ name: 'estado_poliza', type: 'varchar', length: 20, nullable: true, default: null })
  estadoPoliza: EstadoPoliza;

  /** Mensaje de error si la emisión falló */
  @Column({ name: 'poliza_error', type: 'text', nullable: true })
  polizaError: string;

  /** Número de intentos de emisión */
  @Column({ name: 'poliza_intentos', type: 'int', default: 0 })
  polizaIntentos: number;

  /** Timestamp del último intento de emisión (usado por el scanner para no reintento doble) */
  @Column({ name: 'poliza_ultimo_intento', type: 'timestamptz', nullable: true })
  polizaUltimoIntento: Date;

  // ─── Webhook externo ─────────────────────────────────────────────────────
  @Column({ name: 'webhook_enviado', type: 'boolean', default: false })
  webhookEnviado: boolean;

  @Column({ name: 'webhook_intentos', type: 'int', default: 0 })
  webhookIntentos: number;

  @Column({ name: 'webhook_ultimo_error', type: 'text', nullable: true })
  webhookUltimoError: string;

  // ─── Conductor responsable del viaje ──────────────────────────────────────
  @Column({ name: 'conductor_id', type: 'uuid', nullable: true })
  conductorId: string | null;

  @ManyToOne(() => Conductor, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'conductor_id' })
  conductor: Conductor;

  // (El campo nombreConductor existente arriba ya guarda el snapshot del nombre)

  // ─── Datos comerciales ────────────────────────────────────────────────────
  /** Tipo o plan de cobertura: RCVBAS, RUSPAT, etc. */
  @Column({ name: 'plan_poliza', type: 'varchar', length: 30, nullable: true })
  planPoliza: string;

  /** Prima total cobrada (Bs) — base para el cálculo de la comisión */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  prima: number;

  /** Prima en divisa (USD), si aplica */
  @Column({ name: 'prima_ext', type: 'decimal', precision: 14, scale: 2, default: 0 })
  primaExt: number;

  /** Comisión generada por la suscripción (Bs) */
  @Column({ type: 'decimal', precision: 14, scale: 2, default: 0 })
  comision: number;

  // ─── Body original y metadata ─────────────────────────────────────────────
  /** Body transformado guardado para reintentos y auditoría */
  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  // ─── Timestamps ───────────────────────────────────────────────────────────
  @CreateDateColumn({ name: 'creado_en' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en' })
  actualizadoEn: Date;

  @Column({ name: 'finalizado_en', type: 'timestamptz', nullable: true })
  finalizadoEn: Date;
}
