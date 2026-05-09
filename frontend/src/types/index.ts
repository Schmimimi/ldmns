export type Phase = 'LOBBY' | 'DRAWING' | 'REVEAL' | 'SCORING';

export interface TwitchUser {
  id: string;
  login: string;
  display_name: string;
  profile_image_url: string;
}

export interface SlotData {
  twitchId: string;
  displayName: string;
  profileImageUrl: string;
  vdoId: string | null;
  connected: boolean;
  socketId: string | null;
  drawing: string | null;
  submitted: boolean;
}

export interface Round {
  taskA: string;
  taskB: string;
  imposterCount: number;
  roles: Record<string, 'innocent' | 'imposter'>;
  revealedSlots: number[];
  timerEnd: number | null;
}

export interface GameState {
  phase: Phase;
  slots: Record<string, SlotData | null>;
  hostVdoId: string | null;
  round: Round;
  scores: Record<string, number>;
  whitelist: string[];
}
