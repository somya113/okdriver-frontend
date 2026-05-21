import React from 'react';

export default function Sidebar() {
  return (
    <aside className="sidebar">
      <a href="#" className="sidebar-item">
        <span className="sidebar-icon">🚐</span>
        Vehicles
      </a>
      <a href="#" className="sidebar-item">
        <span className="sidebar-icon">🔔</span>
        Alerts
      </a>
      <a href="#" className="sidebar-item">
        <span className="sidebar-icon">🗺️</span>
        Tracks
      </a>
      <a href="#" className="sidebar-item">
        <span className="sidebar-icon">💡</span>
        Event
      </a>
      <a href="#" className="sidebar-item active">
        <span className="sidebar-icon">🕒</span>
        History
      </a>
      <a href="#" className="sidebar-item" style={{ marginBottom: 'auto' }}>
        <span className="sidebar-icon">📍</span>
        Live
      </a>
    </aside>
  );
}
