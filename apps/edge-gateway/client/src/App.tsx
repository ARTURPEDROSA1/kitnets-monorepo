import { useState } from 'react'
import Dashboard from './components/Dashboard'
import Config from './components/Config'
import History from './components/History'
import './App.css'

function App() {
  const [tab, setTab] = useState('dashboard')

  return (
    <div className="container">
      <header>
        <h1>Kitnets Smart Gateway</h1>
        <nav>
          <button onClick={() => setTab('dashboard')} disabled={tab === 'dashboard'}>Dashboard</button>
          <button onClick={() => setTab('history')} disabled={tab === 'history'}>History</button>
          <button onClick={() => setTab('config')} disabled={tab === 'config'}>Configuration</button>
        </nav>
      </header>
      <main>
        {tab === 'dashboard' && <Dashboard />}
        {tab === 'config' && <Config />}
        {tab === 'history' && <History />}
      </main>
    </div>
  )
}
export default App
