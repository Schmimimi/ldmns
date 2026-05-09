import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { getSocket, useOverlaySocket } from '../hooks/useSocket';
import { useCamBroadcaster, useCamViewer } from '../hooks/useWebRTC';
import type { SlotData } from '../types';

// 16:9 video component
function CamPreview({ stream, style }: { stream: MediaStream | null | undefined; style?: React.CSSProperties }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream ?? null;
      if (stream) ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div style={{ position: 'relative', width: '100%', paddingTop: '56.25%', background: '#0a0a0f', borderRadius: 6, overflow: 'hidden', ...style }}>
      <video ref={ref} autoPlay playsInline muted
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
      {!stream && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#333', fontSize: 20 }}>
          📷
        </div>
      )}
    </div>
  );
}

export default function AdminPanel() {
  const { gameState, adminAuthed, setAdminAuthed, connected } = useStore();
  const socket = useOverlaySocket();

  // Host camera (admin broadcasts as 'host' slot)
  const {
    localStream: hostStream,
    cameras: hostCameras,
    selectedDeviceId: hostCamId,
    setSelectedDeviceId: setHostCamId,
    startCamera: startHostCam,
    stopCamera: stopHostCam,
    active: hostCamActive,
    camError: hostCamError,
  } = useCamBroadcaster('host');

  // Player camera feeds (admin views all 4 slots)
  const playerStreams = useCamViewer(['1', '2', '3', '4']);

  const [password, setPassword] = useState('');
  const [taskA, setTaskA] = useState('');
  const [taskB, setTaskB] = useState('');
  const [imposterCount, setImposterCount] = useState(1);
  const [whitelist, setWhitelist] = useState('');
  const [timerSec, setTimerSec] = useState(120);
  const [pointsInput, setPointsInput] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Auth
  useEffect(() => {
    const s = getSocket();
    s.on('admin_authenticated', () => {
      setAdminAuthed(true);
      setError('');
    });
    s.on('join_error', ({ message }: { message: string }) => setError(message));
    return () => {
      s.off('admin_authenticated');
      s.off('join_error');
    };
  }, []);

  // Sync task fields from state
  useEffect(() => {
    if (gameState?.round) {
      setTaskA(gameState.round.taskA || '');
      setTaskB(gameState.round.taskB || '');
      setImposterCount(gameState.round.imposterCount || 1);
    }
    if (gameState?.whitelist) {
      setWhitelist(gameState.whitelist.join('\n'));
    }
  }, [gameState?.round?.taskA, gameState?.round?.taskB]);

  const emit = (ev: string, data?: any) => socket.emit(ev, data);

  const flash = (text: string) => {
    setMsg(text);
    setTimeout(() => setMsg(''), 2000);
  };

  const handleLogin = () => {
    emit('admin_auth', { secret: password });
  };

  const handleStartRound = () => {
    emit('admin_set_tasks', { taskA, taskB, imposterCount });
    setTimeout(() => {
      emit('admin_start_round');
      flash('Runde gestartet!');
    }, 100);
  };

  const handleReveal = (slotNum: number) => {
    emit('admin_reveal_slot', { slotNum });
  };

  const handleHide = (slotNum: number) => {
    emit('admin_hide_slot', { slotNum });
  };

  const handleAward = (twitchId: string, pts: number) => {
    emit('admin_award_points', { twitchId, points: pts });
    flash(`+${pts} Punkte!`);
  };

  const handleCustomPoints = (twitchId: string) => {
    const pts = parseInt(pointsInput[twitchId] || '0');
    if (!isNaN(pts) && pts !== 0) {
      emit('admin_award_points', { twitchId, points: pts });
      setPointsInput(prev => ({ ...prev, [twitchId]: '' }));
      flash(`${pts > 0 ? '+' : ''}${pts} Punkte!`);
    }
  };

  const handleWhitelistSave = () => {
    const list = whitelist.split('\n').map(s => s.trim().toLowerCase()).filter(Boolean);
    emit('admin_set_whitelist', { whitelist: list });
    flash('Whitelist gespeichert');
  };


  if (!adminAuthed) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--dark)' }}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="glass rounded-2xl p-8 w-full max-w-sm flex flex-col gap-5"
        >
          <div className="text-center">
            <div className="font-display text-3xl gradient-text mb-1">ADMIN PANEL</div>
            <div className="text-gray-500 text-sm">Lügen darf man nicht sagen</div>
          </div>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleLogin()}
            placeholder="Admin-Passwort"
            className="bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-white text-sm outline-none focus:border-purple-500/60 transition-colors"
          />
          {error && <div className="text-red-400 text-xs text-center">{error}</div>}
          <button
            onClick={handleLogin}
            className="py-3 rounded-xl font-semibold text-white"
            style={{ background: 'linear-gradient(135deg, var(--purple), var(--pink))' }}
          >
            Einloggen
          </button>
          <div className={`flex items-center gap-1.5 text-xs justify-center ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Server verbunden' : 'Keine Verbindung'}
          </div>
        </motion.div>
      </div>
    );
  }

  const phase = gameState?.phase || 'LOBBY';
  const slots = gameState?.slots || {};
  const round = gameState?.round;
  const scores = gameState?.scores || {};
  const activePlayers = Object.entries(slots).filter(([, s]) => s !== null) as [string, SlotData][];
  const revealedSlots = round?.revealedSlots || [];

  return (
    <div className="min-h-screen flex flex-col" style={{ background: 'var(--dark)' }}>
      {/* Top bar */}
      <div className="glass border-b border-white/5 px-6 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="font-display text-2xl gradient-text">ADMIN PANEL · LDMN</h1>
          <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Live' : 'Getrennt'}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <AnimatePresence>
            {msg && (
              <motion.div
                initial={{ opacity: 0, y: -5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-green-400 text-sm font-medium"
              >
                ✓ {msg}
              </motion.div>
            )}
          </AnimatePresence>
          <span className="text-gray-500 text-sm">Phase:</span>
          <span className="font-mono text-purple-400 text-sm">{phase}</span>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ====== LEFT COLUMN ====== */}
        <div className="w-72 flex flex-col gap-4 p-4 border-r border-white/5 overflow-y-auto">

          {/* Phase Control */}
          <Section title="Phase">
            <div className="flex flex-col gap-1">
              {(['LOBBY', 'DRAWING', 'REVEAL', 'SCORING'] as const).map(p => (
                <button
                  key={p}
                  onClick={() => emit('admin_set_phase', { phase: p })}
                  className={`text-left px-3 py-2 rounded-lg text-sm font-medium transition-all ${
                    phase === p ? 'text-white' : 'text-gray-400 hover:text-white hover:bg-white/5'
                  }`}
                  style={phase === p ? { background: 'var(--purple)' } : {}}
                >
                  {p === 'LOBBY' ? '⏳ Lobby' : p === 'DRAWING' ? '✏️ Zeichnen' : p === 'REVEAL' ? '🎬 Reveal' : '🏆 Scoring'}
                </button>
              ))}
            </div>
          </Section>

          {/* Timer */}
          <Section title="Timer">
            <div className="flex gap-2 mb-2">
              {[30, 60, 90, 120, 180].map(s => (
                <button
                  key={s}
                  onClick={() => setTimerSec(s)}
                  className="text-xs px-2 py-1 rounded transition-all"
                  style={{
                    background: timerSec === s ? 'var(--purple)' : 'rgba(255,255,255,0.06)',
                    color: timerSec === s ? 'white' : '#9CA3AF',
                  }}
                >
                  {s}s
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => emit('admin_start_timer', { seconds: timerSec })}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: '#F59E0B' }}
              >
                ▶ Start
              </button>
              <button
                onClick={() => emit('admin_stop_timer')}
                className="px-3 py-2 rounded-lg text-sm font-medium text-gray-400 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.06)' }}
              >
                Stop
              </button>
            </div>
          </Section>

          {/* Whitelist */}
          <Section title="Whitelist (leer = alle erlaubt)">
            <textarea
              value={whitelist}
              onChange={e => setWhitelist(e.target.value)}
              placeholder="Twitch-Login pro Zeile&#10;z.B. schmilley"
              rows={5}
              className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-purple-500/60 resize-none transition-colors font-mono"
            />
            <button
              onClick={handleWhitelistSave}
              className="w-full mt-2 py-2 rounded-lg text-sm font-medium text-white"
              style={{ background: 'rgba(124,58,237,0.4)' }}
            >
              Speichern
            </button>
          </Section>

          {/* Host Camera */}
          <Section title="Host-Kamera">
            <CamPreview stream={hostStream} style={{ marginBottom: 8 }} />
            {hostCameras.length > 1 && (
              <select
                value={hostCamId}
                onChange={e => setHostCamId(e.target.value)}
                className="w-full mb-2 bg-black/30 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none"
              >
                {hostCameras.map((cam, i) => (
                  <option key={cam.deviceId} value={cam.deviceId}>
                    {cam.label || `Kamera ${i + 1}`}
                  </option>
                ))}
              </select>
            )}
            <button
              onClick={() => hostCamActive ? stopHostCam() : startHostCam(hostCamId || undefined)}
              className="w-full py-2 rounded-lg text-sm font-medium"
              style={{
                background: hostCamActive ? 'rgba(239,68,68,0.2)' : 'linear-gradient(135deg, var(--purple), var(--pink))',
                color: hostCamActive ? '#EF4444' : 'white',
                border: hostCamActive ? '1px solid rgba(239,68,68,0.4)' : 'none',
                cursor: 'pointer',
              }}
            >
              {hostCamActive ? '⏹ Kamera aus' : '📷 Host-Kamera starten'}
            </button>
            {hostCamError && <div className="text-xs text-red-400 mt-1">{hostCamError}</div>}
          </Section>

          {/* Danger zone */}
          <Section title="Reset">
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { if (confirm('Runde zurücksetzen?')) emit('admin_reset_round'); }}
                className="w-full py-2 rounded-lg text-sm font-medium text-orange-400 hover:text-white transition-colors"
                style={{ background: 'rgba(249,115,22,0.15)' }}
              >
                Runde zurücksetzen
              </button>
              <button
                onClick={() => { if (confirm('Alle Punkte löschen?')) emit('admin_reset_scores'); }}
                className="w-full py-2 rounded-lg text-sm font-medium text-red-400 hover:text-white transition-colors"
                style={{ background: 'rgba(239,68,68,0.15)' }}
              >
                Punkte löschen
              </button>
              <button
                onClick={() => setAdminAuthed(false)}
                className="w-full py-2 rounded-lg text-sm font-medium text-gray-500 hover:text-white transition-colors"
                style={{ background: 'rgba(255,255,255,0.04)' }}
              >
                Ausloggen
              </button>
            </div>
          </Section>
        </div>

        {/* ====== CENTER COLUMN ====== */}
        <div className="flex-1 flex flex-col gap-5 p-5 overflow-y-auto">

          {/* Round Setup */}
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-4">Runden-Setup</div>
            <div className="flex flex-col gap-3">
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Aufgabe A – <span className="text-cyan-400">Innocents</span>
                </label>
                <input
                  type="text"
                  value={taskA}
                  onChange={e => setTaskA(e.target.value)}
                  placeholder="z.B. Zeichne eine Katze"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-cyan-500/60 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-1 block">
                  Aufgabe B – <span className="text-red-400">Imposter</span>
                </label>
                <input
                  type="text"
                  value={taskB}
                  onChange={e => setTaskB(e.target.value)}
                  placeholder="z.B. Zeichne einen Hund"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-3 py-2.5 text-sm text-white placeholder-gray-600 outline-none focus:border-red-500/60 transition-colors"
                />
              </div>
              <div>
                <label className="text-xs text-gray-400 mb-2 block">Anzahl Imposter</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4].map(n => (
                    <button
                      key={n}
                      onClick={() => setImposterCount(n)}
                      className="w-12 h-10 rounded-lg text-sm font-bold transition-all"
                      style={{
                        background: imposterCount === n ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.06)',
                        color: imposterCount === n ? '#FCA5A5' : '#6B7280',
                        border: imposterCount === n ? '1px solid rgba(239,68,68,0.5)' : '1px solid transparent',
                      }}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                onClick={handleStartRound}
                disabled={!taskA || !taskB}
                className="w-full py-3 rounded-xl font-bold text-white text-sm disabled:opacity-40"
                style={{ background: 'linear-gradient(135deg, #7C3AED, #EC4899)' }}
              >
                🚀 Runde starten
              </motion.button>
            </div>
          </div>

          {/* Player slots */}
          <div className="glass rounded-2xl p-5">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-4">
              Spieler ({activePlayers.length}/4)
            </div>
            <div className="grid grid-cols-2 gap-3">
              {Array.from({ length: 4 }, (_, i) => i + 1).map(slotNum => {
                const slot = slots[String(slotNum)] as SlotData | null;
                const role = slot ? round?.roles?.[slot.twitchId] : null;
                const score = slot ? (scores[slot.twitchId] || 0) : 0;
                const isRevealed = revealedSlots.includes(slotNum);

                return (
                  <div
                    key={slotNum}
                    className="glass rounded-xl p-3 border border-white/5"
                    style={isRevealed ? { borderColor: 'rgba(245,158,11,0.4)' } : {}}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span
                        className="font-display text-2xl"
                        style={{ color: slot ? '#7C3AED' : 'rgba(255,255,255,0.1)' }}
                      >
                        {slotNum}
                      </span>
                      {role && (
                        <span className={`text-xs px-1.5 py-0.5 rounded ${role === 'innocent' ? 'badge-innocent' : 'badge-imposter'}`}>
                          {role === 'innocent' ? 'Inn.' : '🎭'}
                        </span>
                      )}
                    </div>

                    {slot ? (
                      <>
                        <div className="flex items-center gap-2 mb-2">
                          <img src={slot.profileImageUrl} className="w-8 h-8 rounded-full" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium truncate">{slot.displayName}</div>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <div className={`w-1 h-1 rounded-full ${slot.connected ? 'bg-green-400' : 'bg-gray-600'}`} />
                              {slot.submitted ? '✓ Gezeichnet' : 'Zeichnet...'}
                            </div>
                          </div>
                          <span className="score-badge text-xl">{score}</span>
                        </div>

                        {/* Cam preview via WebRTC */}
                        <CamPreview
                          stream={playerStreams[String(slotNum)]}
                          style={{ marginBottom: 8 }}
                        />

                        {/* Quick points */}
                        <div className="flex gap-1 mb-2 flex-wrap">
                          {[1, 2, 3].map(pts => (
                            <button
                              key={pts}
                              onClick={() => handleAward(slot.twitchId, pts)}
                              className="text-xs px-2 py-1 rounded font-bold text-white"
                              style={{ background: 'rgba(124,58,237,0.4)', border: 'none', cursor: 'pointer' }}
                            >
                              +{pts}
                            </button>
                          ))}
                          <button
                            onClick={() => handleAward(slot.twitchId, -1)}
                            className="text-xs px-2 py-1 rounded font-bold text-red-400"
                            style={{ background: 'rgba(239,68,68,0.15)', border: 'none', cursor: 'pointer' }}
                          >
                            -1
                          </button>
                        </div>

                        {/* Custom points */}
                        <div className="flex gap-1 mb-2">
                          <input
                            type="number"
                            value={pointsInput[slot.twitchId] || ''}
                            onChange={e => setPointsInput(prev => ({ ...prev, [slot.twitchId]: e.target.value }))}
                            placeholder="Eigene"
                            className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white outline-none"
                            style={{ minWidth: 0 }}
                          />
                          <button
                            onClick={() => handleCustomPoints(slot.twitchId)}
                            className="px-2 py-1 rounded text-xs font-medium text-white"
                            style={{ background: 'var(--purple)', border: 'none', cursor: 'pointer' }}
                          >
                            OK
                          </button>
                        </div>

                        {/* Reveal / Kick */}
                        <div className="flex gap-1">
                          {phase === 'REVEAL' && (
                            <button
                              onClick={() => isRevealed ? handleHide(slotNum) : handleReveal(slotNum)}
                              className="flex-1 py-1 rounded text-xs font-medium transition-all"
                              style={{
                                background: isRevealed ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.4)',
                                color: '#F59E0B',
                                border: 'none',
                                cursor: 'pointer',
                              }}
                            >
                              {isRevealed ? '👁 Verstecken' : '👁 Aufdecken'}
                            </button>
                          )}
                          <button
                            onClick={() => emit('admin_kick_player', { slotNum })}
                            className="px-2 py-1 rounded text-xs text-red-400 hover:text-white transition-colors"
                            style={{ background: 'rgba(239,68,68,0.1)', border: 'none', cursor: 'pointer' }}
                          >
                            Kick
                          </button>
                        </div>
                      </>
                    ) : (
                      <div className="flex items-center gap-2 h-8">
                        <div className="text-gray-700 text-sm">Leer</div>
                        <button
                          onClick={() => emit('admin_clear_slot', { slotNum })}
                          className="text-xs text-gray-700 hover:text-gray-500 transition-colors ml-auto"
                        >
                          Clear
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Drawings preview with reveal buttons */}
          {phase === 'REVEAL' && (
            <div className="glass rounded-2xl p-5">
              <div className="text-xs uppercase tracking-widest text-gray-500 mb-4">Zeichnungen aufdecken</div>
              <div className="grid grid-cols-2 gap-3">
                {Array.from({ length: 4 }, (_, i) => i + 1).map(slotNum => {
                  const slot = slots[String(slotNum)] as SlotData | null;
                  const isRevealed = revealedSlots.includes(slotNum);
                  const role = round?.roles?.[slot?.twitchId ?? ''];
                  return (
                    <div
                      key={slotNum}
                      className="rounded-xl overflow-hidden border"
                      style={{ borderColor: isRevealed ? 'rgba(245,158,11,0.5)' : 'rgba(255,255,255,0.06)' }}
                    >
                      {slot?.drawing ? (
                        <img src={slot.drawing} style={{ width: '100%', display: 'block' }} />
                      ) : (
                        <div style={{ width: '100%', paddingTop: '66%', background: 'rgba(0,0,0,0.3)', position: 'relative' }}>
                          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#374151', fontSize: 12 }}>
                            {slot ? 'Nicht abgegeben' : 'Leer'}
                          </div>
                        </div>
                      )}
                      <div className="p-2" style={{ background: 'rgba(0,0,0,0.5)' }}>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs text-gray-300 font-medium">
                            {slot?.displayName ?? `Slot ${slotNum}`}
                          </span>
                          {role && (
                            <span className={`text-xs ${role === 'imposter' ? 'text-red-400' : 'text-cyan-400'}`}>
                              {role === 'imposter' ? '🎭 Imp.' : '✓ Inn.'}
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => isRevealed ? handleHide(slotNum) : handleReveal(slotNum)}
                          className="w-full py-1 rounded text-xs font-medium transition-all"
                          style={{
                            background: isRevealed ? 'rgba(245,158,11,0.2)' : 'rgba(245,158,11,0.5)',
                            color: '#F59E0B',
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          {isRevealed ? '👁 Verstecken' : '👁 Aufdecken'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs uppercase tracking-widest text-gray-500 mb-2">{title}</div>
      {children}
    </div>
  );
}
