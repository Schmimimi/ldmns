import fs from 'fs';

const STATE_FILE = './game-state.json';

const initSlots = () => {
  const s = {};
  for (let i = 1; i <= 6; i++) s[String(i)] = null;
  return s;
};

const defaultState = {
  phase: 'LOBBY',
  slots: initSlots(),
  round: {
    taskA: '',
    taskB: '',
    imposterCount: 1,
    roles: {},
    revealedSlots: [],
    timerEnd: null,
  },
  scores: {},
  whitelist: [],
};

let state = JSON.parse(JSON.stringify(defaultState));

if (fs.existsSync(STATE_FILE)) {
  try {
    const loaded = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
    state = loaded;
    // Mark all players as disconnected after restart
    for (const k of Object.keys(state.slots)) {
      if (state.slots[k]) {
        state.slots[k].connected = false;
        state.slots[k].socketId = null;
      }
    }
  } catch (e) {
    console.error('Failed to load state file:', e.message);
  }
}

function save() {
  try {
    fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  } catch (e) {
    console.error('Failed to save state:', e.message);
  }
}

export function getState() {
  return state;
}

export function updateState(updates) {
  Object.assign(state, updates);
  save();
  return state;
}

export function updateSlot(slotNum, data) {
  state.slots[String(slotNum)] = data;
  save();
}

export function findSlotByTwitchId(twitchId) {
  for (const [num, slot] of Object.entries(state.slots)) {
    if (slot && slot.twitchId === twitchId) return Number(num);
  }
  return null;
}

export function findFreeSlot() {
  for (let i = 1; i <= 6; i++) {
    if (!state.slots[String(i)]) return i;
  }
  return null;
}

export function resetRound() {
  for (const k of Object.keys(state.slots)) {
    if (state.slots[k]) {
      state.slots[k].drawing = null;
      state.slots[k].submitted = false;
    }
  }
  state.round = {
    taskA: '',
    taskB: '',
    imposterCount: 1,
    roles: {},
    revealedSlots: [],
    timerEnd: null,
  };
  state.phase = 'LOBBY';
  save();
  return state;
}
