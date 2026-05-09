import {
  getState,
  updateState,
  updateSlot,
  findSlotByTwitchId,
  findFreeSlot,
  resetRound,
} from '../state.js';

const ADMIN_SECRET = process.env.ADMIN_SECRET || 'admin123';

export function setupSocketHandlers(io) {
  const broadcast = () => io.emit('state_sync', getState());

  io.on('connection', (socket) => {
    console.log(`[+] ${socket.id}`);

    // Always send current state on connect
    socket.emit('state_sync', getState());

    // =====================
    // PLAYER EVENTS
    // =====================

    socket.on('join_lobby', ({ twitchUser }) => {
      const state = getState();

      // Whitelist check
      if (
        state.whitelist.length > 0 &&
        !state.whitelist.includes(twitchUser.login.toLowerCase())
      ) {
        socket.emit('join_error', { message: 'Du bist nicht auf der Whitelist.' });
        return;
      }

      // Reconnect to existing slot by Twitch ID
      let slotNum = findSlotByTwitchId(twitchUser.id);

      if (slotNum) {
        const existing = state.slots[String(slotNum)];
        updateSlot(slotNum, { ...existing, connected: true, socketId: socket.id });
        socket.data = { twitchId: twitchUser.id, slotNum, isAdmin: false };

        // Re-send task on reconnect if round is active
        const role = state.round.roles[twitchUser.id];
        if (role && (state.phase === 'DRAWING' || state.phase === 'REVEAL')) {
          const task = role === 'innocent' ? state.round.taskA : state.round.taskB;
          socket.emit('your_task', { task, role });
        }

        broadcast();
        console.log(`[Reconnect] ${twitchUser.display_name} → Slot ${slotNum}`);
        return;
      }

      // New player → auto-assign first free slot
      slotNum = findFreeSlot();
      if (!slotNum) {
        socket.emit('join_error', { message: 'Alle Plätze sind belegt (max. 4).' });
        return;
      }

      updateSlot(slotNum, {
        twitchId: twitchUser.id,
        displayName: twitchUser.display_name,
        profileImageUrl: twitchUser.profile_image_url,
        vdoId: null,
        connected: true,
        socketId: socket.id,
        drawing: null,
        submitted: false,
      });

      socket.data = { twitchId: twitchUser.id, slotNum, isAdmin: false };
      broadcast();
      console.log(`[Join] ${twitchUser.display_name} → Slot ${slotNum}`);
    });

    socket.on('take_slot', ({ slotNum, twitchUser }) => {
      const state = getState();
      const slotKey = String(slotNum);

      if (state.slots[slotKey] && state.slots[slotKey].twitchId !== twitchUser.id) {
        socket.emit('join_error', { message: 'Dieser Platz ist bereits besetzt.' });
        return;
      }

      // Remove from current slot first
      const currentSlot = findSlotByTwitchId(twitchUser.id);
      if (currentSlot && currentSlot !== slotNum) {
        updateSlot(currentSlot, null);
      }

      const existing = state.slots[slotKey];
      updateSlot(slotNum, {
        twitchId: twitchUser.id,
        displayName: twitchUser.display_name,
        profileImageUrl: twitchUser.profile_image_url,
        vdoId: existing?.vdoId || null,
        connected: true,
        socketId: socket.id,
        drawing: existing?.drawing || null,
        submitted: existing?.submitted || false,
      });

      socket.data = { twitchId: twitchUser.id, slotNum, isAdmin: false };
      broadcast();
    });

    socket.on('leave_slot', () => {
      const { twitchId } = socket.data || {};
      if (!twitchId) return;
      const slotNum = findSlotByTwitchId(twitchId);
      if (slotNum) {
        updateSlot(slotNum, null);
        broadcast();
      }
      socket.data = {};
    });

    socket.on('set_vdo_id', ({ vdoId }) => {
      const { twitchId } = socket.data || {};
      if (!twitchId) return;
      const slotNum = findSlotByTwitchId(twitchId);
      if (!slotNum) return;
      const state = getState();
      updateSlot(slotNum, { ...state.slots[String(slotNum)], vdoId: vdoId.trim() });
      broadcast();
    });

    socket.on('submit_drawing', ({ drawing }) => {
      const { twitchId } = socket.data || {};
      if (!twitchId) return;
      const slotNum = findSlotByTwitchId(twitchId);
      if (!slotNum) return;
      const state = getState();
      updateSlot(slotNum, { ...state.slots[String(slotNum)], drawing, submitted: true });
      broadcast();
      console.log(`[Draw] Slot ${slotNum} submitted`);
    });

    // =====================
    // ADMIN EVENTS
    // =====================

    socket.on('admin_auth', ({ secret }) => {
      if (secret === ADMIN_SECRET) {
        socket.data = { ...socket.data, isAdmin: true };
        socket.emit('admin_authenticated');
        socket.emit('state_sync', getState());
        console.log(`[Admin] Authenticated: ${socket.id}`);
      } else {
        socket.emit('join_error', { message: 'Falsches Admin-Passwort.' });
      }
    });

    socket.on('admin_set_whitelist', ({ whitelist }) => {
      // Normalize to lowercase login names
      const normalized = whitelist.map(s => s.trim().toLowerCase()).filter(Boolean);
      updateState({ whitelist: normalized });
      broadcast();
    });

    socket.on('admin_set_tasks', ({ taskA, taskB, imposterCount }) => {
      const state = getState();
      updateState({ round: { ...state.round, taskA, taskB, imposterCount } });
      broadcast();
    });

    socket.on('admin_start_round', () => {
      const state = getState();
      const activePlayers = Object.values(state.slots).filter(Boolean);

      if (activePlayers.length === 0) return;

      // Assign roles randomly
      const shuffled = [...activePlayers].sort(() => Math.random() - 0.5);
      const roles = {};
      shuffled.forEach((player, i) => {
        roles[player.twitchId] = i < state.round.imposterCount ? 'imposter' : 'innocent';
      });

      // Clear drawings
      for (let i = 1; i <= 4; i++) {
        const slot = state.slots[String(i)];
        if (slot) updateSlot(i, { ...slot, drawing: null, submitted: false });
      }

      updateState({
        phase: 'DRAWING',
        round: { ...state.round, roles, revealedSlots: [], timerEnd: null },
      });

      // Private task per player
      const fresh = getState();
      for (const slot of Object.values(fresh.slots)) {
        if (!slot || !slot.socketId) continue;
        const role = roles[slot.twitchId];
        if (!role) continue;
        const task = role === 'innocent' ? fresh.round.taskA : fresh.round.taskB;
        const playerSocket = io.sockets.sockets.get(slot.socketId);
        if (playerSocket) playerSocket.emit('your_task', { task, role });
      }

      broadcast();
      console.log('[Admin] Runde gestartet, Rollen:', roles);
    });

    socket.on('admin_reveal_slot', ({ slotNum }) => {
      const state = getState();
      const revealedSlots = [...(state.round.revealedSlots || [])];
      if (!revealedSlots.includes(Number(slotNum))) revealedSlots.push(Number(slotNum));
      updateState({
        phase: 'REVEAL',
        round: { ...state.round, revealedSlots },
      });
      broadcast();
    });

    socket.on('admin_hide_slot', ({ slotNum }) => {
      const state = getState();
      const revealedSlots = (state.round.revealedSlots || []).filter(n => n !== Number(slotNum));
      updateState({ round: { ...state.round, revealedSlots } });
      broadcast();
    });

    socket.on('admin_award_points', ({ twitchId, points }) => {
      const state = getState();
      const scores = { ...state.scores };
      scores[twitchId] = (scores[twitchId] || 0) + points;
      updateState({ scores });
      broadcast();
    });

    socket.on('admin_set_score', ({ twitchId, score }) => {
      const state = getState();
      const scores = { ...state.scores };
      scores[twitchId] = score;
      updateState({ scores });
      broadcast();
    });

    socket.on('admin_set_phase', ({ phase }) => {
      updateState({ phase });
      broadcast();
    });

    socket.on('admin_kick_player', ({ slotNum }) => {
      const state = getState();
      const slot = state.slots[String(slotNum)];
      if (slot?.socketId) {
        const target = io.sockets.sockets.get(slot.socketId);
        if (target) target.emit('kicked');
      }
      updateSlot(slotNum, null);
      broadcast();
    });

    socket.on('admin_start_timer', ({ seconds }) => {
      const state = getState();
      const timerEnd = Date.now() + seconds * 1000;
      updateState({ round: { ...state.round, timerEnd } });
      broadcast();
    });

    socket.on('admin_stop_timer', () => {
      const state = getState();
      updateState({ round: { ...state.round, timerEnd: null } });
      broadcast();
    });

    socket.on('admin_reset_round', () => {
      resetRound();
      broadcast();
    });

    socket.on('admin_reset_scores', () => {
      updateState({ scores: {} });
      broadcast();
    });

    socket.on('admin_set_host_vdo', ({ vdoId }) => {
      updateState({ hostVdoId: vdoId ? vdoId.trim() : null });
      broadcast();
    });

    socket.on('admin_clear_slot', ({ slotNum }) => {
      updateSlot(slotNum, null);
      broadcast();
    });

    // =====================
    // DISCONNECT
    // =====================
    socket.on('disconnect', () => {
      const { twitchId } = socket.data || {};
      if (twitchId) {
        const slotNum = findSlotByTwitchId(twitchId);
        if (slotNum) {
          const state = getState();
          const slot = state.slots[String(slotNum)];
          if (slot) updateSlot(slotNum, { ...slot, connected: false, socketId: null });
          broadcast();
        }
      }
      console.log(`[-] ${socket.id}`);
    });
  });
}
