import { NavLink, Outlet } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import timeflowLogo from '../../assets/timeflow-logo.png';
import LanguageSelector from '../molecules/LanguageSelector';

function classNames(...classes) { return classes.filter(Boolean).join(' '); }

export default function AppLayout() {
  const { t } = useTranslation();
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
    <div className="min-h-screen bg-[#f2f6f8] text-[#1f2933]">
      <header className="flex h-[60px] items-center border-b border-[#dce5ea] bg-white px-5 shadow-sm">
        <div className="flex items-center gap-3 border-r border-[#dce5ea] pr-6">
          <span className="grid h-8 w-8 place-items-center text-xl text-[#253746]">⠿</span>
          <img src={timeflowLogo} alt="TimeFlow" className="h-8 w-8 object-contain" />
          <span className="text-[23px] font-semibold tracking-tight text-[#111827]">{t('app.brand')}</span>
        </div>
        <div className="ml-6 hidden items-center gap-4 text-sm text-[#455a64] sm:flex">
          <span>{t('app.workspace')}</span><span className="text-[#9aaab5]">•••</span>
          <span className="border border-[#03a9f4] bg-[#03a9f4] px-3 py-1.5 text-xs font-medium text-white">{t('app.upgrade')}</span>
        </div>
        <div className="ml-auto flex items-center gap-5 text-[#78909c]">
          <LanguageSelector />
          <span className="hidden text-lg sm:block">♧</span><span className="hidden text-lg sm:block">♧</span>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-60px)]">
        <aside className="w-[220px] shrink-0 border-r border-[#dce5ea] bg-white py-2">
          <nav>
            {visibleNavigation.map((item, index) => {
              const showSection = item.section !== displayedSection;
              displayedSection = item.section;
              return (
                <div key={item.path}>
                  {showSection && index > 0 && <p className="px-5 pb-2 pt-6 text-xs tracking-wide text-[#8b9aa5]">{item.section}</p>}
                  <NavLink key={item.path} to={item.path} className={({ isActive }) => classNames(
                    'flex items-center gap-3 border-l-[3px] px-5 py-3 text-sm font-medium transition',
                    isActive ? 'border-[#03a9f4] bg-[#e8f4f9] text-[#263746]' : 'border-transparent text-[#344955] hover:bg-[#f5f8fa]'
                  )}>
                    <span className="w-4 text-center text-lg font-normal text-[#607d8b]">{item.icon}</span>{item.label}
                  </NavLink>
                </div>
              );
            })}
          </nav>
        </aside>
        <main className="min-w-0 flex-1"><Outlet /></main>
      </div>
    </div>
  );
}
