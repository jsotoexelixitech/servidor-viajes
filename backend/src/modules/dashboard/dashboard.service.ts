import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Viaje, EstadoViaje } from '../viaje/entities/viaje.entity';
import { Conductor, EstadoConductor } from '../conductor/entities/conductor.entity';
import { Tenant } from '../tenant/entities/tenant.entity';

export interface DashboardKpis {
  totalViajes: number;
  viajesActivos: number;
  viajesFinalizados: number;
  polizasActivas: number;
  recibos: number;
  primaTotal: number;
  primaTotalExt: number;
  comisionTotal: number;
  ticketPromedio: number;
}

export interface RankingConductor {
  conductorId: string | null;
  nombre: string;
  cedula: string;
  totalViajes: number;
  viajesActivos: number;
  primaGenerada: number;
  comisionGenerada: number;
}

@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Viaje) private readonly viajeRepo: Repository<Viaje>,
    @InjectRepository(Conductor) private readonly conductorRepo: Repository<Conductor>,
    @InjectRepository(Tenant) private readonly tenantRepo: Repository<Tenant>,
  ) {}

  // ─── KPIs por tenant ──────────────────────────────────────────────────────
  async kpisPorTenant(tenantId: string): Promise<DashboardKpis> {
    const qb = this.viajeRepo
      .createQueryBuilder('v')
      .where('v.tenantId = :tenantId', { tenantId });

    const total = await qb.clone().getCount();
    const activos = await qb
      .clone()
      .andWhere('v.estado IN (:...activos)', {
        activos: [EstadoViaje.INICIADO, EstadoViaje.EN_CURSO],
      })
      .getCount();
    const finalizados = await qb
      .clone()
      .andWhere('v.estado = :estado', { estado: EstadoViaje.FINALIZADO })
      .getCount();
    const polizasActivas = await qb
      .clone()
      .andWhere('v.estadoPoliza = :ep', { ep: 'ACTIVA' })
      .getCount();
    const recibos = await qb
      .clone()
      .andWhere('v.cnrecibo IS NOT NULL AND v.cnrecibo != \'\'')
      .getCount();

    const sums = await qb
      .clone()
      .select('COALESCE(SUM(v.prima), 0)', 'prima')
      .addSelect('COALESCE(SUM(v.primaExt), 0)', 'primaExt')
      .addSelect('COALESCE(SUM(v.comision), 0)', 'comision')
      .addSelect('COALESCE(AVG(v.prima), 0)', 'avg')
      .getRawOne<{
        prima: string; primaExt: string; comision: string; avg: string;
      }>();

    return {
      totalViajes: total,
      viajesActivos: activos,
      viajesFinalizados: finalizados,
      polizasActivas,
      recibos,
      primaTotal: parseFloat(sums?.prima ?? '0'),
      primaTotalExt: parseFloat(sums?.primaExt ?? '0'),
      comisionTotal: parseFloat(sums?.comision ?? '0'),
      ticketPromedio: parseFloat(sums?.avg ?? '0'),
    };
  }

  // ─── Ranking de conductores por tenant ───────────────────────────────────
  async rankingConductores(
    tenantId: string,
    metrica: 'viajes' | 'prima' | 'comision' = 'prima',
    limit = 10,
  ): Promise<RankingConductor[]> {
    const orderBy =
      metrica === 'viajes' ? 'totalViajes'
      : metrica === 'comision' ? 'comisionGenerada'
      : 'primaGenerada';

    const rows = await this.viajeRepo
      .createQueryBuilder('v')
      .leftJoin('v.conductor', 'cd')
      .select('v.conductor_id', 'conductorId')
      .addSelect('COALESCE(cd.nombre, v.nombreConductor, \'Sin asignar\')', 'nombre')
      .addSelect('COALESCE(cd.cedula, \'-\')', 'cedula')
      .addSelect('COUNT(v.id)', 'totalViajes')
      .addSelect(
        `SUM(CASE WHEN v.estado IN ('INICIADO','EN_CURSO') THEN 1 ELSE 0 END)`,
        'viajesActivos',
      )
      .addSelect('COALESCE(SUM(v.prima), 0)', 'primaGenerada')
      .addSelect('COALESCE(SUM(v.comision), 0)', 'comisionGenerada')
      .where('v.tenantId = :tenantId', { tenantId })
      .groupBy('v.conductor_id')
      .addGroupBy('cd.nombre')
      .addGroupBy('cd.cedula')
      .addGroupBy('v.nombreConductor')
      .orderBy(orderBy, 'DESC')
      .limit(limit)
      .getRawMany();

    return rows.map(r => ({
      conductorId: r.conductorId ?? null,
      nombre: r.nombre,
      cedula: r.cedula,
      totalViajes: parseInt(r.totalViajes, 10) || 0,
      viajesActivos: parseInt(r.viajesActivos, 10) || 0,
      primaGenerada: parseFloat(r.primaGenerada) || 0,
      comisionGenerada: parseFloat(r.comisionGenerada) || 0,
    }));
  }

  // ─── Conductores en curso (haciendo viaje activo) ────────────────────────
  async conductoresEnCurso(tenantId: string): Promise<RankingConductor[]> {
    const rows = await this.viajeRepo
      .createQueryBuilder('v')
      .leftJoin('v.conductor', 'cd')
      .select('v.conductor_id', 'conductorId')
      .addSelect('COALESCE(cd.nombre, v.nombreConductor, \'Sin asignar\')', 'nombre')
      .addSelect('COALESCE(cd.cedula, \'-\')', 'cedula')
      .addSelect('COUNT(v.id)', 'totalViajes')
      .addSelect('COUNT(v.id)', 'viajesActivos')
      .addSelect('COALESCE(SUM(v.prima), 0)', 'primaGenerada')
      .addSelect('COALESCE(SUM(v.comision), 0)', 'comisionGenerada')
      .where('v.tenantId = :tenantId', { tenantId })
      .andWhere('v.estado IN (:...activos)', {
        activos: [EstadoViaje.INICIADO, EstadoViaje.EN_CURSO],
      })
      .groupBy('v.conductor_id')
      .addGroupBy('cd.nombre')
      .addGroupBy('cd.cedula')
      .addGroupBy('v.nombreConductor')
      .getRawMany();

    return rows.map(r => ({
      conductorId: r.conductorId ?? null,
      nombre: r.nombre,
      cedula: r.cedula,
      totalViajes: parseInt(r.totalViajes, 10) || 0,
      viajesActivos: parseInt(r.viajesActivos, 10) || 0,
      primaGenerada: parseFloat(r.primaGenerada) || 0,
      comisionGenerada: parseFloat(r.comisionGenerada) || 0,
    }));
  }

  // ─── KPIs globales (todos los tenants) — uso admin ────────────────────────
  async kpisGlobales(): Promise<
    DashboardKpis & { totalTenants: number; totalConductores: number }
  > {
    const totalTenants = await this.tenantRepo.count({ where: { activo: true } });
    const totalConductores = await this.conductorRepo.count({
      where: { estado: EstadoConductor.ACTIVO },
    });

    const total = await this.viajeRepo.count();
    const activos = await this.viajeRepo
      .createQueryBuilder('v')
      .where('v.estado IN (:...e)', {
        e: [EstadoViaje.INICIADO, EstadoViaje.EN_CURSO],
      })
      .getCount();
    const finalizados = await this.viajeRepo
      .createQueryBuilder('v')
      .where('v.estado = :e', { e: EstadoViaje.FINALIZADO })
      .getCount();
    const polizasActivas = await this.viajeRepo.count({
      where: { estadoPoliza: 'ACTIVA' as never },
    });
    const recibos = await this.viajeRepo
      .createQueryBuilder('v')
      .where('v.cnrecibo IS NOT NULL AND v.cnrecibo != \'\'')
      .getCount();

    const sums = await this.viajeRepo
      .createQueryBuilder('v')
      .select('COALESCE(SUM(v.prima), 0)', 'prima')
      .addSelect('COALESCE(SUM(v.primaExt), 0)', 'primaExt')
      .addSelect('COALESCE(SUM(v.comision), 0)', 'comision')
      .addSelect('COALESCE(AVG(v.prima), 0)', 'avg')
      .getRawOne<{
        prima: string; primaExt: string; comision: string; avg: string;
      }>();

    return {
      totalTenants,
      totalConductores,
      totalViajes: total,
      viajesActivos: activos,
      viajesFinalizados: finalizados,
      polizasActivas,
      recibos,
      primaTotal: parseFloat(sums?.prima ?? '0'),
      primaTotalExt: parseFloat(sums?.primaExt ?? '0'),
      comisionTotal: parseFloat(sums?.comision ?? '0'),
      ticketPromedio: parseFloat(sums?.avg ?? '0'),
    };
  }

  // ─── Cartera de clientes (admin) ─────────────────────────────────────────
  async carteraClientes(): Promise<
    Array<{
      id: string;
      nombre: string;
      activo: boolean;
      creadoEn: Date;
      totalViajes: number;
      viajesActivos: number;
      primaTotal: number;
      comisionTotal: number;
    }>
  > {
    const tenants = await this.tenantRepo.find({ order: { creadoEn: 'DESC' } });
    return Promise.all(
      tenants.map(async t => {
        const k = await this.kpisPorTenant(t.id);
        return {
          id: t.id,
          nombre: t.nombre,
          activo: t.activo,
          creadoEn: t.creadoEn,
          totalViajes: k.totalViajes,
          viajesActivos: k.viajesActivos,
          primaTotal: k.primaTotal,
          comisionTotal: k.comisionTotal,
        };
      }),
    );
  }
}
