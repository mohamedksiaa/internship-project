import { useEffect, useState } from 'react';
import TimeEntryList from '../components/organisms/TimeEntryList';
import { getTimeEntryUpdates, getValidationEntries } from '../api/timeflowApi';

export default function ValidationPage() {
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let isMounted = true;
    let marker = null;
    let polling = false;

    async function loadEntries() {
      try {
        const data = await getValidationEntries();
        if (isMounted) {
          setEntries(Array.isArray(data) ? data : []);
        }
      } catch (err) {
        if (isMounted) {
          setError(err.message);
          setEntries([]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    async function checkForUpdates() {
      if (polling || document.visibilityState !== 'visible') return;
      polling = true;
      try {
        const update = await getTimeEntryUpdates('validation', marker || '');
        if (!isMounted) return;
        if (marker === null) {
          marker = update.marker;
        } else if (update.changed) {
          marker = update.marker;
          setEntries(update.entries);
        }
      } catch {
        // A failed background check must not replace the currently displayed list.
      } finally {
        polling = false;
      }
    }

    async function initialize() {
      // Capture a marker on both sides of the first list request. Without
      // this, an entry created between loadEntries() and the first marker
      // check can become the baseline and remain invisible until another
      // change happens or the user navigates away and back.
      let markerBefore = null;
      try {
        markerBefore = (await getTimeEntryUpdates('validation')).marker;
      } catch {
        // The list remains usable even if the lightweight marker is temporary unavailable.
      }
      await loadEntries();
      try {
        const update = await getTimeEntryUpdates('validation', markerBefore || '');
        marker = update.marker;
        if (markerBefore !== null && update.changed) {
          setEntries(update.entries);
        }
      } catch {
        // The next interval will establish the marker and retry normally.
      }
    }

    initialize();
    const intervalId = window.setInterval(checkForUpdates, 15000);
    window.addEventListener('focus', checkForUpdates);
    document.addEventListener('visibilitychange', checkForUpdates);
    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
      window.removeEventListener('focus', checkForUpdates);
      document.removeEventListener('visibilitychange', checkForUpdates);
    };
  }, []);

  return (
    <div className="space-y-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Validation</p>
            <h2 className="text-2xl font-semibold text-slate-900">Valider les entrées</h2>
          </div>
          <span className="inline-flex rounded-full bg-slate-100 px-3 py-1 text-sm text-slate-700">{entries.length} entrées</span>
        </div>
        {loading && <p className="text-sm text-slate-600">Chargement…</p>}
        {error && <p className="text-sm text-rose-600">{error}</p>}
        {!loading && !error && <TimeEntryList entries={entries} setEntries={setEntries} showWorker showValidationActions />}
      </div>
    </div>
  );
}
