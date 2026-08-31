import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import timeflowLogo from '../../assets/timeflow-logo.png';
import LanguageSelector from '../molecules/LanguageSelector';
import useDarkMode from '../../hooks/useDarkMode';

function classNames(...classes) { return classes.filter(Boolean).join(' '); }

export default function AppLayout() {
  const { t } = useTranslation();
  // AppLayout wraps every route (see <Outlet/> below), so this is the one
  // guaranteed place to keep the "dark" class on #root in sync regardless
  // of which page is mounted — pages that don't need the boolean for their
  // own JS-computed colors still need the class kept current.
  useDarkMode();
  const navigation = [
    { path: '/timer', label: t('nav.track_time'), icon: '◷', section: t('app.section_follow') },
    { path: '/history', label: t('nav.calendar'), icon: '□', section: t('app.section_follow') },
    { path: '/daily-report', label: t('nav.daily_report'), icon: '✎', section: t('app.section_follow') },
    { path: '/dashboard', label: t('nav.dashboard'), icon: '⊞', section: t('app.section_analyze') },
    { path: '/reports', label: t('nav.reports'), icon: '▥', section: t('app.section_analyze') },
    { path: '/validation', label: t('nav.validations'), icon: '✓', section: t('app.section_manage') },
    { path: '/processed-history', label: t('nav.history'), icon: '◫', section: t('app.section_manage') },
  ];
  const canValidate = typeof window !== 'undefined' && window.TIMEFLOW_CAN_VALIDATE === true;
  const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;
  const visibleNavigation = navigation.filter((item) => {
    if (item.path === '/validation') return canValidate;
    if (item.path === '/reports') return canValidate;
    return true;
  });
  let displayedSection = '';

  return (
    <div className="tw-min-h-screen tw-bg-[#f2f6f8] dark:tw-bg-[#0b1220] tw-text-[#1f2933] dark:tw-text-[#e2e8f0]">
      <header className="tw-flex tw-h-[60px] tw-items-center tw-border-b tw-border-[#dce5ea] dark:tw-border-[#232d42] tw-bg-white dark:tw-bg-[#141b2d] tw-px-5 tw-shadow-sm dark:tw-shadow-none">
        <div className="tw-flex tw-items-center tw-gap-3 tw-w-[220px]">
          <img src={timeflowLogo} alt="TimeFlow" className="tw-h-8 tw-w-8 tw-object-contain" />
          <span className="tw-text-[23px] tw-font-semibold tw-tracking-tight tw-text-[#111827] dark:tw-text-[#f1f5f9]">{t('app.brand')}</span>
        </div>
        <div className="tw-ml-auto tw-flex tw-items-center tw-gap-5 tw-text-[#78909c] dark:tw-text-[#94a3b8]">
          <LanguageSelector />
          <span className="tw-hidden tw-text-lg sm:tw-block">♧</span><span className="tw-hidden tw-text-lg sm:tw-block">♧</span>
        </div>
      </header>

      <div className="tw-flex tw-min-h-[calc(100vh-60px)]">
        <aside className="tw-w-[220px] tw-shrink-0 tw-border-r tw-border-[#dce5ea] dark:tw-border-[#232d42] tw-bg-white dark:tw-bg-[#141b2d] tw-py-2">
          <nav>
            {visibleNavigation.map((item, index) => {
              const showSection = item.section !== displayedSection;
              displayedSection = item.section;
              return (
                <div key={item.path}>
                  {showSection && index > 0 && <p className="tw-px-5 tw-pb-2 tw-pt-6 tw-text-xs tw-tracking-wide tw-text-[#8b9aa5] dark:tw-text-[#5b6b84]">{item.section}</p>}
                  <NavLink key={item.path} to={item.path} className={({ isActive }) => classNames(
                    'tw-flex tw-items-center tw-gap-3 tw-border-l-[3px] tw-px-5 tw-py-3 tw-text-sm tw-font-medium tw-transition',
                    isActive
                      ? 'tw-border-[#5B8FA8] tw-bg-[#e8f4f9] dark:tw-bg-[#1c3a4d] tw-text-[#263746] dark:tw-text-[#e2e8f0]'
                      : 'tw-border-transparent tw-text-[#344955] dark:tw-text-[#94a3b8] hover:tw-bg-[#f5f8fa] dark:hover:tw-bg-[#1c2438]'
                  )}>
                    <span className="tw-w-4 tw-text-center tw-text-lg tw-font-normal tw-text-[#607d8b] dark:tw-text-[#8b98ab]">{item.icon}</span>{item.label}
                  </NavLink>
                </div>
              );
            })}
          </nav>
        </aside>
        <main className="tw-min-w-0 tw-flex-1"><Outlet /></main>
      </div>
    </div>
  );
}
