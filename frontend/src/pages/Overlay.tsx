import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { useOverlaySocket } from '../hooks/useSocket';
import type { SlotData } from '../types';

const VDO_BASE = 'https://vdo.ninja';
const VDO_PARAMS = '&noaudio&width=1280&height=720&framerate=30';

export default function Overlay() {
  useOverlaySocket();
  const { gameState } = useStore();
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

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

  const slotEntries = Array.from({ length: 6 }, (_, i) => ({
    num: i + 1,
    slot: (slots[String(i + 1)] as SlotData | null) ?? null,
  }));

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
          bottom: '270px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {/* LOBBY PHASE */}
        {phase === 'LOBBY' && <LobbyDisplay slotEntries={slotEntries} scores={scores} />}

        {/* DRAWING PHASE */}
        {phase === 'DRAWING' && <DrawingDisplay timeLeft={timeLeft} slotEntries={slotEntries} />}

        {/* REVEAL PHASE */}
        {phase === 'REVEAL' && (
          <RevealDisplay slotEntries={slotEntries} revealedSlots={revealedSlots} round={round} />
        )}

        {/* SCORING PHASE */}
        {phase === 'SCORING' && <ScoringDisplay slotEntries={slotEntries} scores={scores} />}
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
              borderRadius: '16px',
              padding: '10px 32px',
              boxShadow: timeLeft <= 10 ? '0 0 40px rgba(239,68,68,0.3)' : '0 0 20px rgba(245,158,11,0.2)',
            }}
          >
            <span
              style={{
                fontFamily: "'Bebas Neue'",
                fontSize: '3.5rem',
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
      {/* CAMERA BAR - BOTTOM  */}
      {/* ==================== */}
      <div
        style={{
          position: 'absolute',
          bottom: 0, left: 0, right: 0,
          height: '270px',
          display: 'flex',
        }}
      >
        {slotEntries.map(({ num, slot }) => (
          <CameraSlot
            key={num}
            slotNum={num}
            slot={slot}
            score={slot ? (scores[slot.twitchId] || 0) : null}
            phase={phase}
          />
        ))}
      </div>
    </div>
  );
}

// ==================
// LOBBY DISPLAY
// ==================
function LobbyDisplay({ slotEntries, scores }: { slotEntries: any[]; scores: Record<string, number> }) {
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
          fontSize: '6rem',
          letterSpacing: '0.1em',
          background: 'linear-gradient(135deg, #EF4444, #EC4899, #7C3AED)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '8px',
          lineHeight: 1,
        }}
      >
        LÜGEN DARF MAN NICHT SAGEN!
      </motion.div>
      <div style={{ fontSize: '1.2rem', color: '#6B7280', letterSpacing: '0.3em', textTransform: 'uppercase' }}>
        Warte auf Start · Schmilley Games
      </div>
    </motion.div>
  );
}

