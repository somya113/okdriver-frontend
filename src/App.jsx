import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Topbar from './components/layout/Topbar';
import HistoryMonitor from './pages/HistoryMonitor';
import Login from './pages/Login';

function DashboardLayout() {
  return (
    <div className="app-shell">
      <Topbar />
      <div className="main-area">
        <main className="content-area" style={{ width: '100%' }}>
          <HistoryMonitor />
        </main>
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route 
            path="/*" 
            element={
              <ProtectedRoute>
                <DashboardLayout />
              </ProtectedRoute>
            } 
          />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

export default App;
