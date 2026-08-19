import React from 'react';

export default function Card({ headerLabel, title, headerRight = null, children, className = '', variant = 'default' }) {
  const bgClass = variant === 'muted' ? 'bg-slate-50' : 'bg-white';
  return (
    <div className={`rounded-lg ${bgClass} p-6 shadow-sm border border-slate-200 ${className}`}>
      {(headerLabel || title) && (
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            {headerLabel && <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{headerLabel}</p>}
            {title && <h3 className="text-lg font-semibold text-slate-900">{title}</h3>}
          </div>
          {headerRight}
        </div>
      )}
      <div>
        {children}
      </div>
    </div>
  );
}
