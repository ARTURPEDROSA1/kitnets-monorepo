import { useState, useEffect } from 'react'
import Dashboard from './components/Dashboard'
import Config from './components/Config'
import History from './components/History'
import DataTable from './components/DataTable'
import './App.css'

function App() {
  const [tab, setTab] = useState('dashboard')
  const [currentBuildId, setCurrentBuildId] = useState<string | null>(null);

  useEffect(() => {
    const checkVersion = async () => {
      try {
        const res = await fetch('/api/health');
        if (res.ok) {
          const json = await res.json();
          // Initial set
          if (!currentBuildId) {
            setCurrentBuildId(json.build_id);
          } else if (json.build_id && json.build_id !== currentBuildId) {
            // Version changed, reload
            console.log("New version detected, refreshing...");
            window.location.reload();
          }
        }
      } catch (e) {
        // Ignore errors (offline/restarting)
      }
    };

    const interval = setInterval(checkVersion, 5000);
    checkVersion(); // Initial check
    return () => clearInterval(interval);
  }, [currentBuildId]);

  return (
    <div className="container">
      <header>
        <h1>Kitnets Smart Gateway</h1>
        <nav>
          <button onClick={() => setTab('dashboard')} disabled={tab === 'dashboard'}>Dashboard</button>
          <button onClick={() => setTab('history')} disabled={tab === 'history'}>History</button>
          <button onClick={() => setTab('data')} disabled={tab === 'data'}>Details</button>
          <button onClick={() => setTab('config')} disabled={tab === 'config'}>Configuration</button>
        </nav>
      </header>
      <main>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'config' && <Config />}
        {tab === 'history' && <History />}
        {tab === 'data' && <DataTable />}
      </main>
    </div>
  )
}
export default App
