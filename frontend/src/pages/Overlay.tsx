import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { useOverlaySocket } from '../hooks/useSocket';
import { useCamViewer } from '../hooks/useWebRTC';
import type { SlotData } from '../types';

// Camera bar height for 4 players (bigger than before)
const CAM_BAR_HEIGHT = 320;
// Host cam dimensions (top-left, 16:9)
const HOST_CAM_W = 340;
const HOST_CAM_H = Math.round(340 * 9 / 16); // = 191px

// 16:9 video element for WebRTC streams
function StreamVideo({
  stream,
  style,
}: {
  stream: MediaStream | null | undefined;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) {
      ref.current.srcObject = stream ?? null;
      if (stream) ref.current.play().catch(() => {});
    }
  }, [stream]);
  return (
    <video
      ref={ref}
      autoPlay
      playsInline
      muted
      style={{
        width: '100%',
        height: '100%',
        objectFit: 'cover',
        display: 'block',
        background: '#000',
        ...style,
      }}
    />
  );
}

export default function Overlay() {
  useOverlaySocket();
  const { gameState } = useStore();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Receive all cameras via WebRTC
  const streams = useCamViewer(['1', '2', '3', '4', 'host']);

  const phase = gameState?.phase || 'LOBBY';
  const slots = gameState?.slots || {};
  const round = gameState?.round;
  const scores = gameState?.scores || {};
  const revealedSlots = round?.revealedSlots || [];

  // Timer countdown
  useEffect(() => {
    const timerEnd = round?.timerEnd;
    if (!timerEnd) { setTimeLeft(null); return; }
    const tick = () => setTimeLeft(Math.max(0, Math.ceil((timerEnd - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
  }, [round?.timerEnd]);

  const slotEntries = Array.from({ length: 4 }, (_, i) => ({
    num: i + 1,
    slot: (slots[String(i + 1)] as SlotData | null) ?? null,
  }));

  const hostStream = streams['host'] ?? null;

  return (
    <div
      style={{
        width: '1920px',
        height: '1080px',
        position: 'relative',
        overflow: 'hidden',
        background: 'transparent',
        fontFamily: "'DM Sans', sans-serif",
      }}
    >
      {/* Subtle ambient glow */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'radial-gradient(ellipse at 50% 30%, rgba(124,58,237,0.06) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />

      {/* ==================== */}
      {/* MAIN CONTENT AREA    */}
      {/* ==================== */}
      <div
        style={{
          position: 'absolute',
          top: 0, left: 0, right: 0,
          bottom: `${CAM_BAR_HEIGHT}px`,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {phase === 'LOBBY' && <LobbyDisplay />}
        {phase === 'DRAWING' && (
          <DrawingDisplay timeLeft={timeLeft} slotEntries={slotEntries} />
        )}
        {phase === 'REVEAL' && (
          <RevealDisplay
            slotEntries={slotEntries}
            revealedSlots={revealedSlots}
            round={round}
          />
        )}
        {phase === 'SCORING' && (
          <ScoringDisplay slotEntries={slotEntries} scores={scores} />
        )}
      </div>

      {/* Timer overlay (top center) */}
      <AnimatePresence>
        {timeLeft !== null && phase === 'DRAWING' && (
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{
              position: 'absolute',
              top: 24,
              left: '50%',
              transform: 'translateX(-50%)',
              background: 'rgba(10,10,15,0.9)',
              backdropFilter: 'blur(20px)',
              border: `1px solid ${timeLeft <= 10 ? 'rgba(239,68,68,0.6)' : 'rgba(245,158,11,0.4)'}`,
              borderRadius: '20px',
              padding: '12px 40px',
              boxShadow:
                timeLeft <= 10
                  ? '0 0 40px rgba(239,68,68,0.3)'
                  : '0 0 20px rgba(245,158,11,0.2)',
            }}
          >
            <span
              style={{
                fontFamily: "'Bebas Neue'",
                fontSize: '5rem',
                letterSpacing: '0.1em',
                color: timeLeft <= 10 ? '#EF4444' : '#F59E0B',
                lineHeight: 1,
              }}
            >
              {Math.floor(timeLeft / 60).toString().padStart(2, '0')}:
              {(timeLeft % 60).toString().padStart(2, '0')}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== */}
      {/* HOST CAM – TOP LEFT  */}
      {/* ==================== */}
      <AnimatePresence>
        {hostStream && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            style={{
              position: 'absolute',
              top: 20,
              left: 20,
              width: `${HOST_CAM_W}px`,
              height: `${HOST_CAM_H}px`,
              borderRadius: '14px',
              overflow: 'hidden',
              background: '#000',
              border: '2px solid rgba(124,58,237,0.6)',
              boxShadow:
                '0 0 30px rgba(124,58,237,0.25), 0 8px 32px rgba(0,0,0,0.6)',
            }}
          >
            <StreamVideo stream={hostStream} />
            {/* Host label */}
            <div
              style={{
                position: 'absolute',
                bottom: 0, left: 0, right: 0,
                background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
                padding: '20px 10px 8px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <div
                style={{
                  width: 8, height: 8,
                  borderRadius: '50%',
                  background: '#10B981',
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  fontFamily: "'Bebas Neue'",
                  fontSize: '1.3rem',
                  color: 'white',
                  letterSpacing: '0.1em',
                }}
              >
                HOST
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ==================== */}
      {/* CAMERA BAR - BOTTOM  */}
      {/* ==================== */}
      <div
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: `${CAM_BAR_HEIGHT}px`,
          display: 'flex',
        }}
      >
        {slotEntries.map(({ num, slot }) => (
          <CameraSlot
            key={num}
            slotNum={num}
            slot={slot}
            stream={streams[String(num)] ?? null}
            score={slot ? (scores[slot.twitchId] || 0) : null}
          />
        ))}
      </div>
    </div>
  );
}

// ==================
// LOBBY DISPLAY
// ==================
function LobbyDisplay() {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ textAlign: 'center' }}
    >
      <motion.div
        initial={{ opacity: 0, y: -30 }}
        animate={{ opacity: 1, y: 0 }}
        style={{
          fontFamily: "'Bebas Neue'",
          fontSize: '7.5rem',
          letterSpacing: '0.1em',
          background: 'linear-gradient(135deg, #EF4444, #EC4899, #7C3AED)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '10px',
          lineHeight: 1,
        }}
      >
        LÜGEN DARF MAN NICHT SAGEN!
      </motion.div>
      <div
        style={{
          fontSize: '1.6rem',
          color: '#6B7280',
          letterSpacing: '0.3em',
          textTransform: 'uppercase',
        }}
      >
        Warte auf Start · Schmilley Games
      </div>
    </motion.div>
  );
}

// ==================
// DRAWING DISPLAY
// ==================
function DrawingDisplay({
  timeLeft,
  slotEntries,
}: {
  timeLeft: number | null;
  slotEntries: any[];
}) {
  const submitted = slotEntries.filter((e) => e.slot?.submitted).length;
  const total = slotEntries.filter((e) => e.slot).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ textAlign: 'center' }}
    >
      <div
        style={{
          fontFamily: "'Bebas Neue'",
          fontSize: '5.5rem',
          letterSpacing: '0.2em',
          color: '#7C3AED',
          marginBottom: '20px',
        }}
      >
        ALLE ZEICHNEN...
      </div>
      <div
        style={{
          display: 'flex',
          gap: '16px',
          justifyContent: 'center',
          marginBottom: '28px',
        }}
      >
        {slotEntries
          .filter((e) => e.slot)
          .map(({ num, slot }) => (
            <motion.div
              key={num}
              animate={slot.submitted ? { scale: [1, 1.2, 1] } : {}}
              style={{
                width: '64px',
                height: '64px',
                borderRadius: '50%',
                border: `3px solid ${slot.submitted ? '#10B981' : 'rgba(255,255,255,0.15)'}`,
                background: slot.submitted ? 'rgba(16,185,129,0.2)' : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: slot.submitted ? '28px' : '0',
                transition: 'all 0.4s',
                boxShadow: slot.submitted ? '0 0 20px rgba(16,185,129,0.5)' : 'none',
              }}
            >
              {slot.submitted ? '✓' : ''}
            </motion.div>
          ))}
      </div>
      <div style={{ color: '#6B7280', fontSize: '1.4rem', letterSpacing: '0.2em' }}>
        {submitted} / {total} abgegeben
      </div>
    </motion.div>
  );
}

// ==================
// REVEAL DISPLAY
// ==================
function RevealDisplay({
  slotEntries,
  revealedSlots,
  round,
}: {
  slotEntries: any[];
  revealedSlots: number[];
  round: any;
}) {
  const revealed = slotEntries.filter(
    ({ num, slot }) => revealedSlots.includes(num) && slot?.drawing
  );

  return (
    <div style={{ width: '100%', paddingLeft: '40px', paddingRight: '40px' }}>
      {revealed.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            fontFamily: "'Bebas Neue'",
            fontSize: '5.5rem',
            letterSpacing: '0.3em',
            color: 'rgba(255,255,255,0.2)',
            textAlign: 'center',
          }}
        >
          REVEAL
        </motion.div>
      ) : (
        <div
          style={{
            display: 'flex',
            gap: '20px',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <AnimatePresence>
            {revealed.map(({ num, slot }) => (
              <motion.div
                key={num}
                initial={{ opacity: 0, scale: 0.7, y: 40 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ type: 'spring', stiffness: 280, damping: 24 }}
                style={{
                  background: 'rgba(10,10,15,0.95)',
                  backdropFilter: 'blur(20px)',
                  border: '2px solid rgba(245,158,11,0.4)',
                  borderRadius: '18px',
                  overflow: 'hidden',
                  boxShadow:
                    '0 0 50px rgba(245,158,11,0.2), 0 20px 60px rgba(0,0,0,0.6)',
                  width:
                    revealed.length <= 2
                      ? '420px'
                      : revealed.length === 3
                      ? '360px'
                      : '300px',
                }}
              >
                <img
                  src={slot.drawing}
                  style={{ width: '100%', display: 'block' }}
                  alt=""
                />
                <div
                  style={{
                    padding: '14px 18px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    background: 'rgba(0,0,0,0.4)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Bebas Neue'",
                      fontSize: '1.8rem',
                      color: '#F59E0B',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {num}
                  </div>
                  <img
                    src={slot.profileImageUrl}
                    style={{ width: '34px', height: '34px', borderRadius: '50%' }}
                    alt=""
                  />
                  <span
                    style={{
                      fontSize: '17px',
                      color: '#E5E7EB',
                      flex: 1,
                      fontWeight: 600,
                    }}
                  >
                    {slot.displayName}
                  </span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}

// ==================
// SCORING DISPLAY
// ==================
function ScoringDisplay({
  slotEntries,
  scores,
}: {
  slotEntries: any[];
  scores: Record<string, number>;
}) {
  const players = slotEntries
    .filter((e) => e.slot)
    .sort(
      (a, b) => (scores[b.slot.twitchId] || 0) - (scores[a.slot.twitchId] || 0)
    );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '14px',
        width: '720px',
      }}
    >
      <div
        style={{
          fontFamily: "'Bebas Neue'",
          fontSize: '5rem',
          letterSpacing: '0.3em',
          background: 'linear-gradient(135deg, #F59E0B, #F97316)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '10px',
        }}
      >
        SCOREBOARD
      </div>
      {players.map(({ slot }, i) => (
        <motion.div
          key={slot.twitchId}
          layout
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: i * 0.08 }}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '20px',
            background: 'rgba(10,10,15,0.9)',
            backdropFilter: 'blur(20px)',
            border:
              i === 0
                ? '2px solid rgba(245,158,11,0.5)'
                : '1px solid rgba(255,255,255,0.07)',
            borderRadius: '16px',
            padding: '16px 24px',
            width: '100%',
            boxShadow: i === 0 ? '0 0 40px rgba(245,158,11,0.2)' : 'none',
          }}
        >
          <span
            style={{
              fontFamily: "'Bebas Neue'",
              fontSize: '2.5rem',
              color: i === 0 ? '#F59E0B' : 'rgba(255,255,255,0.2)',
              width: '48px',
            }}
          >
            {i + 1}
          </span>
          <img
            src={slot.profileImageUrl}
            style={{
              width: '58px',
              height: '58px',
              borderRadius: '50%',
              border: '2px solid rgba(124,58,237,0.5)',
            }}
            alt=""
          />
          <span style={{ flex: 1, fontSize: '24px', fontWeight: 600, color: 'white' }}>
            {slot.displayName}
            {i === 0 && ' 👑'}
          </span>
          <motion.span
            key={scores[slot.twitchId]}
            animate={{ scale: [1, 1.3, 1] }}
            style={{
              fontFamily: "'Bebas Neue'",
              fontSize: '3rem',
              background: 'linear-gradient(135deg, #F59E0B, #F97316)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            {scores[slot.twitchId] || 0}
          </motion.span>
        </motion.div>
      ))}
    </motion.div>
  );
}

// ==================
// CAMERA SLOT
// ==================
function CameraSlot({
  slotNum,
  slot,
  stream,
  score,
}: {
  slotNum: number;
  slot: SlotData | null;
  stream: MediaStream | null;
  score: number | null;
}) {
  const isActive = slot?.connected;

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        position: 'relative',
        background: '#000',
        borderTop: isActive
          ? '3px solid rgba(124,58,237,0.7)'
          : '3px solid rgba(255,255,255,0.04)',
        borderLeft: slotNum > 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition: 'border-color 0.3s',
        overflow: 'hidden',
      }}
    >
      {/* ── Video stream (16:9 enforced by parent height) ── */}
      {stream ? (
        <StreamVideo stream={stream} />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            background: '#0a0a0f',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '10px',
          }}
        >
          {slot?.profileImageUrl ? (
            <img
              src={slot.profileImageUrl}
              style={{
                width: '80px',
                height: '80px',
                borderRadius: '50%',
                opacity: slot.connected ? 0.7 : 0.3,
              }}
              alt=""
            />
          ) : (
            <div style={{ color: '#333', fontSize: '36px' }}>📷</div>
          )}
          {slot && !slot.connected && (
            <div style={{ color: '#333', fontSize: '13px' }}>Getrennt</div>
          )}
        </div>
      )}

      {/* Slot number badge */}
      <div
        style={{
          position: 'absolute',
          top: '10px',
          left: '10px',
          fontFamily: "'Bebas Neue'",
          fontSize: '1.8rem',
          color: 'rgba(255,255,255,0.35)',
          lineHeight: 1,
          textShadow: '0 1px 4px rgba(0,0,0,0.9)',
        }}
      >
        {slotNum}
      </div>

      {/* Name + score bar */}
      {slot && (
        <div
          style={{
            position: 'absolute',
            bottom: 0, left: 0, right: 0,
            background: 'linear-gradient(transparent, rgba(0,0,0,0.92))',
            padding: '32px 14px 12px',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: slot.connected ? '#10B981' : '#374151',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                fontSize: '17px',
                fontWeight: 700,
                color: 'white',
                textShadow: '0 1px 6px rgba(0,0,0,0.9)',
              }}
            >
              {slot.displayName}
            </span>
            {slot.submitted && (
              <span style={{ fontSize: '14px', color: '#10B981' }}>✓</span>
            )}
          </div>
          {score !== null && score > 0 && (
            <motion.span
              key={score}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.4 }}
              style={{
                fontFamily: "'Bebas Neue'",
                fontSize: '1.8rem',
                background: 'linear-gradient(135deg, #F59E0B, #F97316)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}
            >
              {score}
            </motion.span>
          )}
        </div>
      )}

      {/* Active glow border */}
      {isActive && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            border: '2px solid rgba(124,58,237,0.5)',
            pointerEvents: 'none',
            boxShadow: 'inset 0 0 24px rgba(124,58,237,0.12)',
          }}
        />
      )}
    </div>
  );
}
