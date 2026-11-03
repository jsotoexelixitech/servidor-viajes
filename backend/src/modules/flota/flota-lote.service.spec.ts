import { calcularMontoDistancia } from './flota-cobro-viaje.service';
import { formatearCedula, limpiarPlaca, validarFila } from './flota-lote.service';
import { ClasificacionDistancia, RedondeoKm } from './entities/flota-tarifa-distancia.entity';

describe('Crear flota por Excel — validación de filas', () => {
  it('acepta placa 6–8 alfanuméricos y cédula V/E/J + dígitos', () => {
    expect(validarFila({ placa: 'RD123AA', cedulaConductor: 'V-31.234.567', nombreConductor: 'José' })).toEqual([]);
    expect(validarFila({ placa: 'rd-123-aa', cedulaConductor: 'e12345678', nombreConductor: 'Ana' })).toEqual([]);
  });

  it('marca placa, cédula y nombre inválidos', () => {
    const e = validarFila({ placa: 'AB1', cedulaConductor: 'X123', nombreConductor: ' ' });
    expect(e).toHaveLength(3);
  });

  it('normaliza placa y cédula', () => {
    expect(limpiarPlaca(' rd-123 aa ')).toBe('RD123AA');
    expect(formatearCedula('v.31.234.567')).toBe('V-31234567');
  });
});

describe('Interurbano', () => {
  const t = (clasificacion: ClasificacionDistancia, kmDesde: string, kmHasta: string | null, tarifaKm: string, minimo: string, activa = true) => ({
    clasificacion, nombre: clasificacion, kmDesde, kmHasta, tarifaKm, minimo, redondeo: RedondeoKm.KM_ARRIBA, moneda: 'USD', activa,
  });
  const tarifas = [
    t(ClasificacionDistancia.URBANO, '0', '20', '0.10', '1'),
    t(ClasificacionDistancia.EXTRA_URBANO, '20', '80', '0.08', '3'),
    t(ClasificacionDistancia.INTERURBANO, '80', null, '0.06', '6'),
  ];

  it('clasifica por rango de km', () => {
    expect(calcularMontoDistancia(tarifas, 120).clasificacion).toBe('INTERURBANO');
    expect(calcularMontoDistancia(tarifas, 120).monto).toBe(7.2);
    expect(calcularMontoDistancia(tarifas, 35).clasificacion).toBe('EXTRA_URBANO');
  });

  it('acepta la clasificación explícita INTERURBANO', () => {
    const r = calcularMontoDistancia(tarifas, 30, 'INTERURBANO');
    expect(r.clasificacion).toBe('INTERURBANO');
    expect(r.monto).toBe(6); // aplica el mínimo
  });

  it('inactivo: no se usa', () => {
    const sinInter = tarifas.map((x) => (x.clasificacion === 'INTERURBANO' ? { ...x, activa: false } : x));
    expect(() => calcularMontoDistancia(sinInter, 30, 'INTERURBANO')).toThrow();
  });
});
