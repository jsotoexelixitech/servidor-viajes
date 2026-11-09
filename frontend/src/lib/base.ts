/**
 * Raíz donde se sirve la app ('/' o '/pinkriders/'), tomada del <base> que index.html fija al cargar.
 * Todo lo que antes iba con ruta absoluta (/api, /poliza, /brand/...) se arma desde aquí.
 */
export const APP_ROOT: string = (() => {
  try {
    const p = new URL(document.baseURI).pathname;
    return p.endsWith('/') ? p : p + '/';
  } catch {
    return '/';
  }
})();

/** 'api/docs' o '/api/docs' → '/pinkriders/api/docs' (o '/api/docs' en la raíz). */
export const appUrl = (ruta: string): string => APP_ROOT + ruta.replace(/^\/+/, '');

/** Logos e imágenes: una ruta absoluta del propio sitio ('/brand/x.png') pasa a la raíz de la app; URLs completas no cambian. */
export const assetUrl = (u: string): string => (u && u.startsWith('/') && !u.startsWith('//') ? appUrl(u) : u);
