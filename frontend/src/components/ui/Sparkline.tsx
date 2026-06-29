import React from 'react';

export function Sparkline({
  data, className, stroke = '#0f1a5a', fill,
}: {
  data: number[];
  className?: string;
  stroke?: string;
  fill?: string;
}) {
  const w = 80, h = 32;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const range = max - min || 1;
  const step = data.length > 1 ? w / (data.length - 1) : w;
  const pts = data
    .map((v, i) => `${(i * step).toFixed(2)},${(h - ((v - min) / range) * (h - 2) - 1).toFixed(2)}`)
    .join(' ');
  const area = fill ? `M0,${h} L${pts.split(' ').join(' L')} L${w},${h} Z` : '';

  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className}>
      {fill && <path d={area} fill={fill} />}
      <polyline
        points={pts}
        fill="none"
        stroke={stroke}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
