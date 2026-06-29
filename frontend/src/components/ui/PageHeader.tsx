import React from 'react';

export function PageHeader({
  title, subtitle, action,
}: {
  title: string;
  subtitle: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between mb-7 animate-in">
      <div>
        <h1 className="page-title">{title}</h1>
        <div className="page-subtitle">{subtitle}</div>
      </div>
      {action && <div className="ml-4 shrink-0">{action}</div>}
    </div>
  );
}
