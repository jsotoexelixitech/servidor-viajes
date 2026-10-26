import { Controller, Get, Module } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

/**
 * Configuración de la pantalla por despliegue (marca, colores y modos de acceso).
 * Así el mismo servicio sirve a La Mundial u otra empresa sin tocar código:
 * todo sale del .env, y cada flota puede sobrescribir su marca en tenant.config.ui.
 */
export interface UiConfig {
  brandName: string;
  brandSuffix: string;
  appTitle: string;
  logoUrl: string;
  colors: {
    primary: string; primaryDeep: string; primaryBright: string; blue: string;
    accent: string; accentCta: string; accentHover: string;
  };
  /** 'nexus' = entra solo desde Nexus (SSO); 'apikey' = campo de API key (uso interno / otras conexiones). */
  authModes: Array<'nexus' | 'apikey'>;
}

/** Si la variable está definida manda su valor (vacío incluido: p. ej. sin sufijo de marca); si no, el valor por defecto. */
const env = (k: string, d: string) => (process.env[k] === undefined ? d : process.env[k].trim());

export function uiConfigFromEnv(): UiConfig {
  const modos = env('UI_AUTH_MODES', 'nexus,apikey').split(',').map((m) => m.trim().toLowerCase())
    .filter((m): m is 'nexus' | 'apikey' => m === 'nexus' || m === 'apikey');
  return {
    brandName:   env('UI_BRAND_NAME', 'La Mundial'),
    brandSuffix: env('UI_BRAND_SUFFIX', 'de Seguros'),
    appTitle:    env('UI_APP_TITLE', 'Flota por uso'),
    logoUrl:     env('UI_LOGO_URL', '/brand/mundial-isotipo.png'),
    colors: {
      primary:       env('UI_COLOR_PRIMARY', '#0F1A5A'),
      primaryDeep:   env('UI_COLOR_PRIMARY_DEEP', '#091133'),
      primaryBright: env('UI_COLOR_PRIMARY_BRIGHT', '#162A7F'),
      blue:          env('UI_COLOR_BLUE', '#2E6DBF'),
      accent:        env('UI_COLOR_ACCENT', '#E84F51'),
      accentCta:     env('UI_COLOR_ACCENT_CTA', '#D4403F'),
      accentHover:   env('UI_COLOR_ACCENT_HOVER', '#BF3534'),
    },
    authModes: modos.length ? modos : ['nexus'],
  };
}

@ApiTags('Pantalla')
@Controller('config')
export class UiConfigController {
  @Get('ui')
  @ApiOperation({ summary: 'Marca, colores y modos de acceso de la pantalla (parametrizable por despliegue, sin auth)' })
  get(): UiConfig {
    return uiConfigFromEnv();
  }
}

@Module({ controllers: [UiConfigController] })
export class UiConfigModule {}
