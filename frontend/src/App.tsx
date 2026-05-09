import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import './index.css';

import Home from './pages/Home';
import AuthCallback from './pages/AuthCallback';
import Lobby from './pages/Lobby';
import PlayerPanel from './pages/PlayerPanel';
import AdminPanel from './pages/AdminPanel';
import Overlay from './pages/Overlay';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/lobby" element={<Lobby />} />
        <Route path="/play" element={<PlayerPanel />} />
        <Route path="/admin" element={<AdminPanel />} />
        <Route path="/overlay" element={<Overlay />} />
      </Routes>
    </BrowserRouter>
  );
}
