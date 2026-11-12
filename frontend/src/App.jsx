import { useState } from 'react'
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './index.css'

import Login from './pages/Login'
import Signup from './pages/Signup'
import Dashboard from './pages/Dashboard'

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'))

  const handleLogin = (newToken) => {
    localStorage.setItem('token', newToken)
    setToken(newToken)
  }

  const handleLogout = () => {
    localStorage.removeItem('token')
    setToken(null)
  }

  return (
    <Router>
      <div className="app-wrapper">
        <Routes>
          {/* Public Routes */}
          <Route path="/login" element={!token ? <Login onLogin={handleLogin} /> : <Navigate to="/" />} />
          <Route path="/signup" element={!token ? <Signup onLogin={handleLogin} /> : <Navigate to="/" />} />
          
          {/* Protected Route */}
          <Route 
            path="/" 
            element={token ? <Dashboard onLogout={handleLogout} token={token} /> : <Navigate to="/login" />} 
          />
        </Routes>
      </div>
    </Router>
  )
}

export default App
