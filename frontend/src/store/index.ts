import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { TwitchUser, GameState } from '../types';

interface AppStore {
  twitchUser: TwitchUser | null;
  setTwitchUser: (user: TwitchUser | null) => void;

  gameState: GameState | null;
  setGameState: (gs: GameState | null) => void;

  connected: boolean;
  setConnected: (v: boolean) => void;

  myTask: string | null;
  myRole: 'innocent' | 'imposter' | null;
  setMyTask: (task: string, role: 'innocent' | 'imposter') => void;
  clearMyTask: () => void;

  adminAuthed: boolean;
  setAdminAuthed: (v: boolean) => void;
}

export const useStore = create<AppStore>()(
  persist(
    (set) => ({
      twitchUser: null,
      setTwitchUser: (user) => set({ twitchUser: user }),

      gameState: null,
      setGameState: (gs) => set({ gameState: gs }),

      connected: false,
      setConnected: (v) => set({ connected: v }),

      myTask: null,
      myRole: null,
      setMyTask: (task, role) => set({ myTask: task, myRole: role }),
      clearMyTask: () => set({ myTask: null, myRole: null }),

      adminAuthed: false,
      setAdminAuthed: (v) => set({ adminAuthed: v }),
    }),
    {
      name: 'ldmns-store',
      partialize: (state) => ({
        twitchUser: state.twitchUser,
        adminAuthed: state.adminAuthed,
      }),
    }
  )
);
