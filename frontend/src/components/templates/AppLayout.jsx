import { NavLink, Outlet } from 'react-router-dom';

const navigation = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/timer', label: 'Chrono' },
  { path: '/history', label: 'Historique' },
  { path: '/reports', label: 'Rapports' },
  { path: '/validation', label: 'Validation' },
];

function classNames(...classes) {
  return classes.filter(Boolean).join(' ');
}

export default function AppLayout() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Clockify SaaS</p>
            <h1 className="text-2xl font-semibold text-slate-900 sm:text-3xl">Gestion du temps moderne</h1>
          </div>
          <div className="hidden sm:flex items-center gap-3">
            <span className="text-sm text-slate-500">Module Dolibarr</span>
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-700">Actif</span>
          </div>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col lg:flex-row gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <aside className="w-full lg:w-72 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="mb-5 text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Navigation</p>
          <nav className="space-y-2">
            {navigation.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                className={({ isActive }) =>
                  classNames(
                    'block rounded-2xl px-4 py-3 text-sm font-medium transition',
                    isActive ? 'bg-slate-900 text-white shadow' : 'text-slate-700 hover:bg-slate-100'
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="mt-8 rounded-3xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-900">Astuce</p>
            <p className="mt-2">Utilisez le tableau de bord pour suivre vos validations, rapports et sessions en un seul endroit.</p>
          </div>
        </aside>

        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