// ==================
// DRAWING DISPLAY
// ==================
function DrawingDisplay({ timeLeft, slotEntries }: { timeLeft: number | null; slotEntries: any[] }) {
  const submitted = slotEntries.filter(e => e.slot?.submitted).length;
  const total = slotEntries.filter(e => e.slot).length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ textAlign: 'center' }}
    >
      <div
        style={{
          fontFamily: "'Bebas Neue'",
          fontSize: '4rem',
          letterSpacing: '0.2em',
          color: '#7C3AED',
          marginBottom: '16px',
        }}
      >
        ALLE ZEICHNEN...
      </div>

      {/* Submission progress */}
      <div
        style={{
          display: 'flex',
          gap: '12px',
          justifyContent: 'center',
          marginBottom: '24px',
        }}
      >
        {slotEntries.filter(e => e.slot).map(({ num, slot }) => (
          <motion.div
            key={num}
            animate={slot.submitted ? { scale: [1, 1.2, 1] } : {}}
            style={{
              width: '48px',
              height: '48px',
              borderRadius: '50%',
              border: `2px solid ${slot.submitted ? '#10B981' : 'rgba(255,255,255,0.15)'}`,
              background: slot.submitted ? 'rgba(16,185,129,0.2)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: slot.submitted ? '20px' : '0',
              transition: 'all 0.4s',
              boxShadow: slot.submitted ? '0 0 16px rgba(16,185,129,0.5)' : 'none',
            }}
          >
            {slot.submitted ? '✓' : ''}
          </motion.div>
        ))}
      </div>

      <div style={{ color: '#6B7280', fontSize: '1rem', letterSpacing: '0.2em' }}>
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
  const revealed = slotEntries.filter(({ num }) => revealedSlots.includes(num) && slotEntries.find(e => e.num === num)?.slot?.drawing);

  return (
    <div style={{ width: '100%', paddingLeft: '40px', paddingRight: '40px' }}>
      {revealed.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            fontFamily: "'Bebas Neue'",
            fontSize: '4rem',
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
            gap: '16px',
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
                  border: '1px solid rgba(245,158,11,0.4)',
                  borderRadius: '16px',
                  overflow: 'hidden',
                  boxShadow: '0 0 40px rgba(245,158,11,0.2), 0 20px 60px rgba(0,0,0,0.6)',
                  width: revealed.length <= 3 ? '320px' : '240px',
                }}
              >
                <img
                  src={slot.drawing}
                  style={{ width: '100%', display: 'block' }}
                />
                <div
                  style={{
                    padding: '10px 14px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    background: 'rgba(0,0,0,0.4)',
                  }}
                >
                  <div
                    style={{
                      fontFamily: "'Bebas Neue'",
                      fontSize: '1.4rem',
                      color: '#F59E0B',
                      letterSpacing: '0.05em',
                    }}
                  >
                    {num}
                  </div>
                  <img src={slot.profileImageUrl} style={{ width: '28px', height: '28px', borderRadius: '50%' }} />
                  <span style={{ fontSize: '14px', color: '#E5E7EB', flex: 1, fontWeight: 600 }}>
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
function ScoringDisplay({ slotEntries, scores }: { slotEntries: any[]; scores: Record<string, number> }) {
  const players = slotEntries
    .filter(e => e.slot)
    .sort((a, b) => (scores[b.slot.twitchId] || 0) - (scores[a.slot.twitchId] || 0));

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', width: '600px' }}
    >
      <div
        style={{
          fontFamily: "'Bebas Neue'",
          fontSize: '4rem',
          letterSpacing: '0.3em',
          background: 'linear-gradient(135deg, #F59E0B, #F97316)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '8px',
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
            gap: '16px',
            background: 'rgba(10,10,15,0.9)',
            backdropFilter: 'blur(20px)',
            border: i === 0 ? '1px solid rgba(245,158,11,0.5)' : '1px solid rgba(255,255,255,0.07)',
            borderRadius: '14px',
            padding: '12px 20px',
            width: '100%',
            boxShadow: i === 0 ? '0 0 30px rgba(245,158,11,0.2)' : 'none',
          }}
        >
          <span
            style={{
              fontFamily: "'Bebas Neue'",
              fontSize: '2rem',
              color: i === 0 ? '#F59E0B' : 'rgba(255,255,255,0.2)',
              width: '40px',
            }}
          >
            {i + 1}
          </span>
          <img
            src={slot.profileImageUrl}
            style={{ width: '48px', height: '48px', borderRadius: '50%', border: '2px solid rgba(124,58,237,0.5)' }}
          />
          <span style={{ flex: 1, fontSize: '20px', fontWeight: 600, color: 'white' }}>
            {slot.displayName}
            {i === 0 && ' 👑'}
          </span>
          <motion.span
            key={scores[slot.twitchId]}
            animate={{ scale: [1, 1.3, 1] }}
            style={{
              fontFamily: "'Bebas Neue'",
              fontSize: '2.5rem',
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
  score,
  phase,
}: {
  slotNum: number;
  slot: SlotData | null;
  score: number | null;
  phase: string;
}) {
  const vdoUrl = slot?.vdoId
    ? `${VDO_BASE}/?view=${encodeURIComponent(slot.vdoId)}${VDO_PARAMS}`
    : null;

  const isActive = slot?.connected;

  return (
    <div
      style={{
        flex: 1,
        height: '100%',
        position: 'relative',
        background: '#000',
        borderTop: isActive ? '2px solid rgba(124,58,237,0.7)' : '2px solid rgba(255,255,255,0.04)',
        borderLeft: slotNum > 1 ? '1px solid rgba(255,255,255,0.04)' : 'none',
        transition: 'border-color 0.3s',
        overflow: 'hidden',
      }}
    >
      {/* VDO.Ninja iframe or placeholder */}
      {vdoUrl ? (
        <iframe
          src={vdoUrl}
          allow="camera;microphone;fullscreen;picture-in-picture;display-capture"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
        />
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
            gap: '8px',
          }}
        >
          {slot?.profileImageUrl ? (
            <img
              src={slot.profileImageUrl}
              style={{ width: '64px', height: '64px', borderRadius: '50%', opacity: slot.connected ? 0.7 : 0.3 }}
            />
          ) : (
            <div style={{ color: '#333', fontSize: '28px' }}>📷</div>
          )}
          {!slot?.vdoId && slot && (
            <div style={{ color: '#333', fontSize: '11px' }}>Kein VDO Link</div>
          )}
        </div>
      )}

      {/* Slot number badge */}
      <div
        style={{
          position: 'absolute',
          top: '8px',
          left: '8px',
          fontFamily: "'Bebas Neue'",
          fontSize: '1.4rem',
          color: 'rgba(255,255,255,0.3)',
          lineHeight: 1,
          textShadow: '0 1px 3px rgba(0,0,0,0.8)',
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
            background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
            padding: '24px 10px 8px',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <div
              style={{
                width: '6px', height: '6px',
                borderRadius: '50%',
                background: slot.connected ? '#10B981' : '#374151',
              }}
            />
            <span
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: 'white',
                textShadow: '0 1px 4px rgba(0,0,0,0.8)',
              }}
            >
              {slot.displayName}
            </span>
            {slot.submitted && (
              <span style={{ fontSize: '11px', color: '#10B981' }}>✓</span>
            )}
          </div>
          {score !== null && score > 0 && (
            <motion.span
              key={score}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ duration: 0.4 }}
              style={{
                fontFamily: "'Bebas Neue'",
                fontSize: '1.4rem',
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
            boxShadow: 'inset 0 0 20px rgba(124,58,237,0.1)',
          }}
        />
      )}
    </div>
  );
}
