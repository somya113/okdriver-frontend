import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (login(email, password)) {
      navigate('/');
    } else {
      setError('Invalid email or password');
    }
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f8fafc' }}>
      <div style={{ width: '400px', background: 'white', padding: '40px', borderRadius: '8px', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', color: '#0f172a' }}>okDriver</h1>
          <p style={{ color: '#64748b', fontSize: '14px', marginTop: '8px' }}>Sign in to Fleet Management</p>
        </div>
        
        {error && <div style={{ background: '#fef2f2', color: '#ef4444', padding: '12px', borderRadius: '6px', marginBottom: '20px', fontSize: '13px', border: '1px solid #f87171' }}>{error}</div>}
        
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>Email Address</label>
            <input 
              type="email" 
              className="input" 
              value={email} 
              onChange={e => setEmail(e.target.value)} 
              placeholder="demo@okdriver.in"
              required 
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: '#334155', marginBottom: '8px' }}>Password</label>
            <input 
              type="password" 
              className="input" 
              value={password} 
              onChange={e => setPassword(e.target.value)} 
              placeholder="12345678"
              required 
            />
          </div>
          <button type="submit" className="btn btn-primary" style={{ marginTop: '8px', padding: '12px', fontSize: '15px' }}>
            Sign In
          </button>
        </form>
      </div>
    </div>
  );
}
