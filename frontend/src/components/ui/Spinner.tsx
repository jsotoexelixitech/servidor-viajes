import React from 'react';

export function Spinner({ size = 'md', color = 'current' }: { size?: 'sm' | 'md' | 'lg'; color?: string }) {
  const sz = size === 'sm' ? 'w-3.5 h-3.5 border' : size === 'lg' ? 'w-7 h-7 border-2' : 'w-5 h-5 border-2';
  return (
    <div
      className={`${sz} border-t-transparent rounded-full animate-spin shrink-0`}
      style={color !== 'current' ? undefined : { borderColor: 'currentColor', borderTopColor: 'transparent' }}
    />
  );
}
