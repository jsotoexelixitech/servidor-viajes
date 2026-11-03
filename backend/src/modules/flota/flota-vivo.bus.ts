import { Injectable } from '@nestjs/common';

/**
 * Revisión "en vivo" por flota: cada evento de viaje, pago o cambio de certificado la sube.
 * La pantalla "Póliza en vivo" consulta cada pocos segundos con la última revisión que vio y
 * solo recibe el cuadro completo cuando cambió (respuesta liviana `sinCambios` si no).
 *
 * Es memoria del proceso: con CLUSTER_WORKERS=1 (120) es exacta; con varios workers cada uno
 * lleva la suya y la pantalla simplemente recarga un poco más (además refresca completo cada 30 s).
 */
@Injectable()
export class FlotaVivoBus {
  /** Base distinta en cada arranque: tras un reinicio la pantalla siempre recarga. */
  private readonly base = Date.now();
  private readonly revs = new Map<string, number>();

  rev(tenantId: string): string {
    return `${this.base}.${this.revs.get(tenantId) ?? 0}`;
  }

  bump(tenantId: string): void {
    this.revs.set(tenantId, (this.revs.get(tenantId) ?? 0) + 1);
  }
}
