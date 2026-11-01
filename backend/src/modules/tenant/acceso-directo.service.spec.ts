import { NotFoundException } from '@nestjs/common';
import { AccesoDirectoService } from './acceso-directo.service';
import { uiConfigFromEnv } from '../ui-config/ui-config.module';
import { SessionService } from '../../common/session/session.service';

const ridery = { id: 'tenant-ridery', nombre: 'Ridery', activo: true, apiKey: 'NO-DEBE-SALIR', config: { ui: { appTitle: 'X' } } };

function setup() {
  const tenantRepo = {
    findOne: jest.fn(async ({ where }: { where: { nombre: string } }) => (where.nombre === 'Ridery' ? ridery : null)),
  };
  const session = { generate: jest.fn(() => ({ token: 'tok', expiresAt: '2026-11-02T00:00:00Z' })) } as unknown as SessionService;
  return { svc: new AccesoDirectoService(tenantRepo as never, session), tenantRepo, session };
}

describe('Acceso directo (FLOTA_ACCESO_DIRECTO)', () => {
  const ENV = { ...process.env };
  afterEach(() => { process.env = { ...ENV }; });

  it('apagado por defecto: 404 y la pantalla no lo anuncia', async () => {
    delete process.env.FLOTA_ACCESO_DIRECTO;
    const { svc, session } = setup();
    await expect(svc.iniciar()).rejects.toBeInstanceOf(NotFoundException);
    expect(session.generate).not.toHaveBeenCalled();
    expect(uiConfigFromEnv().accesoDirecto).toBe(false);
  });

  it('con valor distinto de 1 sigue apagado', async () => {
    process.env.FLOTA_ACCESO_DIRECTO = 'true';
    const { svc } = setup();
    await expect(svc.iniciar()).rejects.toBeInstanceOf(NotFoundException);
  });

  it('encendido: session token de la flota configurada, sin API key', async () => {
    process.env.FLOTA_ACCESO_DIRECTO = '1';
    process.env.FLOTA_ACCESO_DIRECTO_TENANT = 'Ridery';
    const { svc, session } = setup();
    const r = await svc.iniciar('10.0.0.1');
    expect(session.generate).toHaveBeenCalledWith('tenant-ridery');
    expect(r).toMatchObject({ sessionToken: 'tok', tenant: { id: 'tenant-ridery', nombre: 'Ridery' }, directo: true });
    expect(JSON.stringify(r)).not.toContain('NO-DEBE-SALIR');
    expect(uiConfigFromEnv().accesoDirecto).toBe(true);
  });

  it('encendido sin tenant propio usa FLOTA_NEXUS_TENANT_DEFAULT', async () => {
    process.env.FLOTA_ACCESO_DIRECTO = '1';
    delete process.env.FLOTA_ACCESO_DIRECTO_TENANT;
    process.env.FLOTA_NEXUS_TENANT_DEFAULT = 'Ridery';
    const { svc } = setup();
    await expect(svc.iniciar()).resolves.toMatchObject({ tenant: { nombre: 'Ridery' } });
  });

  it('encendido con flota inexistente: 404', async () => {
    process.env.FLOTA_ACCESO_DIRECTO = '1';
    process.env.FLOTA_ACCESO_DIRECTO_TENANT = 'Otra';
    const { svc } = setup();
    await expect(svc.iniciar()).rejects.toBeInstanceOf(NotFoundException);
  });
});
