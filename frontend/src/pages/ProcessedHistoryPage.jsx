import { useEffect, useState } from 'react';
import {
  exportProcessedHistory,
  getProcessedHistory,
  getProjects,
  hardDeleteTimeEntry,
  hardDeleteTimeEntries,
} from '../api/timeflowApi';
import StatusBadge from '../components/atoms/StatusBadge';
import { formatDuration } from '../utils/FormatDuration.js';

const initialFilters = {
  status: 'all',
  employee_id: '',
  project_id: '',
  date_from: '',
  date_to: '',
  manual_only: false,
};

const dateTime = (value) => (value ? String(value).replace('T', ' ').slice(0, 16) : '—');

export default function ProcessedHistoryPage() {
  const canReadAll = typeof window !== 'undefined' && window.TIMEFLOW_CAN_READALL === true;
  const [filters, setFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState({ rows: [], pagination: {}, stats: {} });
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState([]);
  const [deleteRequest, setDeleteRequest] = useState(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const refreshHistory = async () => {
    const next = await getProcessedHistory({ ...filters, page, per_page: 50 });
    setData(next);
    setSelectedIds([]);
  };

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');

    getProcessedHistory({ ...filters, page, per_page: 50 })
      .then((next) => {
        if (active) setData(next);
      })
      .catch((err) => {
        if (active) setError(err.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [filters, page]);

  const update = (key, value) => {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  };

  const grouped = data.rows.reduce((all, entry) => {
    const key = String(entry.date_start || '').slice(0, 10);
    (all[key] ||= []).push(entry);
    return all;
  }, {});

  const toggleSelected = (id) => {
    setSelectedIds((current) => {
      const numericId = Number(id);
      return current.includes(numericId)
        ? current.filter((currentId) => Number(currentId) !== numericId)
        : [...current, numericId];
    });
  };

  const selectAllForGroup = (rows, checked) => {
    const rowIds = rows.map((row) => Number(row.id));
    setSelectedIds((current) => {
      if (checked) {
        return Array.from(new Set([...current, ...rowIds]));
      }
      return current.filter((id) => !rowIds.includes(Number(id)));
    });
  };

  const csv = async () => {
    const rows = await exportProcessedHistory(filters);
    const header = ['Tâche', 'Projet', 'Qui', 'Début', 'Fin', 'État', 'Durée', 'Modification', 'Traité par', 'Traité le'];
    const lines = [
      header,
      ...rows.map((entry) => [
        entry.note,
        entry.project_label,
        entry.user_label,
        dateTime(entry.date_start),
        dateTime(entry.date_end),
        Number(entry.status) === 2 ? 'Validé' : 'Refusé',
        formatDuration(entry.duration),
        entry.manual_modified ? 'Modifié manuellement' : '',
        entry.processed_by_label,
        dateTime(entry.processed_at),
      ]),
    ];

    const csvContent = `\uFEFF${lines
      .map((line) => line.map((value) => `"${String(value ?? '').replaceAll('"', '""')}"`).join(';'))
      .join('\n')}`;

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'timeflow-historique-traite.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  const submitHardDelete = async () => {
    if (!deleteRequest) return;

    const { type, ids } = deleteRequest;

    try {
      if (type === 'single') {
        await hardDeleteTimeEntry(ids[0]);
      } else {
        await hardDeleteTimeEntries(ids);
      }
      setDeleteRequest(null);
      await refreshHistory();
    } catch (err) {
      setError(err.message);
      setDeleteRequest(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-[1680px] space-y-6 px-5 py-7">
      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[.24em] text-slate-500">Gérer</p>
            <h1 className="text-2xl font-semibold">Historique traité</h1>
          </div>
          <button type="button" onClick={csv} className="rounded bg-[#03a9f4] px-4 py-2 text-white">
            Exporter en CSV
          </button>
        </div>

        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          <select aria-label="Statut" value={filters.status} onChange={(event) => update('status', event.target.value)} className="rounded border p-2">
            <option value="all">Validé et refusé</option>
            <option value="validated">Validé</option>
            <option value="refused">Refusé</option>
          </select>

          <select aria-label="Employé" value={filters.employee_id} onChange={(event) => update('employee_id', event.target.value)} className="rounded border p-2">
            <option value="">Tous les employés</option>
            {data.employees?.map((user) => (
              <option key={user.id} value={user.id}>{user.label}</option>
            ))}
          </select>

          <select value={filters.project_id} onChange={(event) => update('project_id', event.target.value)} className="rounded border p-2">
            <option value="">Tous les projets</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>{project.title}</option>
            ))}
          </select>

          <input aria-label="Date début" type="date" value={filters.date_from} onChange={(event) => update('date_from', event.target.value)} className="rounded border p-2" />
          <input aria-label="Date fin" type="date" value={filters.date_to} onChange={(event) => update('date_to', event.target.value)} className="rounded border p-2" />

          <label className="flex items-center gap-2">
            <input type="checkbox" checked={filters.manual_only} onChange={(event) => update('manual_only', event.target.checked)} />
            Modifiées uniquement
          </label>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <div className="rounded bg-white p-4">
          Heures validées <strong>{formatDuration(data.stats.validated_seconds)}</strong>
        </div>
        <div className="rounded bg-white p-4">
          Entrées refusées <strong>{data.stats.refused_count || 0}</strong>
        </div>
        <div className="rounded bg-white p-4">
          Modifiées <strong>{data.stats.manual_count || 0}</strong>
        </div>
      </section>

      {error && <p className="text-red-600">{error}</p>}
      {loading && <p>Chargement…</p>}

      {!loading && Object.entries(grouped).map(([day, rows]) => (
        <section key={day} className="overflow-x-auto bg-white">
          <div className="flex justify-between bg-slate-100 p-3">
            <strong>{day}</strong>
            <span>Total : {formatDuration(rows.reduce((sum, row) => sum + Number(row.duration || 0), 0))}</span>
          </div>

          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {canReadAll && (
                  <th className="w-10 px-2 py-2 text-center">
                    <input
                      aria-label="Tout sélectionner"
                      type="checkbox"
                      checked={rows.every((row) => selectedIds.includes(Number(row.id)))}
                      onChange={(event) => selectAllForGroup(rows, event.target.checked)}
                    />
                  </th>
                )}
                <th className="px-2 py-2">Tâche</th>
                <th className="px-2 py-2">Projet</th>
                <th className="px-2 py-2">Qui</th>
                <th className="px-2 py-2">Début</th>
                <th className="px-2 py-2">Fin</th>
                <th className="px-2 py-2">État</th>
                <th className="px-2 py-2">Durée</th>
                <th className="px-2 py-2">Modification</th>
                <th className="px-2 py-2">Traité par / le</th>
                {canReadAll && <th className="px-2 py-2 text-right">Actions</th>}
              </tr>
            </thead>

            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id} className="border-t">
                  {canReadAll && (
                    <td className="px-2 py-2 text-center">
                      <input
                        aria-label="Sélectionner cette entrée"
                        type="checkbox"
                        checked={selectedIds.includes(Number(entry.id))}
                        onChange={() => toggleSelected(entry.id)}
                      />
                    </td>
                  )}
                  <td className="px-2 py-2">{entry.note || 'Sans description'}</td>
                  <td className="px-2 py-2">{entry.project_label}</td>
                  <td className="px-2 py-2">{entry.user_label}</td>
                  <td className="px-2 py-2">{dateTime(entry.date_start)}</td>
                  <td className="px-2 py-2">{dateTime(entry.date_end)}</td>
                  <td className="px-2 py-2"><StatusBadge status={Number(entry.status)} /></td>
                  <td className="px-2 py-2">{formatDuration(entry.duration)}</td>
                  <td className="px-2 py-2">{entry.manual_modified ? 'Modifié manuellement' : '—'}</td>
                  <td className="px-2 py-2">
                    {entry.processed_by_label || '—'}
                    <br />
                    {dateTime(entry.processed_at)}
                  </td>
                  {canReadAll && (
                    <td className="px-2 py-2 text-right">
                      <button
                        type="button"
                        aria-label="Supprimer cette entrée"
                        onClick={() => setDeleteRequest({ type: 'single', ids: [Number(entry.id)] })}
                        className="rounded bg-[#d64c4c] px-2 py-1 text-xs font-medium text-white"
                      >
                        Supprimer
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {!loading && !data.rows.length && <p className="rounded bg-white p-5">Aucune entrée traitée.</p>}

      <div className="flex justify-between">
        <button type="button" disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>
          Précédent
        </button>
        <span>Page {data.pagination.page || 1} / {data.pagination.pages || 1}</span>
        <button type="button" disabled={page >= (data.pagination.pages || 1)} onClick={() => setPage((current) => current + 1)}>
          Suivant
        </button>
      </div>

      {deleteRequest && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="delete-history-title">
          <div className="w-full max-w-lg rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 id="delete-history-title" className="text-lg font-semibold text-[#263746]">Suppression définitive</h2>
                <p className="mt-1 text-sm text-[#52656f]">Cette action est irréversible.</p>
              </div>
              <button
                type="button"
                onClick={() => setDeleteRequest(null)}
                aria-label="Fermer"
                className="text-lg leading-none text-[#78909c] hover:text-[#2c3e49]"
              >
                ×
              </button>
            </div>

            <p className="mt-4 text-sm text-[#52656f]">
              {deleteRequest.type === 'single'
                ? 'Supprimer définitivement cette entrée de temps ? Cette action est irréversible et supprimera la donnée de la base.'
                : `Supprimer définitivement ${deleteRequest.ids.length} entrée(s) sélectionnée(s) ? Cette action est irréversible et effacera les données de la base.`}
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button type="button" onClick={() => setDeleteRequest(null)} className="text-sm text-[#52656f]">
                Annuler
              </button>
              <button type="button" onClick={submitHardDelete} className="rounded bg-[#d64c4c] px-4 py-2 text-sm font-medium text-white">
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
