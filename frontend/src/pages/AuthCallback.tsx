import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../store';

export default function AuthCallback() {
  const navigate = useNavigate();
  const { setTwitchUser } = useStore();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    const login = params.get('login');
    const display_name = params.get('display_name');
    const profile_image_url = params.get('profile_image_url');

    if (id && login && display_name && profile_image_url) {
      setTwitchUser({ id, login, display_name, profile_image_url });
    }

    navigate('/', { replace: true });
  }, []);

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ background: 'var(--dark)' }}
    >
      <div className="text-gray-400 text-sm">Einloggen…</div>
    </div>
  );
}
