import { createContext, useContext } from 'react';
import type { UiConfig } from '../api';

/**
 * Marca de la pantalla. La base viene de GET /api/config/ui (por despliegue) y cada flota
 * puede sobrescribirla (tenant.config.ui) al iniciar sesión. Los colores se aplican como
 * variables CSS (--lm-*), que es lo que usan index.css y tailwind.config.js.
 */
export const BRAND_DEFAULT: UiConfig = {
  brandName: 'La Mundial',
  brandSuffix: 'de Seguros',
  appTitle: 'Flota por uso',
  logoUrl: '/brand/mundial-isotipo.png',
  colors: {
    primary: '#0F1A5A', primaryDeep: '#091133', primaryBright: '#162A7F', blue: '#2E6DBF',
    accent: '#E84F51', accentCta: '#D4403F', accentHover: '#BF3534',
  },
  // Hasta que cargue la configuración no se muestra ningún campo de clave.
  authModes: ['nexus'],
};

export function mergeBrand(base: UiConfig, over?: Partial<UiConfig> | null): UiConfig {
  if (!over) return base;
  return {
    ...base,
    ...Object.fromEntries(Object.entries(over).filter(([k, v]) => k !== 'colors' && v !== undefined && v !== null && v !== '')),
    colors: { ...base.colors, ...(over.colors ?? {}) },
    authModes: over.authModes?.length ? over.authModes : base.authModes,
  } as UiConfig;
}

const CSS_VARS: Record<keyof UiConfig['colors'], string> = {
  primary: '--lm-navy', primaryDeep: '--lm-navy-deep', primaryBright: '--lm-navy-bright', blue: '--lm-blue',
  accent: '--lm-red', accentCta: '--lm-red-cta', accentHover: '--lm-red-hover',
};

export function applyBranding(b: UiConfig) {
  const root = document.documentElement.style;
  (Object.keys(CSS_VARS) as Array<keyof UiConfig['colors']>).forEach((k) => {
    if (b.colors[k]) root.setProperty(CSS_VARS[k], b.colors[k]);
  });
  document.title = `${b.brandName} ${b.brandSuffix}`.trim() + ` — ${b.appTitle}`;
}

export const BrandContext = createContext<UiConfig>(BRAND_DEFAULT);
export const useBrand = () => useContext(BrandContext);
