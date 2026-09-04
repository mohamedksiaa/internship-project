import React from 'react';

export default function Card({ headerLabel, title, headerRight = null, children, className='', variant = 'default', size = 'compact', titleSize = 'lg' }) {
  const bgClass = variant === 'muted' ? 'tw-bg-slate-50 dark:tw-bg-slate-800/60' : 'tw-bg-white dark:tw-bg-slate-900';
  const sizeClasses = size === 'section' ? 'tw-rounded-3xl tw-p-6' : 'tw-rounded-lg tw-p-6';
  const headerSpacingClass = size === 'section' ? 'mb-6' : 'mb-4';
  const titleClasses = titleSize === 'xl' ? 'tw-text-2xl tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100' : 'tw-text-lg tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100';
  const TitleTag = titleSize === 'xl' ? 'h2' : 'h3';

  return (
    <div className={`${sizeClasses} ${bgClass} tw-shadow-sm dark:tw-shadow-none tw-border tw-border-slate-200 dark:tw-border-slate-700 ${className}`}>
      {(headerLabel || title) && (
        <div className={`${headerSpacingClass} tw-flex tw-items-center tw-justify-between tw-gap-3`}>
          <div>
            {headerLabel && <p className="tw-text-xs tw-font-semibold tw-uppercase tw-tracking-[0.24em] tw-text-slate-500 dark:tw-text-slate-400">{headerLabel}</p>}
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
