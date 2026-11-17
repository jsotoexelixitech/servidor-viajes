import {
  BadRequestException, Body, Controller, Get, HttpCode, HttpStatus, Post, Res, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { AnyFilesInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';
import {
  ArchivoSubido, CAMPOS_ARCHIVO, FlotaDocumentosService, itemsDelLote, MAX_ARCHIVO_DOCUMENTO, MAX_ARCHIVOS_LOTE,
} from './flota-documentos.service';
import { SubirDocumentoFlotaDto } from './dto/documentos.dto';
import { errorParaIntegrador } from './flota-expediente.client';

/** Archivo de multer en memoria con el campo multipart por el que llegó. */
type ArchivoMulter = ArchivoSubido & { fieldname: string };

/**
 * Documentos del expediente de la póliza de flota (Trayecto Seguro) en el monitor de La Mundial:
 * RIF de la empresa tomadora (uno por póliza) y cédula o pasaporte de cada conductor activo.
 * Autenticación: X-Api-Key (o Bearer) de la flota, igual que el resto de la API.
 */
@ApiTags('Flota · documentos del expediente')
@ApiSecurity('api-key')
@UseGuards(TenantGuard)
@Controller('flota/documentos')
export class FlotaDocumentosController {
  constructor(private readonly docs: FlotaDocumentosService) {}

  @Get()
  @ApiOperation({
    summary: 'Estado de los documentos de la póliza de flota (RIF de la empresa y cada conductor activo)',
    description:
      'estado del expediente: completo | incompleto. Por documento: pendiente, recibido (en revisión), validado o ' +
      'por_corregir (con motivo). Los conductores traen su documento, nombre y certificados.',
  })
  @ApiResponse({
    status: 200,
    schema: {
      example: {
        cnpoliza: '18-1-1130480881',
        estado: 'incompleto',
        documentos: [
          { requisito: 'rif', tipo: 'rif', estado: 'validado' },
          {
            requisito: 'conductor', tipo: 'cedula', documento: '12345678', estado: 'por_corregir',
            motivo: 'La cédula no se ve completa.', conductorDoc: 'V-12345678', conductorNombre: 'José Pérez',
            certificados: [{ id: '0b6f1f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', ccerti: 3, placa: 'AB123CD' }],
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 503, description: 'API de documentos sin configurar en el servidor.' })
  estado(@CurrentTenant() t: Tenant) {
    return this.docs.estado(t.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(
    AnyFilesInterceptor({
      // Tope duro de memoria; el contrato (10 MB) se valida con mensaje propio. Se admite un archivo más
      // del máximo para responder «Máximo 10 archivos» en español; más que eso lo corta multer (400).
      limits: { fileSize: MAX_ARCHIVO_DOCUMENTO + 2 * 1024 * 1024, files: MAX_ARCHIVOS_LOTE + 1, fields: 20 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir el RIF de la empresa o la cédula / pasaporte de uno o varios conductores (PDF, JPG, PNG o WEBP; máx. 10 MB c/u)',
    description:
      'Responde enseguida con estado «recibido»; la lectura y la validación siguen en segundo plano (consultar GET). ' +
      'Reenviar el mismo documento reemplaza al anterior. Conductor: conductorDoc o certificadoId (certificado activo). ' +
      `**Varios (hasta ${MAX_ARCHIVOS_LOTE})**: archivos en el campo archivos (o archivo) repetido e items = JSON array alineado ` +
      'por orden con los archivos, p. ej. [{"tipo":"rif"},{"tipo":"cedula","conductorDoc":"V-12345678"}]. Resultado por archivo ' +
      '(uno malo no afecta a los demás): 201 todos recibidos, 207 mezcla, si todos fallan el status del primer error. ' +
      'Errores de forma del lote (items desalineado, más de 10 archivos) → 400 sin procesar nada.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        archivo: { type: 'string', format: 'binary', description: 'Un solo documento. También se acepta el campo `file`.' },
        tipo: { type: 'string', enum: ['rif', 'cedula', 'pasaporte'], description: 'Un solo documento.' },
        conductorDoc: { type: 'string', example: 'V-12345678', description: 'Un solo documento.' },
        certificadoId: { type: 'string', format: 'uuid', description: 'Un solo documento.' },
        archivos: {
          type: 'array',
          items: { type: 'string', format: 'binary' },
          description: `Varios documentos (máx. ${MAX_ARCHIVOS_LOTE}, 10 MB c/u).`,
        },
        items: {
          type: 'string',
          example: '[{"tipo":"rif"},{"tipo":"cedula","conductorDoc":"V-12345678"}]',
          description: 'Varios documentos: JSON array { tipo, conductorDoc?, certificadoId? } en el mismo orden que los archivos.',
        },
      },
    },
  })
  @ApiResponse({ status: 201, schema: { example: { cnpoliza: '18-1-1130480881', tipo: 'cedula', estado: 'recibido', documento: '12345678', conductorDoc: 'V-12345678', certificadoId: '0b6f1f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', ccerti: 3 } } })
  @ApiResponse({
    status: 207,
    description: 'Lote con resultados mixtos (201 si todos se recibieron).',
    schema: {
      example: {
        cnpoliza: '18-1-1130480881',
        recibidos: 1,
        fallidos: 1,
        resultados: [
          { indice: 0, archivo: 'rif.pdf', tipo: 'rif', estado: 'recibido', ok: true },
          { indice: 1, archivo: 'cedula.jpg', tipo: 'cedula', conductorDoc: 'V-99999999', ok: false, status: 404, message: 'El conductor no tiene certificado activo en la póliza de la flota.' },
        ],
      },
    },
  })
  async subir(
    @CurrentTenant() t: Tenant,
    @UploadedFiles() archivos: ArchivoMulter[] | undefined,
    @Body() dto: SubirDocumentoFlotaDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const lista = archivos ?? [];
    const ajeno = lista.find((f) => !(CAMPOS_ARCHIVO as readonly string[]).includes(f.fieldname));
    if (ajeno) throw new BadRequestException(`Campo de archivo no permitido: ${ajeno.fieldname}. Use archivos, archivo o file.`);

    // Un solo archivo sin items: exactamente como siempre (201 y el resultado del documento).
    if (dto.items === undefined && lista.length <= 1) return this.docs.subir(t.id, lista[0], dto);

    if (dto.items !== undefined && (dto.tipo !== undefined || dto.conductorDoc !== undefined || dto.certificadoId !== undefined)) {
      throw new BadRequestException('Con items no envíe tipo, conductorDoc ni certificadoId sueltos: van dentro de cada item.');
    }
    const items = itemsDelLote(dto.items, lista.length);
    if (typeof items === 'string') throw new BadRequestException(items);
    const lote = await this.docs.subirLote(t.id, lista.map((archivo, i) => ({ ...items[i], archivo })));
    res.status(lote.httpStatus);
    return lote.data;
  }

  @Post('sincronizar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Volver a registrar en Nexus la póliza de la flota con sus conductores activos',
    description: 'Se hace solo al registrar la póliza y al cambiar certificados; este endpoint lo fuerza (p. ej. si Nexus estuvo caído).',
  })
  async sincronizar(@CurrentTenant() t: Tenant) {
    try {
      return await this.docs.sincronizar(t.id);
    } catch (err) {
      throw errorParaIntegrador(err);
    }
  }
}
