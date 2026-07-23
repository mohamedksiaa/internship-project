/**
 * Application principale Clockify
 */

import React from 'react';
import { TimerProvider } from './context/timerContext';
import TimeTrackerPage from './pages/timeTrackerPage';
import './App.css';

function App() {
  return (
    <TimerProvider>
      <div className="app">
        <header className="app__header">
          <h1>⏱️ Clockify - Time Tracking</h1>
        </header>
        
        <main className="app__main">
          <TimeTrackerPage />
        </main>
        
        <footer className="app__footer">
          <p>Module Clockify pour Dolibarr v22</p>
        </footer>
      </div>
    </TimerProvider>
  );
}

export default App;