import React from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useStore } from '../store';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

export default function Home() {
  const navigate = useNavigate();
  const { twitchUser, setTwitchUser } = useStore();

  const handleTwitchLogin = () => {
    window.location.href = `${BACKEND_URL}/api/auth/twitch`;
  };

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center relative overflow-hidden"
      style={{ background: 'var(--dark)' }}
    >
      {/* Background glow */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div
          className="w-[700px] h-[700px] rounded-full opacity-10"
          style={{ background: 'radial-gradient(circle, #EF4444, #7C3AED, transparent)' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
        className="relative z-10 flex flex-col items-center gap-12 px-8 w-full max-w-md"
      >
        {/* Logo */}
        <div className="text-center">
          <div className="font-display text-sm tracking-[0.4em] text-gray-500 mb-2 uppercase">
            Schmilley Games präsentiert
          </div>
          <h1
            className="font-display leading-tight"
            style={{
              fontSize: 'clamp(3rem, 10vw, 5rem)',
              background: 'linear-gradient(135deg, #EF4444, #EC4899, #7C3AED)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              letterSpacing: '0.05em',
            }}
          >
            LÜGEN DARF MAN NICHT SAGEN!
          </h1>
          <p className="text-gray-500 mt-3 tracking-wider uppercase text-xs">
            Twitch Edition · Imposter Zeichenshow
          </p>
        </div>

        {/* Auth */}
        {!twitchUser ? (
          <motion.button
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={handleTwitchLogin}
            className="flex items-center gap-3 px-8 py-4 rounded-xl font-body font-semibold text-white text-lg w-full justify-center"
            style={{ background: '#9146FF' }}
          >
            <svg className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714z" />
            </svg>
            Mit Twitch einloggen
          </motion.button>
        ) : (
          <div className="flex flex-col gap-5 w-full">
            {/* User card */}
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="glass rounded-2xl px-5 py-4 flex items-center gap-4"
            >
              <img
                src={twitchUser.profile_image_url}
                className="w-12 h-12 rounded-full ring-2 ring-purple-500"
              />
              <div className="flex-1">
                <div className="font-semibold text-white">{twitchUser.display_name}</div>
                <div className="text-gray-400 text-sm">@{twitchUser.login}</div>
              </div>
              <button
                onClick={() => setTwitchUser(null)}
                className="text-gray-500 hover:text-white transition-colors text-sm"
              >
                Logout
              </button>
            </motion.div>

            {/* Action buttons */}
            <div className="flex flex-col gap-3">
              <motion.button
                whileHover={{ scale: 1.02, y: -1 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/lobby')}
                className="w-full py-4 rounded-xl font-semibold text-white text-center"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #EC4899)' }}
              >
                🎮 Zur Lobby
              </motion.button>

              <div className="grid grid-cols-2 gap-3">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/overlay')}
                  className="glass rounded-xl py-3 text-sm font-medium text-gray-300 hover:text-white hover:border-purple-500/50 border border-transparent transition-all"
                >
                  📺 Overlay (OBS)
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/admin')}
                  className="glass rounded-xl py-3 text-sm font-medium text-gray-300 hover:text-white hover:border-purple-500/50 border border-transparent transition-all"
                >
                  ⚙️ Admin Panel
                </motion.button>
              </div>
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="glass rounded-2xl p-5 w-full">
          <div className="text-xs uppercase tracking-widest text-gray-500 mb-4">Spielablauf</div>
          <div className="flex flex-col gap-3">
            {[
              { n: '1', text: 'Alle Spieler loggen ein und belegen Slots 1–6' },
              { n: '2', text: 'Innocents bekommen Aufgabe A · Imposter bekommen Aufgabe B' },
              { n: '3', text: 'Alle zeichnen ihre Antwort auf dem Canvas' },
              { n: '4', text: 'Der Host deckt Antworten auf – wer lügt?' },
            ].map(({ n, text }) => (
              <div key={n} className="flex items-start gap-3 text-sm">
                <span
                  className="font-display text-lg leading-none shrink-0"
                  style={{ color: '#7C3AED' }}
                >
                  {n}
                </span>
                <span className="text-gray-400 leading-snug">{text}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
