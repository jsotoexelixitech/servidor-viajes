import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { PolizaPublica } from './views/PolizaPublica';
import './index.css';

// También bajo un prefijo (/pinkriders/poliza/<token>).
const TOKEN_POLIZA = /\/poliza\/([A-Za-z0-9_-]{24,64})\/?$/.exec(window.location.pathname)?.[1] ?? null;

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    {/* Link público de solo lectura de una póliza de flota: /poliza/<token> (sin login). */}
    {TOKEN_POLIZA ? <PolizaPublica token={TOKEN_POLIZA} /> : <App />}
  </React.StrictMode>,
);
