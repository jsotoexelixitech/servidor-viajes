import React from 'react';

export function SectionCard({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="card p-6 animate-in">
      <div className="flex items-center gap-2.5 mb-5">
        <span className="section-num">{num}</span>
        <span className="section-title">{title}</span>
      </div>
      {children}
    </div>
  );
}
