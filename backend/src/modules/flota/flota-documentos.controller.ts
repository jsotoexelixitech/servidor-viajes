import {
  Body, Controller, Get, HttpCode, HttpStatus, Post, UploadedFiles, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { TenantGuard } from '../../common/guards/tenant.guard';
import { CurrentTenant } from '../../common/decorators/tenant.decorator';
import { Tenant } from '../tenant/entities/tenant.entity';
import { ArchivoSubido, FlotaDocumentosService, MAX_ARCHIVO_DOCUMENTO } from './flota-documentos.service';
import { SubirDocumentoFlotaDto } from './dto/documentos.dto';
import { errorParaIntegrador } from './flota-expediente.client';

type Archivos = { archivo?: ArchivoSubido[]; file?: ArchivoSubido[] };

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
    FileFieldsInterceptor([{ name: 'archivo', maxCount: 1 }, { name: 'file', maxCount: 1 }], {
      // Tope duro de memoria; el contrato (10 MB) se valida con mensaje propio.
      limits: { fileSize: MAX_ARCHIVO_DOCUMENTO + 2 * 1024 * 1024, files: 1, fields: 10 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Subir el RIF de la empresa o la cédula / pasaporte de un conductor (PDF, JPG, PNG o WEBP; máx. 10 MB)',
    description:
      'Responde enseguida con estado «recibido»; la lectura y la validación siguen en segundo plano (consultar GET). ' +
      'Reenviar el mismo documento reemplaza al anterior. Conductor: conductorDoc o certificadoId (certificado activo).',
  })
  @ApiBody({
    schema: {
      type: 'object',
      required: ['archivo', 'tipo'],
      properties: {
        archivo: { type: 'string', format: 'binary', description: 'También se acepta el campo `file`.' },
        tipo: { type: 'string', enum: ['rif', 'cedula', 'pasaporte'] },
        conductorDoc: { type: 'string', example: 'V-12345678' },
        certificadoId: { type: 'string', format: 'uuid' },
      },
    },
  })
  @ApiResponse({ status: 201, schema: { example: { cnpoliza: '18-1-1130480881', tipo: 'cedula', estado: 'recibido', documento: '12345678', conductorDoc: 'V-12345678', certificadoId: '0b6f1f0e-1c2d-4e5f-8a9b-0c1d2e3f4a5b', ccerti: 3 } } })
  subir(@CurrentTenant() t: Tenant, @UploadedFiles() archivos: Archivos | undefined, @Body() dto: SubirDocumentoFlotaDto) {
    const archivo = archivos?.archivo?.[0] ?? archivos?.file?.[0];
    return this.docs.subir(t.id, archivo, dto);
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
