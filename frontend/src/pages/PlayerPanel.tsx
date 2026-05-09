import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { useLDMNSocket, getSocket } from '../hooks/useSocket';

const PALETTE = [
  '#FFFFFF', '#EF4444', '#F97316', '#EAB308',
  '#22C55E', '#06B6D4', '#7C3AED', '#EC4899',
  '#000000', '#6B7280',
];
const SIZES = [2, 5, 10, 20];

const VDO_BASE = 'https://vdo.ninja';
const VDO_PARAMS = '&noaudio&width=1280&height=720&framerate=30';

export default function PlayerPanel() {
  const navigate = useNavigate();
  const { twitchUser, gameState, myTask, myRole, connected } = useStore();
  const socket = useLDMNSocket();

  // Canvas refs & state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState('#FFFFFF');
  const [brushSize, setBrushSize] = useState(5);
  const [isEraser, setIsEraser] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [vdoId, setVdoId] = useState('');
  const [vdoSaved, setVdoSaved] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!twitchUser) navigate('/');
  }, [twitchUser]);

  // Go back to lobby when phase changes away
  useEffect(() => {
    if (gameState?.phase === 'LOBBY' || gameState?.phase === 'SCORING') {
      navigate('/lobby');
    }
  }, [gameState?.phase]);

  // Reset submitted state AND clear canvas when round starts
  useEffect(() => {
    if (gameState?.phase === 'DRAWING') {
      setSubmitted(false);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d')!;
        ctx.fillStyle = '#111118';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      }
    }
  }, [gameState?.phase]);

  // Timer countdown
  useEffect(() => {
    const timerEnd = gameState?.round?.timerEnd;
    if (!timerEnd) { setTimeLeft(null); return; }

    const tick = () => {
      const remaining = Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000));
      setTimeLeft(remaining);
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [gameState?.round?.timerEnd]);

  // Error events
  useEffect(() => {
    const s = getSocket();
    s.on('join_error', ({ message }: { message: string }) => setError(message));
    return () => { s.off('join_error'); };
  }, []);

  // Initialize canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Check if my drawing was already submitted (reconnect)
  useEffect(() => {
    if (!twitchUser || !gameState) return;
    const mySlot = Object.values(gameState.slots).find(s => s?.twitchId === twitchUser.id);
    if (mySlot?.submitted) setSubmitted(true);
    if (mySlot?.vdoId) setVdoId(mySlot.vdoId);
  }, [gameState, twitchUser]);

  const getCanvasPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ('touches' in e) {
      return {
        x: (e.touches[0].clientX - rect.left) * scaleX,
        y: (e.touches[0].clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (submitted) return;
    isDrawing.current = true;
    const pos = getCanvasPos(e);
    lastPos.current = pos;
    // Draw dot
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, (isEraser ? brushSize * 2 : brushSize) / 2, 0, Math.PI * 2);
    ctx.fillStyle = isEraser ? '#111118' : color;
    ctx.fill();
  }, [submitted, isEraser, brushSize, color]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing.current || submitted) return;
    e.preventDefault();
    const pos = getCanvasPos(e);
    if (!lastPos.current) { lastPos.current = pos; return; }
    const ctx = canvasRef.current!.getContext('2d')!;
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x, lastPos.current.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = isEraser ? '#111118' : color;
    ctx.lineWidth = isEraser ? brushSize * 2 : brushSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastPos.current = pos;
  }, [submitted, isEraser, brushSize, color]);

  const stopDraw = useCallback(() => {
    isDrawing.current = false;
    lastPos.current = null;
  }, []);

  const clearCanvas = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  };

  const submitDrawing = () => {
    const canvas = canvasRef.current!;
    const drawing = canvas.toDataURL('image/jpeg', 0.85);
    socket.emit('submit_drawing', { drawing });
    setSubmitted(true);
  };

  const saveVdoId = () => {
    socket.emit('set_vdo_id', { vdoId });
    setVdoSaved(true);
    setTimeout(() => setVdoSaved(false), 2000);
  };

  const phase = gameState?.phase;
  const mySlot = twitchUser
    ? Object.entries(gameState?.slots || {}).find(([, s]) => s?.twitchId === twitchUser.id)
    : null;
  const scores = gameState?.scores || {};
  const myScore = twitchUser ? scores[twitchUser.id] || 0 : 0;

  const vdoUrl = vdoId.trim()
    ? `${VDO_BASE}/?view=${encodeURIComponent(vdoId.trim())}${VDO_PARAMS}`
    : null;

  return (
    <div className="min-h-screen flex flex-col pb-6" style={{ background: 'var(--dark)' }}>
      {/* Header */}
      <div className="glass border-b border-white/5 px-5 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          {twitchUser?.profile_image_url && (
            <img src={twitchUser.profile_image_url} className="w-8 h-8 rounded-full ring-1 ring-purple-500" />
          )}
          <div>
            <div className="font-semibold text-sm">{twitchUser?.display_name}</div>
            <div className="text-xs text-gray-500">
              {mySlot ? `Slot ${mySlot[0]}` : 'Kein Platz'}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {myRole && (
            <div className={`text-xs px-2 py-1 rounded-lg font-medium ${myRole === 'innocent' ? 'badge-innocent' : 'badge-imposter'}`}>
              {myRole === 'innocent' ? 'Innocent' : '🎭 Imposter'}
            </div>
          )}
          <div className={`flex items-center gap-1.5 text-xs ${connected ? 'text-green-400' : 'text-red-400'}`}>
            <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400' : 'bg-red-400'}`} />
            {connected ? 'Live' : 'Getrennt'}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5 p-5">
        {/* Score */}
        <motion.div
          key={myScore}
          animate={{ scale: [1, 1.06, 1] }}
          transition={{ duration: 0.4 }}
          className="glass rounded-2xl px-5 py-4 flex items-center justify-between"
        >
          <div className="text-gray-400 text-xs uppercase tracking-widest">Deine Punkte</div>
          <div className="score-badge text-4xl">{myScore}</div>
        </motion.div>

        {/* Timer */}
        <AnimatePresence>
          {timeLeft !== null && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="glass rounded-xl px-5 py-3 flex items-center justify-between"
              style={{
                borderColor: timeLeft <= 10 ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.3)',
                borderWidth: 1,
                boxShadow: timeLeft <= 10 ? '0 0 20px rgba(239,68,68,0.2)' : 'none',
              }}
            >
              <span className="text-xs text-gray-400 uppercase tracking-wider">Zeit</span>
              <span
                className="font-display text-3xl"
                style={{ color: timeLeft <= 10 ? '#EF4444' : '#F59E0B' }}
              >
                {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:
                {(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Task card */}
        <AnimatePresence>
          {myTask && phase === 'DRAWING' && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass rounded-2xl p-5 border"
              style={{
                borderColor: myRole === 'innocent' ? 'rgba(6,182,212,0.4)' : 'rgba(239,68,68,0.4)',
                boxShadow: myRole === 'innocent'
                  ? '0 0 30px rgba(6,182,212,0.15)'
                  : '0 0 30px rgba(239,68,68,0.15)',
              }}
            >
              <div className={`text-xs uppercase tracking-widest mb-2 ${myRole === 'innocent' ? 'text-cyan-400' : 'text-red-400'}`}>
                {myRole === 'innocent' ? 'Deine Aufgabe (Innocent)' : '🎭 Deine Aufgabe (Imposter)'}
              </div>
              <div className="text-xl font-semibold leading-snug">{myTask}</div>
              <div className="text-xs text-gray-500 mt-2">
                {myRole === 'innocent'
                  ? 'Zeichne die Aufgabe möglichst gut!'
                  : 'Zeichne etwas Ähnliches – aber du weißt nicht genau was die anderen zeichnen!'}
              </div>
            </motion.div>
          )}
          {phase === 'REVEAL' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="glass rounded-2xl p-4 text-center text-gray-400 text-sm"
            >
              🎬 Der Host deckt Antworten auf...
            </motion.div>
          )}
        </AnimatePresence>

        {/* Drawing canvas + VDO camera side by side */}
        {phase === 'DRAWING' && (
          <div className="glass rounded-2xl p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs uppercase tracking-widest text-gray-500">
                {submitted ? '✓ Abgegeben' : 'Zeichne hier'}
              </div>
              {submitted && (
                <span className="text-xs text-green-400 font-medium">Warte auf andere Spieler…</span>
              )}
            </div>

            {/* Side-by-side: canvas left, cam right */}
            <div className="flex gap-3">
              {/* Canvas */}
              <div className="relative flex-1" style={{ borderRadius: '10px', overflow: 'hidden' }}>
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={320}
                  style={{
                    width: '100%',
                    display: 'block',
                    cursor: submitted ? 'default' : isEraser ? 'cell' : 'crosshair',
                    touchAction: 'none',
                    opacity: submitted ? 0.6 : 1,
                    transition: 'opacity 0.3s',
                  }}
                  onMouseDown={startDraw}
                  onMouseMove={draw}
                  onMouseUp={stopDraw}
                  onMouseLeave={stopDraw}
                  onTouchStart={startDraw}
                  onTouchMove={draw}
                  onTouchEnd={stopDraw}
                />
                {submitted && (
                  <div
                    className="absolute inset-0 flex items-center justify-center"
                    style={{ background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }}
                  >
                    <div className="text-center">
                      <div className="text-4xl mb-2">✓</div>
                      <div className="font-semibold text-green-400">Abgegeben!</div>
                    </div>
                  </div>
                )}
              </div>

              {/* VDO.Ninja camera preview */}
              <div
                style={{
                  width: '200px',
                  flexShrink: 0,
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#0a0a0f',
                  border: '1px solid rgba(255,255,255,0.08)',
                  display: 'flex',
                  flexDirection: 'column',
                }}
              >
                <div style={{ flex: 1, position: 'relative', minHeight: '130px' }}>
                  {vdoUrl ? (
                    <iframe
                      key={vdoUrl}
                      src={vdoUrl}
                      allow="camera;microphone;fullscreen;picture-in-picture;display-capture"
                      style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                    />
                  ) : (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        color: '#374151',
                        fontSize: '12px',
                        textAlign: 'center',
                        padding: '8px',
                      }}
                    >
                      <div style={{ fontSize: '28px' }}>📷</div>
                      <div>Kein VDO-Link</div>
                    </div>
                  )}
                </div>
                {/* VDO ID input inside cam panel */}
                <div style={{ padding: '8px', borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                  <div className="text-xs text-gray-600 mb-1.5">VDO.Ninja ID</div>
                  <div className="flex gap-1">
                    <input
                      type="text"
                      value={vdoId}
                      onChange={(e) => setVdoId(e.target.value)}
                      placeholder="Push-Name"
                      className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-gray-700 outline-none focus:border-purple-500/60 transition-colors"
                      style={{ minWidth: 0 }}
                    />
                    <button
                      onClick={saveVdoId}
                      disabled={!vdoId.trim()}
                      className="px-2 py-1 rounded text-xs font-medium disabled:opacity-40"
                      style={{ background: vdoSaved ? '#10B981' : 'var(--purple)', color: 'white', border: 'none', cursor: 'pointer', flexShrink: 0 }}
                    >
                      {vdoSaved ? '✓' : 'OK'}
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Toolbar */}
            {!submitted && (
              <div className="flex flex-wrap items-center gap-2 mt-3">
                {/* Color palette */}
                <div className="flex gap-1.5 flex-wrap">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      onClick={() => { setColor(c); setIsEraser(false); }}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: c,
                        border: color === c && !isEraser ? '3px solid white' : '2px solid rgba(255,255,255,0.15)',
                        cursor: 'pointer',
                        flexShrink: 0,
                      }}
                    />
                  ))}
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />

                {/* Brush sizes */}
                <div className="flex gap-1.5">
                  {SIZES.map((s) => (
                    <button
                      key={s}
                      onClick={() => { setBrushSize(s); setIsEraser(false); }}
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: '50%',
                        background: brushSize === s && !isEraser ? 'var(--purple)' : 'rgba(255,255,255,0.08)',
                        color: 'white',
                        fontSize: 9,
                        fontWeight: 700,
                        cursor: 'pointer',
                        border: 'none',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Divider */}
                <div style={{ width: 1, height: 20, background: 'rgba(255,255,255,0.1)' }} />

                <button
                  onClick={() => setIsEraser(!isEraser)}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    background: isEraser ? 'var(--purple)' : 'rgba(255,255,255,0.08)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Radierer
                </button>

                <button
                  onClick={clearCanvas}
                  style={{
                    padding: '3px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    background: 'rgba(239,68,68,0.15)',
                    color: '#EF4444',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Löschen
                </button>

                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={submitDrawing}
                  style={{
                    marginLeft: 'auto',
                    padding: '5px 16px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    background: 'linear-gradient(135deg, var(--purple), var(--pink))',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Abgeben ✓
                </motion.button>
              </div>
            )}
          </div>
        )}

        {/* VDO setup section when NOT in drawing phase */}
        {phase !== 'DRAWING' && (
          <div className="glass rounded-2xl p-4">
            <div className="text-xs uppercase tracking-widest text-gray-500 mb-3">VDO.Ninja Kamera</div>
            {vdoUrl && (
              <div
                style={{
                  width: '100%',
                  height: '180px',
                  borderRadius: '8px',
                  overflow: 'hidden',
                  background: '#0a0a0f',
                  marginBottom: '10px',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}
              >
                <iframe
                  key={vdoUrl}
                  src={vdoUrl}
                  allow="camera;microphone;fullscreen;picture-in-picture;display-capture"
                  style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
                />
              </div>
            )}
            <div className="flex gap-2">
              <input
                type="text"
                value={vdoId}
                onChange={(e) => setVdoId(e.target.value)}
                placeholder="Dein VDO.Ninja Push-Name"
                className="flex-1 bg-black/30 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 outline-none focus:border-purple-500/60 transition-colors"
              />
              <button
                onClick={saveVdoId}
                disabled={!vdoId.trim()}
                className="px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-40 transition-all"
                style={{ background: vdoSaved ? '#10B981' : 'var(--purple)', color: 'white', border: 'none', cursor: 'pointer' }}
              >
                {vdoSaved ? '✓' : 'Speichern'}
              </button>
            </div>
            <div className="text-xs text-gray-600 mt-2">
              Geh auf vdo.ninja und erstell einen Push-Link. Den Namen hier eingeben.
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="glass rounded-xl px-4 py-3 text-red-400 text-sm border border-red-500/30">
            ⚠ {error}
          </div>
        )}
      </div>
    </div>
  );
}
