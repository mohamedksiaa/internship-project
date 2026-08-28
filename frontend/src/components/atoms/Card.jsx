import React from 'react';

export default function Card({ headerLabel, title, headerRight = null, children, className = '', variant = 'default', size = 'compact', titleSize = 'lg' }) {
  const bgClass = variant === 'muted' ? 'bg-slate-50' : 'bg-white';
  const sizeClasses = size === 'section' ? 'rounded-3xl p-6' : 'rounded-lg p-6';
  const headerSpacingClass = size === 'section' ? 'mb-6' : 'mb-4';
  const titleClasses = titleSize === 'xl' ? 'text-2xl font-semibold text-slate-900' : 'text-lg font-semibold text-slate-900';
  const TitleTag = titleSize === 'xl' ? 'h2' : 'h3';

  return (
    <div className={`${sizeClasses} ${bgClass} shadow-sm border border-slate-200 ${className}`}>
      {(headerLabel || title) && (
        <div className={`${headerSpacingClass} flex items-center justify-between gap-3`}>
          <div>
            {headerLabel && <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-500">{headerLabel}</p>}
            {title && <TitleTag className={titleClasses}>{title}</TitleTag>}
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
