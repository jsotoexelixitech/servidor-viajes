import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { EventoViajeDto } from './cobro-viaje.dto';
import { InicioViajeDto } from './flota.dto';
import { MSG_PASAJEROS_OBLIGATORIO, normalizarDocumentoPasajero, normalizarTelefono } from './pasajero.dto';

/** Mismas opciones que el ValidationPipe global de main.ts. */
const pipe = new ValidationPipe({
  whitelist: true, forbidNonWhitelisted: true, transform: true,
  transformOptions: { enableImplicitConversion: true }, stopAtFirstError: false,
});
const validar = <T>(metatype: new () => T, body: unknown): Promise<T> =>
  pipe.transform(body, { type: 'body', metatype });
/** `message` de la respuesta 400 (lista de textos). */
const mensajes = async (metatype: new () => unknown, body: unknown): Promise<string[]> => {
  const err: BadRequestException = await validar(metatype, body).then(() => null, (e) => e);
  expect(err).toBeInstanceOf(BadRequestException);
  return (err.getResponse() as { message: string[] }).message;
};

const pasajero = {
  tipoDoc: 'V', documento: 'V-12.345.678', nombres: 'María José', apellidos: 'Pérez Gómez',
  telefono: '+584141234567', correo: 'maria.perez@correo.com',
};
const inicio = { idViaje: 'RDY-1', tipo: 'INICIO', placa: 'AB123CD', pasajeros: [pasajero] };

describe('normalización de pasajeros', () => {
  it('documento: V/E solo dígitos, P alfanumérico en mayúsculas', () => {
    expect(normalizarDocumentoPasajero('V', 'V-12.345.678')).toBe('12345678');
    expect(normalizarDocumentoPasajero('e', 'E 84.123.456')).toBe('84123456');
    expect(normalizarDocumentoPasajero('P', 'ab-123 456')).toBe('AB123456');
    expect(normalizarDocumentoPasajero('V', 'sin numero')).toBe('');
  });
  it('teléfono: quita espacios, guiones, puntos y paréntesis', () => {
    expect(normalizarTelefono('+58 (414) 123-45.67')).toBe('+584141234567');
  });
});

describe('EventoViajeDto · pasajeros', () => {
  it('INICIO válido: normaliza documento, teléfono, correo y deja los opcionales', async () => {
    const dto = await validar(EventoViajeDto, {
      ...inicio,
      pasajeros: [
        { ...pasajero, tipoDoc: 'v', telefono: '+58 414-1234567', correo: ' Maria.Perez@Correo.com ', fechaNacimiento: '1990-05-17', esConductor: true },
        { ...pasajero, tipoDoc: 'P', documento: 'ab-123456', esConductor: 'false' },
      ],
    });
    expect(dto.pasajeros).toHaveLength(2);
    expect(dto.pasajeros![0]).toMatchObject({
      tipoDoc: 'V', documento: '12345678', telefono: '+584141234567', correo: 'maria.perez@correo.com',
      fechaNacimiento: '1990-05-17', esConductor: true,
    });
    expect(dto.pasajeros![1]).toMatchObject({ tipoDoc: 'P', documento: 'AB123456', esConductor: false });
  });

  it('INICIO sin pasajeros (ausente, vacío o no lista) → 400 con un solo mensaje claro', async () => {
    const { pasajeros: _omit, ...sin } = inicio;
    expect(await mensajes(EventoViajeDto, sin)).toEqual([MSG_PASAJEROS_OBLIGATORIO]);
    expect(await mensajes(EventoViajeDto, { ...inicio, pasajeros: [] })).toEqual([MSG_PASAJEROS_OBLIGATORIO]);
    expect(await mensajes(EventoViajeDto, { ...inicio, pasajeros: null })).toContain(MSG_PASAJEROS_OBLIGATORIO);
  });

  it('correo inválido → 400 indicando el pasajero y el campo', async () => {
    const m = await mensajes(EventoViajeDto, { ...inicio, pasajeros: [pasajero, { ...pasajero, documento: '9876543', correo: 'no-es-correo' }] });
    expect(m).toEqual(['pasajeros.1.correo es obligatorio y debe ser un correo electrónico válido.']);
  });

  it('campos obligatorios y formatos: mensajes en español por campo', async () => {
    const m = await mensajes(EventoViajeDto, {
      ...inicio,
      pasajeros: [{ tipoDoc: 'J', documento: 'V-sin-numero', nombres: '  ', telefono: '12345', fechaNacimiento: '17/05/1990', esConductor: 'quizá' }],
    });
    const texto = m.join(' | ');
    for (const campo of ['tipoDoc', 'documento', 'nombres', 'apellidos', 'telefono', 'correo', 'fechaNacimiento', 'esConductor']) {
      expect(texto).toContain(`pasajeros.0.${campo} `);
    }
    expect(texto).not.toMatch(/must be|should not/);
  });

  it('límites de longitud: documento 20, nombres y apellidos 100, teléfono 15 dígitos', async () => {
    const m = await mensajes(EventoViajeDto, {
      ...inicio,
      pasajeros: [{ ...pasajero, tipoDoc: 'P', documento: 'A'.repeat(21), nombres: 'N'.repeat(101), apellidos: 'A'.repeat(101), telefono: '+1234567890123456' }],
    });
    expect(m).toHaveLength(4);
  });

  it('FIN y CANCELACION no exigen pasajeros', async () => {
    await expect(validar(EventoViajeDto, { idViaje: 'RDY-1', tipo: 'FIN', km: 9.1 })).resolves.toBeDefined();
    await expect(validar(EventoViajeDto, { idViaje: 'RDY-1', tipo: 'CANCELACION', motivo: 'x' })).resolves.toBeDefined();
  });
});

describe('InicioViajeDto (cierre mensual) · pasajeros', () => {
  const base = { idExterno: 'RDY-1', placa: 'AB123CD' };
  it('exige la lista y la normaliza igual', async () => {
    expect(await mensajes(InicioViajeDto, base)).toEqual([MSG_PASAJEROS_OBLIGATORIO]);
    const dto = await validar(InicioViajeDto, { ...base, pasajeros: [pasajero] });
    expect(dto.pasajeros[0].documento).toBe('12345678');
  });
});
