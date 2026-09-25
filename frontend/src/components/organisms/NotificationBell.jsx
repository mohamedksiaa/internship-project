import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  getAlertPreferences,
  getMyNotifications,
  markNotificationsRead,
  saveAlertPreferences,
} from '../../api/timeflowApi';

// How often the bell asks the server again, in addition to when the tab
// regains focus and every time the panel is opened.
export const NOTIFICATION_POLL_MS = 60000;

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_NAMES = 3;

function formatDay(day, language) {
  if (!ISO_DAY.test(day)) return day;
  const date = new Date(`${day}T12:00:00`);
  if (Number.isNaN(date.getTime())) return day;
  try {
    return new Intl.DateTimeFormat(language, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  } catch {
    return day;
  }
}

/**
 * The manager's bell: their own late-arrival digests (one per day), an unread
 * counter, and — in the footer — the "also email me" preference.
 *
 * It only exists for a user with the readall right (AppLayout decides), because
 * only managers are ever sent these. Every request is about the caller alone.
 * A failing request never breaks the page: the panel just says so and offers to retry.
 */
export default function NotificationBell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [list, setList] = useState({ status: 'loading', available: true, unread: 0, rows: [], error: '' });
  const [prefs, setPrefs] = useState(null);
  const [prefsBusy, setPrefsBusy] = useState(false);
  const [prefsError, setPrefsError] = useState('');
  const rootRef = useRef(null);
  const mounted = useRef(true);
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    requestSeq.current += 1;
    const mine = requestSeq.current;
    try {
      const res = await getMyNotifications(30);
      // An older answer must never overwrite a newer one.
      if (!mounted.current || mine !== requestSeq.current) return;
      setList({ status: 'ready', available: res.available, unread: res.unreadCount, rows: res.rows, error: '' });
    } catch (err) {
      if (!mounted.current || mine !== requestSeq.current) return;
      setList((previous) => ({ ...previous, status: previous.status === 'ready' ? 'ready' : 'error', error: err?.message || t('notifications.error') }));
    }
  }, [t]);

  const loadPrefs = useCallback(async () => {
    try {
      const res = await getAlertPreferences();
      if (mounted.current) setPrefs(res);
    } catch (err) {
      if (mounted.current) setPrefsError(err?.message || t('notifications.email_pref.error'));
    }
  }, [t]);

  // Poll, and refresh when the tab comes back.
  useEffect(() => {
    mounted.current = true;
    refresh();
    const timer = setInterval(refresh, NOTIFICATION_POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      mounted.current = false;
      clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Opening: fresh data, the preference (once), and the ways to close.
  useEffect(() => {
    if (!open) return undefined;
    refresh();
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onMouseDown = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('mousedown', onMouseDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('mousedown', onMouseDown);
    };
  }, [open, refresh]);

  useEffect(() => {
    if (open && prefs === null) loadPrefs();
  }, [open, prefs, loadPrefs]);

  const openItem = (row) => {
    if (!row.read) {
      // Optimistic; if the server refuses, the next refresh brings the truth back.
      setList((previous) => ({
        ...previous,
        unread: Math.max(0, previous.unread - 1),
        rows: previous.rows.map((r) => (r.id === row.id ? { ...r, read: true } : r)),
      }));
      markNotificationsRead({ ids: [row.id] }).catch(() => refresh());
    }
    // The day comes from the server; only a plain date is ever put in the URL.
    if (ISO_DAY.test(row.date_ref)) {
      setOpen(false);
      navigate(`/reports?tab=users&presenceDate=${row.date_ref}`);
    }
  };

  const markAllRead = () => {
    setList((previous) => ({ ...previous, unread: 0, rows: previous.rows.map((r) => ({ ...r, read: true })) }));
    markNotificationsRead({ all: true }).catch(() => refresh());
  };

  const toggleEmail = async (checked) => {
    if (!prefs || prefsBusy) return;
    const previous = prefs;
    setPrefsBusy(true);
    setPrefsError('');
    setPrefs({ ...prefs, emailEnabled: checked });
    try {
      const saved = await saveAlertPreferences({ emailEnabled: checked });
      if (mounted.current) setPrefs(saved);
    } catch (err) {
      if (mounted.current) {
        setPrefs(previous);
        setPrefsError(err?.message || t('notifications.email_pref.error'));
      }
    } finally {
      if (mounted.current) setPrefsBusy(false);
    }
  };

  const unread = list.unread;
  const badge = unread > 99 ? '99+' : String(unread);
  const buttonLabel = unread > 0 ? t('notifications.bell_aria_unread', { count: unread }) : t('notifications.bell_aria');

  const renderRow = (row) => {
    const late = Array.isArray(row.late) ? row.late : [];
    const day = formatDay(row.date_ref, i18n.language);
    const title = row.type === 'late_arrivals'
      ? t('notifications.late_arrivals.title', { count: late.length, date: day })
      : t('notifications.generic_title', { date: day });
    const names = late.slice(0, MAX_NAMES).map((person) => person.label).filter(Boolean).join(', ');
    const more = late.length - MAX_NAMES;
    return (
      <li key={row.id} className="tw-border-b tw-border-slate-100 dark:tw-border-slate-800 last:tw-border-b-0">
        <button
          type="button"
          onClick={() => openItem(row)}
          data-read={row.read ? 'true' : 'false'}
          className={`tw-flex tw-w-full tw-items-start tw-gap-2 tw-px-4 tw-py-3 tw-text-start hover:tw-bg-slate-50 dark:hover:tw-bg-slate-800 ${row.read ? '' : 'tw-bg-sky-50/60 dark:tw-bg-sky-900/20'}`}
        >
          <span aria-hidden="true" className={`tw-mt-1.5 tw-h-2 tw-w-2 tw-shrink-0 tw-rounded-full ${row.read ? 'tw-bg-transparent' : 'tw-bg-sky-500'}`} />
          <span className="tw-min-w-0 tw-flex-1">
            {!row.read && <span className="tw-sr-only">{t('notifications.unread')}. </span>}
            <span className={`tw-block tw-text-sm ${row.read ? 'tw-text-slate-700 dark:tw-text-slate-300' : 'tw-font-semibold tw-text-slate-900 dark:tw-text-slate-100'}`}>{title}</span>
            {row.type === 'late_arrivals' && names !== '' && (
              <span className="tw-block tw-break-words tw-text-xs tw-text-slate-600 dark:tw-text-slate-400">
                {names}{more > 0 ? ` ${t('notifications.late_arrivals.more', { count: more })}` : ''}
              </span>
            )}
            {row.type === 'late_arrivals' && row.cutoff && (
              <span className="tw-block tw-text-xs tw-text-slate-500 dark:tw-text-slate-500">{t('notifications.late_arrivals.cutoff', { time: row.cutoff })}</span>
            )}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div ref={rootRef} className="tw-relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={buttonLabel}
        className="tw-relative tw-rounded tw-p-1.5 tw-text-lg tw-leading-none tw-text-[#78909c] hover:tw-bg-slate-100 dark:tw-text-[#94a3b8] dark:hover:tw-bg-slate-800"
      >
        <span aria-hidden="true">🔔</span>
        {unread > 0 && (
          <span aria-hidden="true" data-testid="notification-badge" className="tw-absolute -tw-end-1 -tw-top-1 tw-min-w-[18px] tw-rounded-full tw-bg-rose-600 tw-px-1 tw-text-center tw-text-[11px] tw-font-semibold tw-leading-[18px] tw-text-white">{badge}</span>
        )}
      </button>

      {open && (
        <div role="dialog" aria-label={t('notifications.title')} className="tw-absolute tw-end-0 tw-z-50 tw-mt-2 tw-w-[340px] tw-max-w-[92vw] tw-rounded-lg tw-border tw-border-slate-200 dark:tw-border-slate-700 tw-bg-white dark:tw-bg-slate-900 tw-text-slate-800 dark:tw-text-slate-100 tw-shadow-xl">
          <div className="tw-flex tw-items-center tw-justify-between tw-border-b tw-border-slate-200 dark:tw-border-slate-700 tw-px-4 tw-py-2">
            <h2 className="tw-text-sm tw-font-semibold">{t('notifications.title')}</h2>
            <button type="button" onClick={markAllRead} disabled={unread === 0} className="tw-text-xs tw-text-[#4A7690] hover:tw-underline disabled:tw-cursor-not-allowed disabled:tw-opacity-40 dark:tw-text-[#6ea0ba]">
              {t('notifications.mark_all_read')}
            </button>
          </div>

          <div className="tw-max-h-[360px] tw-overflow-y-auto">
            {list.status === 'loading' && <p className="tw-px-4 tw-py-3 tw-text-sm tw-text-slate-500">{t('notifications.loading')}</p>}
            {list.status === 'error' && (
              <div className="tw-px-4 tw-py-3">
                <p role="alert" className="tw-text-sm tw-text-rose-600 dark:tw-text-rose-400">{t('notifications.error')}</p>
                <button type="button" onClick={refresh} className="tw-mt-1 tw-text-xs tw-text-[#4A7690] hover:tw-underline dark:tw-text-[#6ea0ba]">{t('notifications.retry')}</button>
              </div>
            )}
            {list.status === 'ready' && !list.available && <p className="tw-px-4 tw-py-3 tw-text-sm tw-text-amber-700 dark:tw-text-amber-300">{t('notifications.unavailable')}</p>}
            {list.status === 'ready' && list.available && list.rows.length === 0 && <p className="tw-px-4 tw-py-3 tw-text-sm tw-text-slate-500">{t('notifications.empty')}</p>}
            {list.status === 'ready' && list.available && list.rows.length > 0 && <ul>{list.rows.map(renderRow)}</ul>}
            {list.status === 'ready' && list.error && <p role="alert" className="tw-px-4 tw-pb-2 tw-text-xs tw-text-rose-600 dark:tw-text-rose-400">{t('notifications.error')}</p>}
          </div>

          <div className="tw-border-t tw-border-slate-200 dark:tw-border-slate-700 tw-px-4 tw-py-3 tw-text-xs">
            {prefs && (
              <>
                <label className="tw-flex tw-items-start tw-gap-2">
                  <input
                    type="checkbox"
                    checked={prefs.emailEnabled}
                    disabled={prefsBusy || !prefs.hasEmail}
                    onChange={(event) => toggleEmail(event.target.checked)}
                    className="tw-mt-0.5"
                  />
                  <span>{t('notifications.email_pref.label')}</span>
                </label>
                {prefs.hasEmail && prefs.email && <p className="tw-mt-1 tw-break-all tw-text-slate-500 dark:tw-text-slate-400">{t('notifications.email_pref.address', { email: prefs.email })}</p>}
                {!prefs.hasEmail && <p className="tw-mt-1 tw-text-slate-600 dark:tw-text-slate-400">{t('notifications.email_pref.no_address')}</p>}
                {!prefs.alertsEnabled && <p className="tw-mt-1 tw-text-amber-700 dark:tw-text-amber-300">{t('notifications.email_pref.alerts_off')}</p>}
                {!prefs.mailEnabled && <p className="tw-mt-1 tw-text-amber-700 dark:tw-text-amber-300">{t('notifications.email_pref.mail_off')}</p>}
              </>
            )}
            {prefsError && <p role="alert" className="tw-mt-1 tw-text-rose-600 dark:tw-text-rose-400">{prefsError}</p>}
          </div>
        </div>
      )}
    </div>
  );
}
