import React from 'react';

export default function Card({ headerLabel, title, headerRight = null, children, className='', variant = 'default', size = 'compact', titleSize = 'lg' }) {
  const bgClass = variant === 'muted' ? 'bg-slate-50' : 'bg-white';
  const sizeClasses = size === 'section' ? 'tw-rounded-3xl tw-p-6' : 'tw-rounded-lg tw-p-6';
  const headerSpacingClass = size === 'section' ? 'mb-6' : 'mb-4';
  const titleClasses = titleSize === 'xl' ? 'tw-text-2xl tw-font-semibold tw-text-slate-900' : 'tw-text-lg tw-font-semibold tw-text-slate-900';
  const TitleTag = titleSize === 'xl' ? 'h2' : 'h3';

  return (
    <div className={`${sizeClasses} ${bgClass} tw-shadow-sm tw-border tw-border-slate-200 ${className}`}>
      {(headerLabel || title) && (
        <div className={`${headerSpacingClass} tw-flex tw-items-center tw-justify-between tw-gap-3`}>
          <div>
            {headerLabel && <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-[0.24em] tw-text-slate-500">{headerLabel}</p>}
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
