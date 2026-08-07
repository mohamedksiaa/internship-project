import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { path: '/timer', label: 'SUIVI DU TEMPS', icon: '◷', section: 'SUIVRE' },
  { path: '/history', label: 'CALENDRIER', icon: '□', section: 'SUIVRE' },
  { path: '/dashboard', label: 'TABLEAU DE BORD', icon: '⊞', section: 'ANALYSER' },
  { path: '/reports', label: 'RAPPORTS', icon: '▥', section: 'ANALYSER' },
  { path: '/validation', label: 'VALIDATIONS', icon: '✓', section: 'GÉRER' },
];

function classNames(...classes) { return classes.filter(Boolean).join(' '); }

export default function AppLayout() {
  const canReadAll = typeof window !== 'undefined' && window.CLOCKIFY_CAN_READALL === true;
  const canValidate = typeof window !== 'undefined' && window.CLOCKIFY_CAN_VALIDATE === true;
  const visibleNavigation = navigation.filter((item) => (canReadAll || item.path === '/validation' ? true : false) || (item.path !== '/reports' && item.path !== '/validation'));
  const visibleNavigationFiltered = navigation.filter((item) => {
    if (item.path === '/reports') {
      return canReadAll;
    }
    if (item.path === '/validation') {
      return canValidate;
    }
    return true;
  });
  let displayedSection = '';

  return (
    <div className="min-h-screen bg-[#f2f6f8] text-[#1f2933]">
      <header className="flex h-[60px] items-center border-b border-[#dce5ea] bg-white px-5 shadow-sm">
        <div className="flex items-center gap-3 border-r border-[#dce5ea] pr-6">
          <span className="grid h-8 w-8 place-items-center text-xl text-[#253746]">⠿</span>
          <span className="grid h-8 w-8 place-items-center rounded-md bg-[#03a9f4] text-xl font-bold text-white">◷</span>
          <span className="text-[23px] font-semibold tracking-tight text-[#111827]">clockify</span>
        </div>
        <div className="ml-6 hidden items-center gap-4 text-sm text-[#455a64] sm:flex">
          <span>Mon espace de travail</span><span className="text-[#9aaab5]">•••</span>
          <span className="border border-[#03a9f4] bg-[#03a9f4] px-3 py-1.5 text-xs font-medium text-white">METTRE À NIVEAU</span>
        </div>
        <div className="ml-auto flex items-center gap-5 text-[#78909c]">
          <span className="hidden text-lg sm:block">♧</span><span className="hidden text-lg sm:block">♧</span><span className="text-lg">?</span>
          <span className="grid h-8 w-8 place-items-center rounded-md bg-[#4d5fca] text-xs font-medium text-white">AD</span>
        </div>
      </header>

      <div className="flex min-h-[calc(100vh-60px)]">
        <aside className="w-[220px] shrink-0 border-r border-[#dce5ea] bg-white py-2">
          <nav>
            {visibleNavigationFiltered.map((item, index) => {
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
