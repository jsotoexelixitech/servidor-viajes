import { BadRequestException } from '@nestjs/common';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean, IsDateString, IsEmail, IsIn, IsNotEmpty, IsOptional, IsString, Matches, MaxLength,
  registerDecorator, ValidationOptions,
} from 'class-validator';

export const TIPOS_DOC_PASAJERO = ['V', 'E', 'P'] as const;
export type TipoDocPasajero = (typeof TIPOS_DOC_PASAJERO)[number];
export const MAX_PASAJEROS = 50;

export const MSG_PASAJEROS_OBLIGATORIO =
  'pasajeros es obligatorio en el INICIO del viaje: envíe la lista (mínimo 1) de las personas que viajan.';

/** Pasajero tal como se guarda con el viaje (flota_viajes.pasajeros). */
export interface PasajeroViaje {
  tipoDoc: TipoDocPasajero;
  documento: string;
  nombres: string;
  apellidos: string;
  telefono: string;
  correo: string;
  fechaNacimiento: string | null;
  esConductor: boolean;
}

/** «V-12.345.678» → «12345678» (V/E: solo dígitos) · pasaporte: alfanumérico en mayúsculas. */
export function normalizarDocumentoPasajero(tipoDoc: unknown, documento: unknown): string {
  const s = String(documento ?? '').toUpperCase();
  return String(tipoDoc ?? '').trim().toUpperCase() === 'P' ? s.replace(/[^A-Z0-9]/g, '') : s.replace(/\D/g, '');
}

/** «+58 (414) 123-45.67» → «+584141234567». */
export function normalizarTelefono(telefono: unknown): string {
  return String(telefono ?? '').replace(/[\s().-]/g, '');
}

const txt = (fn: (v: string) => string) => ({ value }: { value: unknown }) => (typeof value === 'string' ? fn(value) : value);

/** Persona que viaja (pasajero o conductor). Obligatoria la lista en cada INICIO. */
export class PasajeroDto {
  @ApiProperty({ enum: TIPOS_DOC_PASAJERO, example: 'V', description: 'V = venezolano · E = extranjero · P = pasaporte.' })
  @Transform(txt((v) => v.trim().toUpperCase()))
  @IsIn(TIPOS_DOC_PASAJERO as unknown as string[], { message: 'tipoDoc es obligatorio y debe ser V, E o P.' })
  tipoDoc: TipoDocPasajero;

  @ApiProperty({
    example: '12345678', maxLength: 20,
    description: 'Número de documento. Se normaliza: «V-12.345.678» → «12345678» (V/E solo dígitos; P letras y números en mayúsculas).',
  })
  @Transform(({ value, obj }) =>
    typeof value === 'string' || typeof value === 'number' ? normalizarDocumentoPasajero(obj?.tipoDoc, value) : value)
  @IsString({ message: 'documento es obligatorio (texto).' })
  @IsNotEmpty({ message: 'documento es obligatorio (V/E: solo dígitos; P: letras y números).' })
  @MaxLength(20, { message: 'documento admite máximo 20 caracteres.' })
  documento: string;

  @ApiProperty({ example: 'María José', maxLength: 100 })
  @Transform(txt((v) => v.trim()))
  @IsString({ message: 'nombres es obligatorio (texto).' })
  @IsNotEmpty({ message: 'nombres es obligatorio.' })
  @MaxLength(100, { message: 'nombres admite máximo 100 caracteres.' })
  nombres: string;

  @ApiProperty({ example: 'Pérez Gómez', maxLength: 100 })
  @Transform(txt((v) => v.trim()))
  @IsString({ message: 'apellidos es obligatorio (texto).' })
  @IsNotEmpty({ message: 'apellidos es obligatorio.' })
  @MaxLength(100, { message: 'apellidos admite máximo 100 caracteres.' })
  apellidos: string;

  @ApiProperty({ example: '+584141234567', maxLength: 20, description: 'Con código de área: de 7 a 15 dígitos, «+» inicial opcional.' })
  @Transform(txt(normalizarTelefono))
  @IsString({ message: 'telefono es obligatorio (texto).' })
  @Matches(/^\+?\d{7,15}$/, {
    message: 'telefono es obligatorio: de 7 a 15 dígitos con código de área y «+» inicial opcional (ej. +584141234567).',
  })
  telefono: string;

  @ApiProperty({ example: 'maria.perez@correo.com' })
  @Transform(txt((v) => v.trim().toLowerCase()))
  @IsEmail({}, { message: 'correo es obligatorio y debe ser un correo electrónico válido.' })
  correo: string;

  @ApiPropertyOptional({ example: '1990-05-17', description: 'AAAA-MM-DD.' })
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'fechaNacimiento debe tener el formato AAAA-MM-DD.' })
  @IsDateString({ strict: true }, { message: 'fechaNacimiento debe ser una fecha válida (AAAA-MM-DD).' })
  fechaNacimiento?: string;

  @ApiPropertyOptional({ example: false, default: false, description: 'true si esta persona es quien conduce.' })
  // Se lee el valor original: la conversión implícita del ValidationPipe volvería true cualquier texto.
  @Transform(({ obj }) => {
    const v = obj?.esConductor;
    return v === 'true' ? true : v === 'false' ? false : v;
  })
  @IsOptional()
  @IsBoolean({ message: 'esConductor debe ser true o false.' })
  esConductor?: boolean;
}

/** Lista de pasajeros: arreglo de 1 a MAX_PASAJEROS (un solo mensaje claro si falta). */
export function EsListaPasajeros(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'esListaPasajeros',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate: (v: unknown) => Array.isArray(v) && v.length >= 1 && v.length <= MAX_PASAJEROS,
        defaultMessage: (a) =>
          Array.isArray(a?.value) && a.value.length > MAX_PASAJEROS
            ? `pasajeros admite máximo ${MAX_PASAJEROS} personas por viaje.`
            : MSG_PASAJEROS_OBLIGATORIO,
      },
    });
}

/**
 * Deja la lista lista para guardar (normalizada) y valida lo que no cubre el DTO:
 * mínimo 1 y sin documentos repetidos. Errores → 400 con `message` como lista.
 */
export function prepararPasajeros(lista: PasajeroDto[] | null | undefined): PasajeroViaje[] {
  if (!Array.isArray(lista) || !lista.length) throw new BadRequestException([MSG_PASAJEROS_OBLIGATORIO]);
  const vistos = new Set<string>();
  return lista.map((p, i) => {
    const tipoDoc = String(p.tipoDoc ?? '').trim().toUpperCase() as TipoDocPasajero;
    const documento = normalizarDocumentoPasajero(tipoDoc, p.documento);
    if (!TIPOS_DOC_PASAJERO.includes(tipoDoc) || !documento) {
      throw new BadRequestException([`pasajeros.${i}: tipoDoc (V, E o P) y documento son obligatorios.`]);
    }
    const clave = `${tipoDoc}${documento}`;
    if (vistos.has(clave)) {
      throw new BadRequestException([`pasajeros.${i}: el documento ${tipoDoc}-${documento} está repetido en la lista.`]);
    }
    vistos.add(clave);
    return {
      tipoDoc,
      documento,
      nombres: String(p.nombres ?? '').trim(),
      apellidos: String(p.apellidos ?? '').trim(),
      telefono: normalizarTelefono(p.telefono),
      correo: String(p.correo ?? '').trim().toLowerCase(),
      fechaNacimiento: p.fechaNacimiento || null,
      esConductor: p.esConductor === true,
    };
  });
}
