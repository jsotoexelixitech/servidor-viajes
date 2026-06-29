import React from 'react';

function EmptyIllustration() {
  return (
    <svg viewBox="0 0 160 110" className="w-32 h-22" fill="none" aria-hidden>
      <defs>
        <linearGradient id="empBg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#eef2ff" />
          <stop offset="1" stopColor="#f8fafc" />
        </linearGradient>
        <linearGradient id="empCard" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff" />
          <stop offset="1" stopColor="#f1f5f9" />
        </linearGradient>
      </defs>
      <ellipse cx="80" cy="98" rx="64" ry="6" fill="#e2e8f0" opacity=".7" />
      <rect x="22" y="22" width="116" height="68" rx="10" fill="url(#empBg)" stroke="#dbe1eb" />
      <rect x="32" y="32" width="44" height="10" rx="3" fill="url(#empCard)" stroke="#cbd5e1" />
      <rect x="32" y="48" width="96" height="6" rx="2" fill="#e2e8f0" />
      <rect x="32" y="60" width="80" height="6" rx="2" fill="#e2e8f0" />
      <rect x="32" y="72" width="60" height="6" rx="2" fill="#e2e8f0" />
      <circle cx="118" cy="38" r="9" fill="#fff" stroke="#0f1a5a" strokeWidth="1.5" />
      <path d="M124 44 l5 5" stroke="#0f1a5a" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

export function EmptyState({
  icon, title, sub, action,
}: {
  icon?: React.ReactNode;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card p-12 sm:p-16 flex flex-col items-center justify-center text-center animate-in">
      <EmptyIllustration />
      <p className="font-extrabold text-slate-700 mt-4">{title}</p>
      {sub && <p className="text-sm text-slate-600 mt-1 max-w-sm">{sub}</p>}
      {action && <div className="mt-4">{action}</div>}
      {icon && !action && <div className="mt-3 text-slate-400">{icon}</div>}
    </div>
  );
}
