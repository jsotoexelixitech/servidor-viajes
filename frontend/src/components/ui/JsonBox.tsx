import React from 'react';
import { CopyButton } from './CopyButton';

export function JsonBox({ data, maxH = '18rem' }: { data: unknown; maxH?: string }) {
  if (data === null || data === undefined) return null;
  const raw = JSON.stringify(data, null, 2);
  const html = raw
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"([^"]+)"(\s*:)/g, '<span class="json-key">"$1"</span>$2')
    .replace(/(:\s*)"([^"]*)"/g, '$1<span class="json-str">"$2"</span>')
    .replace(/:\s*(\b\d+\.?\d*\b)/g, (m, n) => m.replace(n, `<span class="json-num">${n}</span>`))
    .replace(/:\s*(true|false)/g, (m, b) => m.replace(b, `<span class="json-bool">${b}</span>`))
    .replace(/:\s*(null)/g, (m, n) => m.replace(n, `<span class="json-null">${n}</span>`));

  return (
    <div className="relative group">
      <pre
        className="font-mono text-xs rounded-xl p-4 overflow-auto border border-[#21262d]/50 bg-[#0d1117] leading-relaxed"
        style={{ maxHeight: maxH }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
      <style>{`
        .json-key  { color: #79c0ff; }
        .json-str  { color: #a5d6ff; }
        .json-num  { color: #f78166; }
        .json-bool { color: #ff9492; }
        .json-null { color: #8b949e; }
      `}</style>
      <div className="absolute top-2.5 right-2.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <CopyButton text={raw} compact />
      </div>
    </div>
  );
}
