import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Conductor, EstadoConductor } from './entities/conductor.entity';
import { CrearConductorDto } from './dto/crear-conductor.dto';

@Injectable()
export class ConductorService {
  constructor(
    @InjectRepository(Conductor)
    private readonly conductorRepo: Repository<Conductor>,
  ) {}

  async crear(tenantId: string, dto: CrearConductorDto): Promise<Conductor> {
    const yaExiste = await this.conductorRepo.findOne({
      where: { tenantId, cedula: dto.cedula },
    });
    if (yaExiste) {
      throw new ConflictException(
        `Ya existe un conductor con cédula ${dto.cedula} en este tenant.`,
      );
    }

    const conductor = this.conductorRepo.create({
      ...dto,
      tenantId,
      porcentajeComision: dto.porcentajeComision ?? 10,
      estado: dto.estado ?? EstadoConductor.ACTIVO,
    });
    return this.conductorRepo.save(conductor);
  }

  async listar(tenantId: string, soloActivos = false): Promise<Conductor[]> {
    const where: Record<string, unknown> = { tenantId };
    if (soloActivos) where.estado = EstadoConductor.ACTIVO;
    return this.conductorRepo.find({ where, order: { nombre: 'ASC' } });
  }

  async obtener(tenantId: string, id: string): Promise<Conductor> {
    const c = await this.conductorRepo.findOne({ where: { id, tenantId } });
    if (!c) throw new NotFoundException('Conductor no encontrado.');
    return c;
  }

  async actualizar(
    tenantId: string,
    id: string,
    dto: Partial<CrearConductorDto>,
  ): Promise<Conductor> {
    const c = await this.obtener(tenantId, id);
    Object.assign(c, dto);
    return this.conductorRepo.save(c);
  }

  async eliminar(tenantId: string, id: string): Promise<{ ok: true }> {
    const c = await this.obtener(tenantId, id);
    c.estado = EstadoConductor.INACTIVO;
    await this.conductorRepo.save(c);
    return { ok: true };
  }

  /** Resuelve el conductor a partir de cédula o id (usado al iniciar viaje) */
  async resolverPorIdentificador(
    tenantId: string,
    identificador: string,
  ): Promise<Conductor> {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identificador,
    );
    const where = esUuid
      ? { id: identificador, tenantId }
      : { cedula: identificador, tenantId };
    const c = await this.conductorRepo.findOne({ where });
    if (!c) {
      throw new BadRequestException(
        `Conductor "${identificador}" no encontrado en este tenant.`,
      );
    }
    return c;
  }
}
