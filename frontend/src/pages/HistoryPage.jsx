import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import FullCalendar from '@fullcalendar/react';
import enLocale from '@fullcalendar/core/locales/en-gb';
import frLocale from '@fullcalendar/core/locales/fr';
import deLocale from '@fullcalendar/core/locales/de';
import arLocale from '@fullcalendar/core/locales/ar';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import { getWeeklyTimesheet } from '../api/timeflowApi';

function formatTime(date, locale) {
  return date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false });
}

const ZOOM_LEVELS = ['01:00:00', '00:30:00', '00:15:00', '00:05:00'];

const PROJECT_COLORS = [
  { bg: '#e8f5fd', border: '#5B8FA8', text: '#01579b' },
  { bg: '#f3e8fd', border: '#9c27b0', text: '#4a148c' },
  { bg: '#e8fdf0', border: '#35a66f', text: '#1b5e20' },
  { bg: '#fdf3e8', border: '#f59e0b', text: '#b45309' },
  { bg: '#fde8e8', border: '#ef4444', text: '#991b1b' },
  { bg: '#e8f0fd', border: '#4d5fca', text: '#1e3a8a' },
];

function getProjectColor(projectId) {
  const idx = Number(projectId) % PROJECT_COLORS.length;
  return PROJECT_COLORS[idx >= 0 ? idx : 0];
}

