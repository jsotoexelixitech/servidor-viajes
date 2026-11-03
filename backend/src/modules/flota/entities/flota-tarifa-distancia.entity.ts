import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

/** Clasificación de distancia del viaje (Ridery: urbano / extra urbano / interurbano). */
export enum ClasificacionDistancia {
  URBANO = 'URBANO',
  EXTRA_URBANO = 'EXTRA_URBANO',
  /** Viajes entre ciudades. Rango de km propio o `clasificacion` explícita en el evento. */
  INTERURBANO = 'INTERURBANO',
}

/**
 * Redondeo de los km antes de multiplicar por la tarifa.
 * NINGUNO = km exactos · KM_ARRIBA = se cobra el km iniciado · KM_CERCANO = km entero más cercano.
 */
export enum RedondeoKm {
  NINGUNO = 'NINGUNO',
  KM_ARRIBA = 'KM_ARRIBA',
  KM_CERCANO = 'KM_CERCANO',
}

/**
 * Tarifa por km de una clasificación de distancia, por flota (cobro por viaje).
 * El rango [kmDesde, kmHasta) decide la clasificación cuando la plataforma no la manda;
 * la tarifa se aplica al viaje completo (no por tramos).
 */
@Entity('flota_tarifas_distancia')
@Index('ux_flota_tarifas_tenant_clasif', ['tenantId', 'clasificacion'], { unique: true })
export class FlotaTarifaDistancia {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @Column({ type: 'varchar', length: 20 })
  clasificacion: ClasificacionDistancia;

  /** Nombre que se muestra (ej. "Urbano", "Extra urbano"). */
  @Column({ type: 'varchar', length: 60 })
  nombre: string;

  @Column({ name: 'km_desde', type: 'numeric', precision: 10, scale: 3, default: 0 })
  kmDesde: string;

  /** null = sin tope. */
  @Column({ name: 'km_hasta', type: 'numeric', precision: 10, scale: 3, nullable: true })
  kmHasta: string | null;

  @Column({ name: 'tarifa_km', type: 'numeric', precision: 18, scale: 4, default: 0 })
  tarifaKm: string;

  /** Monto mínimo por viaje de esta clasificación. */
  @Column({ type: 'numeric', precision: 18, scale: 2, default: 0 })
  minimo: string;

  @Column({ type: 'varchar', length: 12, default: RedondeoKm.KM_ARRIBA })
  redondeo: RedondeoKm;

  @Column({ type: 'varchar', length: 4, default: 'USD' })
  moneda: string;

  @Column({ type: 'boolean', default: true })
  activa: boolean;

  @Column({ name: 'actualizado_por', type: 'varchar', length: 100, nullable: true })
  actualizadoPor: string | null;

  @CreateDateColumn({ name: 'creado_en', type: 'timestamptz' })
  creadoEn: Date;

  @UpdateDateColumn({ name: 'actualizado_en', type: 'timestamptz' })
  actualizadoEn: Date;
}
