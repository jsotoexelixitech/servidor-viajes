import {
  Injectable, NotFoundException, ConflictException, BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Vendedor, EstadoVendedor } from './entities/vendedor.entity';
import { CrearVendedorDto } from './dto/crear-vendedor.dto';

@Injectable()
export class VendedorService {
  constructor(
    @InjectRepository(Vendedor)
    private readonly vendedorRepo: Repository<Vendedor>,
  ) {}

  async crear(tenantId: string, dto: CrearVendedorDto): Promise<Vendedor> {
    const yaExiste = await this.vendedorRepo.findOne({
      where: { tenantId, cedula: dto.cedula },
    });
    if (yaExiste) {
      throw new ConflictException(
        `Ya existe un vendedor con cédula ${dto.cedula} en este tenant.`,
      );
    }

    const vendedor = this.vendedorRepo.create({
      ...dto,
      tenantId,
      porcentajeComision: dto.porcentajeComision ?? 10,
      estado: dto.estado ?? EstadoVendedor.ACTIVO,
    });
    return this.vendedorRepo.save(vendedor);
  }

  async listar(tenantId: string, soloActivos = false): Promise<Vendedor[]> {
    const where: Record<string, unknown> = { tenantId };
    if (soloActivos) where.estado = EstadoVendedor.ACTIVO;
    return this.vendedorRepo.find({ where, order: { nombre: 'ASC' } });
  }

  async obtener(tenantId: string, id: string): Promise<Vendedor> {
    const v = await this.vendedorRepo.findOne({ where: { id, tenantId } });
    if (!v) throw new NotFoundException('Vendedor no encontrado.');
    return v;
  }

  async actualizar(
    tenantId: string,
    id: string,
    dto: Partial<CrearVendedorDto>,
  ): Promise<Vendedor> {
    const v = await this.obtener(tenantId, id);
    Object.assign(v, dto);
    return this.vendedorRepo.save(v);
  }

  async eliminar(tenantId: string, id: string): Promise<{ ok: true }> {
    const v = await this.obtener(tenantId, id);
    v.estado = EstadoVendedor.INACTIVO;
    await this.vendedorRepo.save(v);
    return { ok: true };
  }

  /** Resuelve el vendedor a partir de cédula o id (usado al iniciar viaje) */
  async resolverPorIdentificador(
    tenantId: string,
    identificador: string,
  ): Promise<Vendedor> {
    const esUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      identificador,
    );
    const where = esUuid
      ? { id: identificador, tenantId }
      : { cedula: identificador, tenantId };
    const v = await this.vendedorRepo.findOne({ where });
    if (!v) {
      throw new BadRequestException(
        `Vendedor "${identificador}" no encontrado en este tenant.`,
      );
    }
    return v;
  }
}
