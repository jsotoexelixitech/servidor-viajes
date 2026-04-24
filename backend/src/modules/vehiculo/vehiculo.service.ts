import {
  Injectable, NotFoundException, ConflictException,
  BadRequestException, Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, ILike, FindOptionsWhere } from 'typeorm';
import { Vehiculo } from './entities/vehiculo.entity';
import { CrearVehiculoDto } from './dto/crear-vehiculo.dto';
import { ActualizarVehiculoDto } from './dto/actualizar-vehiculo.dto';
import { CargaMasivaVehiculosDto } from './dto/carga-masiva.dto';
import { FiltroVehiculoDto } from './dto/filtro-vehiculo.dto';

@Injectable()
export class VehiculoService {
  private readonly logger = new Logger(VehiculoService.name);

  constructor(
    @InjectRepository(Vehiculo)
    private readonly repo: Repository<Vehiculo>,
  ) {}

  /** Crear un vehículo individual */
  async crear(tenantId: string, dto: CrearVehiculoDto): Promise<Vehiculo> {
    const existe = await this.repo.findOne({
      where: { placa: dto.placa.toUpperCase(), tenantId },
    });
    if (existe) {
      throw new ConflictException(`Ya existe un vehículo con placa ${dto.placa} en este tenant`);
    }
    const vehiculo = this.repo.create({
      ...dto,
      placa: dto.placa.toUpperCase(),
      tenantId,
    });
    return this.repo.save(vehiculo);
  }

  /** Carga masiva — upsert por placa+tenantId (inserta o actualiza) */
  async cargaMasiva(tenantId: string, dto: CargaMasivaVehiculosDto): Promise<{
    insertados: number;
    actualizados: number;
    errores: { placa: string; motivo: string }[];
  }> {
    let insertados = 0;
    let actualizados = 0;
    const errores: { placa: string; motivo: string }[] = [];

    this.logger.log(`Carga masiva: ${dto.vehiculos.length} vehículos para tenant ${tenantId}`);

    // Procesar en lotes de 100 para no saturar la BD
    const BATCH = 100;
    for (let i = 0; i < dto.vehiculos.length; i += BATCH) {
      const lote = dto.vehiculos.slice(i, i + BATCH);

      await Promise.all(lote.map(async (v) => {
        const placa = v.placa.toUpperCase();
        try {
          const existente = await this.repo.findOne({ where: { placa, tenantId } });
          if (existente) {
            await this.repo.update(existente.id, { ...v, placa });
            actualizados++;
          } else {
            await this.repo.save(this.repo.create({ ...v, placa, tenantId }));
            insertados++;
          }
        } catch (err: any) {
          errores.push({ placa, motivo: err.message });
        }
      }));
    }

    this.logger.log(
      `Carga masiva completada: ${insertados} nuevos, ${actualizados} actualizados, ${errores.length} errores`,
    );
    return { insertados, actualizados, errores };
  }

  /** Listar con paginación y filtros */
  async listar(tenantId: string, filtro: FiltroVehiculoDto): Promise<{
    data: Vehiculo[];
    total: number;
    page: number;
    pages: number;
  }> {
    const { placa, marca, modelo, tipoVehiculo, activo, page = 1, limit = 50 } = filtro;

    const where: FindOptionsWhere<Vehiculo> = { tenantId };
    if (placa)        where.placa        = ILike(`%${placa}%`);
    if (marca)        where.marca        = ILike(`%${marca}%`);
    if (modelo)       where.modelo       = ILike(`%${modelo}%`);
    if (tipoVehiculo) where.tipoVehiculo = tipoVehiculo;
    if (activo !== undefined) where.activo = activo;

    const [data, total] = await this.repo.findAndCount({
      where,
      order: { creadoEn: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { data, total, page, pages: Math.ceil(total / limit) };
  }

  /** Buscar por placa exacta */
  async buscarPorPlaca(tenantId: string, placa: string): Promise<Vehiculo> {
    const v = await this.repo.findOne({
      where: { placa: placa.toUpperCase(), tenantId },
    });
    if (!v) throw new NotFoundException(`Vehículo con placa ${placa} no encontrado`);
    return v;
  }

  /** Obtener por ID */
  async obtenerPorId(tenantId: string, id: string): Promise<Vehiculo> {
    const v = await this.repo.findOne({ where: { id, tenantId } });
    if (!v) throw new NotFoundException(`Vehículo ${id} no encontrado`);
    return v;
  }

  /** Actualizar */
  async actualizar(tenantId: string, id: string, dto: ActualizarVehiculoDto): Promise<Vehiculo> {
    const v = await this.obtenerPorId(tenantId, id);
    if (dto.placa) dto.placa = dto.placa.toUpperCase();
    Object.assign(v, dto);
    return this.repo.save(v);
  }

  /** Desactivar (soft delete lógico) */
  async desactivar(tenantId: string, id: string): Promise<{ ok: boolean }> {
    const v = await this.obtenerPorId(tenantId, id);
    await this.repo.update(v.id, { activo: false });
    return { ok: true };
  }

  /** Eliminar permanentemente */
  async eliminar(tenantId: string, id: string): Promise<{ ok: boolean }> {
    const v = await this.obtenerPorId(tenantId, id);
    await this.repo.remove(v);
    return { ok: true };
  }

  /** Estadísticas del parque vehicular del tenant */
  async estadisticas(tenantId: string): Promise<Record<string, any>> {
    const total     = await this.repo.count({ where: { tenantId } });
    const activos   = await this.repo.count({ where: { tenantId, activo: true } });
    const porTipo   = await this.repo
      .createQueryBuilder('v')
      .select('v.tipoVehiculo', 'tipo')
      .addSelect('COUNT(*)', 'cantidad')
      .where('v.tenantId = :tenantId', { tenantId })
      .groupBy('v.tipoVehiculo')
      .getRawMany();

    return { total, activos, inactivos: total - activos, porTipo };
  }
}
