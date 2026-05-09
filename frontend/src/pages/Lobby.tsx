import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { useLDMNSocket, getSocket } from '../hooks/useSocket';
import type { SlotData } from '../types';

export default function Lobby() {
  const navigate = useNavigate();
  const { twitchUser, gameState, connected } = useStore();
  const socket = useLDMNSocket();
  const [error, setError] = useState<string | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!twitchUser) navigate('/');
  }, [twitchUser]);

  // Watch phase changes → go to player panel
  useEffect(() => {
    if (gameState?.phase === 'DRAWING' || gameState?.phase === 'REVEAL') {
      navigate('/play');
    }
  }, [gameState?.phase]);

  // Error events
  useEffect(() => {
    const s = getSocket();
    s.on('join_error', ({ message }: { message: string }) => {
      setError(message);
    });
    return () => { s.off('join_error'); };
  }, []);

  const handleTakeSlot = (slotNum: number) => {
    if (!twitchUser) return;
    const slot = gameState?.slots[String(slotNum)];
    if (slot && slot.twitchId !== twitchUser.id) return;
    socket.emit('take_slot', { slotNum, twitchUser });
  };

  const handleLeave = () => {
    socket.emit('leave_slot');
    navigate('/');
  };

  const mySlot = twitchUser
    ? Object.entries(gameState?.slots || {}).find(
        ([, s]) => s?.twitchId === twitchUser.id
      )?.[0]
    : null;

  const phase = gameState?.phase;
  const scores = gameState?.scores || {};

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--dark)' }}>
      {/* Header */}
      <div className="glass border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <h1 className="font-display text-2xl gradient-text tracking-wider">
          LDMN · LOBBY
        </h1>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Verbunden' : 'Getrennt'}
          </div>
          {twitchUser && (
            <div className="flex items-center gap-2">
              <img src={twitchUser.profile_image_url} className="w-7 h-7 rounded-full ring-1 ring-purple-500" />
              <span className="text-sm text-gray-300">{twitchUser.display_name}</span>
            </div>
          )}
          <button
            onClick={handleLeave}
            className="text-gray-500 hover:text-white text-sm transition-colors"
          >
            Verlassen
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center p-6 gap-8">

        {/* Phase banner */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          {phase === 'LOBBY' && (
            <>
              <div className="font-display text-5xl gradient-text tracking-wider mb-1">WARTEN AUF START</div>
              <div className="text-gray-500 text-sm">Wähle deinen Platz oder warte auf den Host</div>
            </>
          )}
          {phase === 'SCORING' && (
            <>
              <div className="font-display text-5xl tracking-wider mb-1" style={{ color: '#F59E0B' }}>SCORING PHASE</div>
              <div className="text-gray-500 text-sm">Der Admin vergibt Punkte</div>
            </>
          )}
        </motion.div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass rounded-xl px-5 py-3 border border-red-500/40 text-red-400 text-sm"
              onClick={() => setError(null)}
            >
              ⚠ {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* 6 Slots grid */}
        <div className="grid grid-cols-2 gap-4 w-full max-w-2xl sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => i + 1).map((slotNum) => {
            const slot: SlotData | null = gameState?.slots[String(slotNum)] ?? null;
            const isMe = twitchUser && slot?.twitchId === twitchUser.id;
            const isMySlot = mySlot === String(slotNum);
            const isEmpty = !slot;
            const score = slot ? (scores[slot.twitchId] || 0) : 0;

            return (
              <motion.div
                key={slotNum}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: (slotNum - 1) * 0.05 }}
                className={`glass rounded-2xl p-4 flex flex-col gap-3 transition-all border ${
                  isMySlot
                    ? 'border-purple-500 glow-purple'
                    : isEmpty
                    ? 'border-white/5 hover:border-purple-500/40 cursor-pointer'
                    : 'border-white/5'
                }`}
                onClick={() => isEmpty ? handleTakeSlot(slotNum) : undefined}
                whileHover={isEmpty ? { scale: 1.02, y: -2 } : {}}
                whileTap={isEmpty ? { scale: 0.98 } : {}}
              >
                {/* Slot number */}
                <div className="flex items-center justify-between">
                  <span
                    className="font-display text-3xl"
                    style={{ color: isMySlot ? '#7C3AED' : 'rgba(255,255,255,0.15)' }}
                  >
                    {slotNum}
                  </span>
                  {slot && (
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${slot.connected ? 'bg-green-400' : 'bg-gray-600'}`}
                      />
                      {score > 0 && (
                        <span className="score-badge text-lg">{score}</span>
                      )}
                    </div>
                  )}
                </div>

                {slot ? (
                  /* Occupied slot */
                  <div className="flex items-center gap-3">
                    <img
                      src={slot.profileImageUrl}
                      className={`w-10 h-10 rounded-full ${isMySlot ? 'ring-2 ring-purple-500' : 'ring-1 ring-white/10'}`}
                    />
                    <div>
                      <div className="font-semibold text-sm text-white truncate max-w-[120px]">
                        {slot.displayName}
                      </div>
                      <div className="text-xs text-gray-500">
                        {slot.submitted ? '✓ Gezeichnet' : slot.connected ? 'Online' : 'Getrennt'}
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Empty slot */
                  <div className="flex items-center gap-2 text-gray-600">
                    <div className="w-10 h-10 rounded-full border border-dashed border-gray-700 flex items-center justify-center">
                      <span className="text-lg">+</span>
                    </div>
                    <span className="text-sm">Platz frei</span>
                  </div>
                )}

                {isMySlot && (
                  <div
                    className="text-xs text-center py-1 rounded-lg font-medium"
                    style={{ background: 'rgba(124,58,237,0.2)', color: '#A78BFA' }}
                  >
                    Dein Platz
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Score board (visible during SCORING) */}
        {phase === 'SCORING' && (
          <ScoreBoard slots={gameState?.slots || {}} scores={scores} />
        )}

        {/* My slot info */}
        {mySlot && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl px-5 py-3 text-sm text-gray-400 text-center"
          >
            Du sitzt auf <span className="text-purple-400 font-semibold">Platz {mySlot}</span>
            {' · '}
            Warte auf den Host
          </motion.div>
        )}

        {!mySlot && twitchUser && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="text-gray-600 text-sm text-center"
          >
            Klick auf einen freien Platz um beizutreten
          </motion.div>
        )}
      </div>
    </div>
  );
}

function ScoreBoard({ slots, scores }: { slots: Record<string, any>; scores: Record<string, number> }) {
  const players = Object.values(slots)
    .filter(Boolean)
    .sort((a, b) => (scores[b.twitchId] || 0) - (scores[a.twitchId] || 0));

  if (players.length === 0) return null;

  return (
    <div className="w-full max-w-md">
      <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">Rangliste</div>
      <div className="flex flex-col gap-2">
        {players.map((player, i) => (
          <motion.div
            key={player.twitchId}
            layout
            className="glass rounded-xl px-4 py-3 flex items-center gap-3"
          >
            <span className="text-gray-600 w-5 text-sm font-mono">{i + 1}</span>
            <img src={player.profileImageUrl} className="w-7 h-7 rounded-full" />
            <span className="flex-1 text-sm font-medium">{player.displayName}</span>
            <motion.span
              key={scores[player.twitchId]}
              animate={{ scale: [1, 1.3, 1] }}
              className="score-badge text-2xl"
            >
              {scores[player.twitchId] || 0}
            </motion.span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
