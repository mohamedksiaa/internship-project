import { useState, useEffect } from 'react';
import DashboardLayout from '../templates/DashboardLayout';
import TimerWidget from '../organisms/TimerWidget';
import TimeEntryList from '../organisms/TimeEntryList';

export default function TimeTrackerPage() {
  const [projects, setProjects] = useState([]);

  useEffect(() => {
    // À remplacer par un vrai appel API vers les projets Dolibarr natifs
    setProjects([
      { id: 1, title: 'Projet Alpha' },
      { id: 2, title: 'Projet Beta' },
    ]);
  }, []);

  return (
    <DashboardLayout
      timer={<TimerWidget projects={projects} />}
      entryList={<TimeEntryList />}
    />
  );
}