export default function HistoryPage() {
  const { t, i18n } = useTranslation();
  const calendarRef = useRef(null);
  const [requestedWeekStart, setRequestedWeekStart] = useState('');
  const [weekData, setWeekData] = useState({ weekStart: '', weekEnd: '', rows: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewType, setViewType] = useState('timeGridWeek');
  const [slotDuration, setSlotDuration] = useState('00:30:00');

  const appLocale = useMemo(() => {
    switch (i18n.language) {
      case 'fr':
        return 'fr-FR';
      case 'de':
        return 'de-DE';
      case 'ar':
        return 'ar-EG';
      case 'en':
      default:
        return 'en-US';
    }
  }, [i18n.language]);

  const calendarLocale = useMemo(() => {
    switch (i18n.language) {
      case 'fr':
        return frLocale;
      case 'de':
        return deLocale;
      case 'ar':
        return arLocale;
      case 'en':
      default:
        return enLocale;
    }
  }, [i18n.language]);

  const loadEntries = async (dateStr) => {
    setLoading(true);
    try {
      const data = await getWeeklyTimesheet(dateStr);
      setWeekData(data || { weekStart: '', weekEnd: '', rows: [] });
      setError('');
    } catch (err) {
      setError(err.message);
      setWeekData({ weekStart: '', weekEnd: '', rows: [] });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEntries(requestedWeekStart);
  }, [requestedWeekStart]);

  const events = useMemo(() => {
    return (weekData.rows || []).map((entry) => {
      const start = new Date(entry.date_start);
      let end;
      if (entry.date_end) {
        end = new Date(entry.date_end);
      } else if (entry.duration && Number(entry.duration) > 0) {
        end = new Date(start.getTime() + Number(entry.duration) * 1000);
      } else {
        end = new Date();
      }

      const project = entry.project_label || t('dashboard.no_project');
      const task = entry.task_label ? ` / ${entry.task_label}` : '';
      const note = entry.note ? ` — ${entry.note}` : '';
      const title = `${project}${task}${note}`;

      const colors = getProjectColor(entry.fk_project || 0);

      return {
        id: String(entry.id),
        title,
        start: start.toISOString(),
        end: end.toISOString(),
        extendedProps: {
          duration: entry.duration,
          billable: entry.billable,
          status: entry.status,
          startTime: formatTime(start, appLocale),
          endTime: formatTime(end, appLocale),
          projectLabel: project,
        },
        backgroundColor: colors.bg,
        borderColor: colors.border,
        textColor: colors.text,
      };
    });
  }, [weekData.rows, appLocale, t]);

  const handlePrev = () => {
    const api = calendarRef.current.getApi();
    api.prev();
    syncWeekFromCalendar(api);
  };

  const handleNext = () => {
    const api = calendarRef.current.getApi();
    api.next();
    syncWeekFromCalendar(api);
  };

  const handleToday = () => {
    const api = calendarRef.current.getApi();
    api.today();
    syncWeekFromCalendar(api);
  };

  const syncWeekFromCalendar = (api) => {
    const view = api.view;
    const start = view.activeStart;
    const day = start.getDay();
    const diff = start.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(start);
    monday.setDate(diff);
    setRequestedWeekStart(monday.toISOString().slice(0, 10));
  };

  const toggleView = (type) => {
    setViewType(type);
    calendarRef.current.getApi().changeView(type);
  };

  const zoomIn = () => {
    const idx = ZOOM_LEVELS.indexOf(slotDuration);
    if (idx < ZOOM_LEVELS.length - 1) {
      setSlotDuration(ZOOM_LEVELS[idx + 1]);
    }
  };

  const zoomOut = () => {
    const idx = ZOOM_LEVELS.indexOf(slotDuration);
    if (idx > 0) {
      setSlotDuration(ZOOM_LEVELS[idx - 1]);
    }
  };

  const weekLabel = useMemo(() => {
    if (!weekData.weekStart) return '';
    const start = new Date(`${weekData.weekStart}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString(appLocale, { day: 'numeric', month: 'short' });
    return `${fmt(start)} - ${fmt(end)}`;
  }, [weekData.weekStart, appLocale]);

  return (
    <div className="flex h-full flex-col space-y-4">
      <div className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">{t('history.calendar')}</p>
            <h2 className="text-2xl font-semibold text-slate-900">
              {viewType === 'timeGridDay' ? t('history.daily_planning') : t('history.weekly_planning')}
            </h2>
            {weekLabel && (
              <p className="mt-1 text-sm text-slate-500">{weekLabel}</p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="mr-4 flex rounded-lg border border-slate-200 p-1">
              <button
                onClick={() => toggleView('timeGridWeek')}
                className={`rounded-md px-3 py-1 text-sm ${viewType === 'timeGridWeek' ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {t('history.view_week')}
              </button>
              <button
                onClick={() => toggleView('timeGridDay')}
                className={`rounded-md px-3 py-1 text-sm ${viewType === 'timeGridDay' ? 'bg-slate-100 font-medium text-slate-900' : 'text-slate-500 hover:bg-slate-50'}`}
              >
                {t('history.view_day')}
              </button>
            </div>

            <div className="flex items-center gap-1">
              <button onClick={handlePrev} className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 19l-7-7 7-7" /></svg>
              </button>
              <button onClick={handleToday} className="rounded-lg border border-slate-200 px-4 py-1 text-sm font-medium text-slate-700 hover:bg-slate-50">
                {t('history.today')}
              </button>
              <button onClick={handleNext} className="rounded-full border border-slate-200 p-2 text-slate-600 hover:bg-slate-50">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
              </button>
            </div>

            <div className="ml-4 flex items-center gap-1 border-l border-slate-200 pl-4">
              <button onClick={zoomOut} title={t('history.zoom_out')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">−</button>
              <button onClick={zoomIn} title={t('history.zoom_in')} className="flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50">+</button>
            </div>
          </div>
        </div>

        {error && <div className="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-600">{error}</div>}

        <div className="calendar-container relative mt-4 min-h-[600px] flex-1 overflow-hidden rounded-xl border border-slate-100">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-white/50 backdrop-blur-[1px]">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
            </div>
          )}

          <FullCalendar
            ref={calendarRef}
            plugins={[timeGridPlugin, interactionPlugin]}
            initialView={viewType}
            headerToolbar={false}
            events={events}
            slotDuration={slotDuration}
            allDaySlot={false}
            nowIndicator={true}
            firstDay={1}
            locale={calendarLocale}
            height="auto"
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            slotLabelFormat={{
              hour: '2-digit',
              minute: '2-digit',
              meridiem: false,
              hour12: false
            }}
            eventTimeFormat={{
              hour: '2-digit',
              minute: '2-digit',
              meridiem: false,
              hour12: false
            }}
            eventContent={(arg) => {
              const { event } = arg;
              const startTime = event.extendedProps.startTime;
              const endTime = event.extendedProps.endTime;
              const isSmall = event.height < 40;

              return (
                <div className="flex h-full flex-col overflow-hidden px-1.5 py-0.5 text-[11px] leading-tight">
                  <div className="font-semibold truncate">{event.title}</div>
                  {!isSmall && startTime && endTime && (
                    <div className="opacity-80">{startTime} - {endTime}</div>
                  )}
                </div>
              );
            }}
            className="timeflow-calendar"
          />
        </div>
      </div>

      <style dangerouslySetInnerHTML={{ __html: `
        .fc {
          --fc-border-color: #f1f5f9;
          --fc-today-bg-color: #f8fafc;
          --fc-now-indicator-line-color: #ef4444;
          --fc-event-text-color: inherit;
          font-family: inherit;
          font-size: 13px;
        }
        .fc .fc-timegrid-slot {
          height: 3em;
          border-bottom: 0;
        }
        .fc .fc-timegrid-col.fc-day-today {
          background-color: rgba(3, 169, 244, 0.03);
        }
        .fc .fc-v-event {
          border-radius: 6px;
          border: none !important;
          border-left: 3px solid !important;
          box-shadow: 0 1px 2px rgba(0,0,0,0.06);
          transition: transform 0.1s, box-shadow 0.1s;
          padding: 2px 6px;
          min-height: 20px;
        }
        .fc .fc-v-event:hover {
          transform: translateY(-1px);
          box-shadow: 0 4px 6px rgba(0,0,0,0.08);
          z-index: 5;
        }
        .fc-timegrid-axis-cushion, .fc-timegrid-slot-label-cushion {
          font-size: 11px;
          color: #94a3b8;
          text-transform: uppercase;
          font-weight: 500;
        }
        .fc-col-header-cell-cushion {
          padding: 12px 0 !important;
          font-size: 13px;
          font-weight: 600;
          color: #475569;
          text-decoration: none !important;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .fc .fc-scrollgrid {
          border-radius: 12px;
          overflow: hidden;
        }
        .fc .fc-scrollgrid td, .fc .fc-scrollgrid th {
          border-color: #f1f5f9;
        }
        .fc .fc-timegrid-axis-frame {
          border-right: 1px solid #f1f5f9;
        }
        .fc .fc-timegrid-divider {
          border-top: 1px solid #f8fafc;
        }
        .fc .fc-now-indicator-line {
          border-width: 2px;
        }
        .fc .fc-event {
          cursor: pointer;
        }
      `}} />
    </div>
  );
}
