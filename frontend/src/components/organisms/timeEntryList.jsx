import { useState, useEffect } from 'react';
import { getTimeEntries } from '../../api/clockifyApi';
import StatusBadge from '../atoms/StatusBadge';
import TimeDisplay from '../atoms/TimeDisplay';

export default function TimeEntryList() {
  const [entries, setEntries] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    getTimeEntries()
      .then(setEntries)
      .catch((err) => setError(err.message));
  }, []);

  if (error) return <p className="text-red-600">{error}</p>;

  return (
    <div className="border rounded-lg shadow-sm">
      <h2 className="font-semibold text-lg p-4 border-b">Mes entrées</h2>
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="p-2 text-left">Date</th>
            <th className="p-2 text-left">Note</th>
            <th className="p-2 text-left">Durée</th>
            <th className="p-2 text-left">Statut</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t">
              <td className="p-2">{new Date(entry.date_start * 1000).toLocaleDateString()}</td>
              <td className="p-2">{entry.note}</td>
              <td className="p-2"><TimeDisplay seconds={entry.duration} /></td>
              <td className="p-2"><StatusBadge status={entry.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}