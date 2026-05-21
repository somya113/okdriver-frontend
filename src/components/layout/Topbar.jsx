import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Topbar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };
  return (
    <header className="topbar">
      <div className="topbar-logo">okDriver</div>
      <nav className="topbar-nav">
        <a href="#" className="topbar-item">
          <span style={{ fontSize: '18px' }}>⇄</span> Dashboard
        </a>
        <a href="#" className="topbar-item active">
          <span style={{ fontSize: '18px' }}>🖥️</span> Monitor
        </a>
        <a href="#" className="topbar-item">
          <span style={{ fontSize: '18px' }}>📄</span> Report
        </a>
      </nav>
      
      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div onClick={handleLogout} style={{ display: 'flex', alignItems: 'center', gap: '10px', background: '#1e293b', padding: '6px 16px', borderRadius: '24px', cursor: 'pointer', transition: 'background 0.2s' }} title="Click to Logout">
          <div style={{ width: '26px', height: '26px', background: '#3b82f6', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 'bold' }}>{user?.name?.[0]?.toUpperCase() || 'D'}</div>
          <span style={{ fontSize: '14px', fontWeight: '500' }}>{user?.name || 'demo'} ⌄</span>
        </div>
      </div>
    </header>
  );
}
