import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { useLDMNSocket, getSocket } from '../hooks/useSocket';
import { useCamBroadcaster } from '../hooks/useWebRTC';

const PALETTE = [
  '#FFFFFF', '#EF4444', '#F97316', '#EAB308',
  '#22C55E', '#06B6D4', '#7C3AED', '#EC4899',
  '#000000', '#6B7280',
];
const SIZES = [2, 5, 10, 20];

// 16:9 video preview component
function LocalVideo({ stream }: { stream: MediaStream | null }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream;
      if (stream) ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        paddingTop: '56.25%',
        background: '#0a0a0f',
        overflow: 'hidden',
        borderRadius: '8px',
      }}
    >
      <video
        ref={ref}
        autoPlay
        playsInline
        muted
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
      {!stream && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '4px',
            color: '#374151',
            fontSize: '12px',
          }}
        >
          <span style={{ fontSize: '24px' }}>📷</span>
          <span>Kein Bild</span>
        </div>
      )}
    </div>
  );
}

export default function PlayerPanel() {
  const navigate = useNavigate();
  const { twitchUser, gameState, myTask, connected } = useStore();
  const socket = useLDMNSocket();

  // Determine slot number
  const mySlotEntry = Object.entries(gameState?.slots || {}).find(
    ([, s]) => s?.twitchId === twitchUser?.id
  );
  const mySlotNum = mySlotEntry ? Number(mySlotEntry[0]) : 0;

  // WebRTC camera
  const {
    localStream,
    cameras,
    selectedDeviceId,
    setSelectedDeviceId,
    startCamera,
    stopCamera,
    active: camActive,
    camError,
  } = useCamBroadcaster(mySlotNum || 'unknown');

  // Canvas refs & state
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const [color, setColor] = useState('#FFFFFF');
  const [brushSize, setBrushSize] = useState(5);
  const [isEraser, setIsEraser] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Redirect if not logged in
  useEffect(() => {
    if (!twitchUser) navigate('/');
  }, [twitchUser]);

  // Go back to lobby when phase changes away from DRAWING/REVEAL
  useEffect(() => {
    if (gameState?.phase === 'LOBBY' || gameState?.phase === 'SCORING') {
      navigate('/lobby');
    }
  }, [gameState?.phase]);

  // Reset submitted state AND clear canvas when a new round starts
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
    const tick = () =>
      setTimeLeft(Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)));
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

  // Initialize canvas background
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#111118';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }, []);

  // Reconnect: restore submitted state
  useEffect(() => {
    if (!twitchUser || !gameState) return;
    const mySlot = Object.values(gameState.slots).find(
      (s) => s?.twitchId === twitchUser.id
    );
    if (mySlot?.submitted) setSubmitted(true);
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

  const startDraw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (submitted) return;
      isDrawing.current = true;
      const pos = getCanvasPos(e);
      lastPos.current = pos;
      const ctx = canvasRef.current!.getContext('2d')!;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, (isEraser ? brushSize * 2 : brushSize) / 2, 0, Math.PI * 2);
      ctx.fillStyle = isEraser ? '#111118' : color;
      ctx.fill();
    },
    [submitted, isEraser, brushSize, color]
  );

  const draw = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
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
    },
    [submitted, isEraser, brushSize, color]
  );

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

  const phase = gameState?.phase;
  const scores = gameState?.scores || {};
  const myScore = twitchUser ? scores[twitchUser.id] || 0 : 0;

  return (
    <div
      style={{
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: 'var(--dark)',
      }}
    >
      {/* ── HEADER ─────────────────────────────────────────────── */}
      <div
        className="glass border-b border-white/5"
        style={{
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {twitchUser?.profile_image_url && (
            <img
              src={twitchUser.profile_image_url}
              style={{ width: 30, height: 30, borderRadius: '50%', border: '1px solid rgba(124,58,237,0.6)' }}
            />
          )}
          <div>
            <div style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.2 }}>
              {twitchUser?.display_name}
            </div>
            <div style={{ fontSize: 10, color: '#6B7280' }}>
              {mySlotEntry ? `Slot ${mySlotEntry[0]}` : 'Kein Platz'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Score badge */}
          <span className="score-badge" style={{ fontSize: '1.4rem' }}>{myScore}</span>
          {/* Connection dot */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 11,
              color: connected ? '#10B981' : '#EF4444',
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: connected ? '#10B981' : '#EF4444',
              }}
            />
            {connected ? 'Live' : 'Weg'}
          </div>
        </div>
      </div>

      {/* ── SCROLLABLE BODY ────────────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          padding: '8px',
          gap: '6px',
        }}
      >
        {/* Timer (compact, only when active) */}
        <AnimatePresence>
          {timeLeft !== null && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              style={{
                flexShrink: 0,
                borderRadius: '10px',
                padding: '5px 12px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                background: 'rgba(0,0,0,0.4)',
                border: `1px solid ${timeLeft <= 10 ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.3)'}`,
                boxShadow: timeLeft <= 10 ? '0 0 16px rgba(239,68,68,0.2)' : 'none',
              }}
            >
              <span style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                Zeit
              </span>
              <span
                className="font-display"
                style={{ fontSize: '1.6rem', color: timeLeft <= 10 ? '#EF4444' : '#F59E0B' }}
              >
                {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:
                {(timeLeft % 60).toString().padStart(2, '0')}
              </span>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Task card – no role mentioned! */}
        <AnimatePresence>
          {myTask && phase === 'DRAWING' && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              style={{
                flexShrink: 0,
                borderRadius: '12px',
                padding: '8px 12px',
                background: 'rgba(124,58,237,0.15)',
                border: '1px solid rgba(124,58,237,0.35)',
              }}
            >
              <div style={{ fontSize: 10, color: '#A78BFA', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 3 }}>
                Deine Aufgabe
              </div>
              <div style={{ fontSize: 15, fontWeight: 700, color: 'white', lineHeight: 1.3 }}>
                {myTask}
              </div>
            </motion.div>
          )}
          {phase === 'REVEAL' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{
                flexShrink: 0,
                borderRadius: '12px',
                padding: '8px 12px',
                background: 'rgba(0,0,0,0.3)',
                color: '#9CA3AF',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              🎬 Der Host deckt Zeichnungen auf...
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── DRAWING PHASE ─────────────────────────────────────── */}
        {phase === 'DRAWING' && (
          <>
            {/* Canvas + Camera side by side */}
            <div style={{ display: 'flex', gap: '6px', flexShrink: 0 }}>
              {/* Canvas container – fixed aspect ratio 3:2 */}
              <div
                style={{
                  flex: '0 0 58%',
                  position: 'relative',
                  borderRadius: '10px',
                  overflow: 'hidden',
                  background: '#111118',
                  border: '1px solid rgba(255,255,255,0.06)',
                  aspectRatio: '3/2',
                }}
              >
                <canvas
                  ref={canvasRef}
                  width={480}
                  height={320}
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'block',
                    cursor: submitted ? 'default' : isEraser ? 'cell' : 'crosshair',
                    touchAction: 'none',
                    opacity: submitted ? 0.5 : 1,
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
                    style={{
                      position: 'absolute',
                      inset: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      background: 'rgba(0,0,0,0.55)',
                      backdropFilter: 'blur(2px)',
                      flexDirection: 'column',
                      gap: 4,
                    }}
                  >
                    <div style={{ fontSize: 28, color: '#10B981' }}>✓</div>
                    <div style={{ fontSize: 12, color: '#10B981', fontWeight: 600 }}>Abgegeben!</div>
                  </div>
                )}
              </div>

              {/* Camera panel */}
              <div
                style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '5px',
                  minWidth: 0,
                }}
              >
                {/* 16:9 video preview */}
                <LocalVideo stream={localStream} />

                {/* Camera selector */}
                {cameras.length > 1 && (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    style={{
                      width: '100%',
                      background: 'rgba(0,0,0,0.5)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 6,
                      color: 'white',
                      fontSize: 10,
                      padding: '3px 4px',
                      outline: 'none',
                    }}
                  >
                    {cameras.map((cam, i) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `Kamera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}

                {/* Start/Stop cam button */}
                <button
                  onClick={() =>
                    camActive
                      ? stopCamera()
                      : startCamera(selectedDeviceId || undefined)
                  }
                  style={{
                    width: '100%',
                    padding: '4px 6px',
                    borderRadius: 6,
                    fontSize: 10,
                    fontWeight: 700,
                    background: camActive
                      ? 'rgba(239,68,68,0.2)'
                      : 'linear-gradient(135deg, var(--purple), var(--pink))',
                    color: camActive ? '#EF4444' : 'white',
                    border: camActive ? '1px solid rgba(239,68,68,0.4)' : 'none',
                    cursor: 'pointer',
                  }}
                >
                  {camActive ? '⏹ Cam aus' : '📷 Cam an'}
                </button>

                {camError && (
                  <div style={{ fontSize: 9, color: '#EF4444', lineHeight: 1.3 }}>
                    {camError}
                  </div>
                )}
              </div>
            </div>

            {/* Toolbar */}
            {!submitted && (
              <div
                style={{
                  flexShrink: 0,
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: '5px',
                  alignItems: 'center',
                  padding: '6px 8px',
                  background: 'rgba(0,0,0,0.25)',
                  borderRadius: '10px',
                }}
              >
                {/* Colors */}
                {PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => { setColor(c); setIsEraser(false); }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: c,
                      border:
                        color === c && !isEraser
                          ? '3px solid white'
                          : '2px solid rgba(255,255,255,0.12)',
                      cursor: 'pointer',
                      flexShrink: 0,
                      padding: 0,
                    }}
                  />
                ))}

                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />

                {/* Brush sizes */}
                {SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => { setBrushSize(s); setIsEraser(false); }}
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background:
                        brushSize === s && !isEraser
                          ? 'var(--purple)'
                          : 'rgba(255,255,255,0.07)',
                      color: 'white',
                      fontSize: 8,
                      fontWeight: 700,
                      cursor: 'pointer',
                      border: 'none',
                      flexShrink: 0,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    {s}
                  </button>
                ))}

                <div style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.08)' }} />

                <button
                  onClick={() => setIsEraser(!isEraser)}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 5,
                    fontSize: 10,
                    background: isEraser ? 'var(--purple)' : 'rgba(255,255,255,0.07)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Rad.
                </button>

                <button
                  onClick={clearCanvas}
                  style={{
                    padding: '2px 8px',
                    borderRadius: 5,
                    fontSize: 10,
                    background: 'rgba(239,68,68,0.15)',
                    color: '#EF4444',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  ✕
                </button>

                <motion.button
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={submitDrawing}
                  style={{
                    marginLeft: 'auto',
                    padding: '4px 14px',
                    borderRadius: 7,
                    fontSize: 11,
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

            {submitted && (
              <div
                style={{
                  flexShrink: 0,
                  textAlign: 'center',
                  color: '#10B981',
                  fontSize: 12,
                  padding: '4px 0',
                }}
              >
                ✓ Abgegeben – warte auf andere Spieler…
              </div>
            )}
          </>
        )}

        {/* ── NON-DRAWING PHASE (LOBBY / REVEAL / SCORING) ─────── */}
        {phase !== 'DRAWING' && (
          <div
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '8px',
              overflow: 'auto',
            }}
          >
            {/* Cam section */}
            <div
              className="glass"
              style={{ borderRadius: '14px', padding: '10px', flexShrink: 0 }}
            >
              <div
                style={{
                  fontSize: 10,
                  color: '#6B7280',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  marginBottom: 8,
                }}
              >
                Kamera
              </div>

              <LocalVideo stream={localStream} />

              <div style={{ marginTop: 8, display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                {cameras.length > 1 && (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    style={{
                      flex: 1,
                      background: 'rgba(0,0,0,0.4)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      borderRadius: 8,
                      color: 'white',
                      fontSize: 12,
                      padding: '5px 8px',
                      outline: 'none',
                    }}
                  >
                    {cameras.map((cam, i) => (
                      <option key={cam.deviceId} value={cam.deviceId}>
                        {cam.label || `Kamera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  onClick={() =>
                    camActive
                      ? stopCamera()
                      : startCamera(selectedDeviceId || undefined)
                  }
                  style={{
                    padding: '6px 16px',
                    borderRadius: 8,
                    fontSize: 12,
                    fontWeight: 700,
                    background: camActive
                      ? 'rgba(239,68,68,0.2)'
                      : 'linear-gradient(135deg, var(--purple), var(--pink))',
                    color: camActive ? '#EF4444' : 'white',
                    border: camActive ? '1px solid rgba(239,68,68,0.4)' : 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                  }}
                >
                  {camActive ? '⏹ Kamera aus' : '📷 Kamera starten'}
                </button>
              </div>

              {!camActive && cameras.length === 0 && (
                <div style={{ fontSize: 11, color: '#6B7280', marginTop: 6 }}>
                  Klick auf „Kamera starten" → Browser fragt nach Erlaubnis.
                </div>
              )}

              {camError && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 11,
                    color: '#EF4444',
                    background: 'rgba(239,68,68,0.1)',
                    borderRadius: 6,
                    padding: '4px 8px',
                  }}
                >
                  {camError}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div
            style={{
              flexShrink: 0,
              borderRadius: '10px',
              padding: '8px 12px',
              color: '#EF4444',
              fontSize: 12,
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
            }}
          >
            ⚠ {error}
          </div>
        )}
      </div>
    </div>
  );
}
