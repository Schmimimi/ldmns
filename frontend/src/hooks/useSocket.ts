import { useEffect } from 'react';
import { io, Socket } from 'socket.io-client';
import { useStore } from '../store';

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(BACKEND_URL, { autoConnect: false });
  }
  return socket;
}

export function useLDMNSocket() {
  const { twitchUser, setGameState, setConnected, setMyTask } = useStore();
  const s = getSocket();

  useEffect(() => {
    s.connect();

    s.on('connect', () => {
      setConnected(true);
      if (twitchUser) {
        s.emit('join_lobby', { twitchUser });
      }
    });

    s.on('disconnect', () => setConnected(false));

    s.on('state_sync', (state) => setGameState(state));

    s.on('your_task', ({ task, role }: { task: string; role: 'innocent' | 'imposter' }) => {
      setMyTask(task, role);
    });

    s.on('kicked', () => {
      window.location.href = '/';
    });

    return () => {
      s.off('connect');
      s.off('disconnect');
      s.off('state_sync');
      s.off('your_task');
      s.off('kicked');
      s.disconnect();
      setConnected(false);
    };
  }, [twitchUser]);

  return s;
}

export function useOverlaySocket() {
  const { setGameState, setConnected } = useStore();
  const s = getSocket();

  useEffect(() => {
    s.connect();
    s.on('connect', () => setConnected(true));
    s.on('disconnect', () => setConnected(false));
    s.on('state_sync', (state) => setGameState(state));

    return () => {
      s.off('connect');
      s.off('disconnect');
      s.off('state_sync');
      s.disconnect();
      setConnected(false);
    };
  }, []);

  return s;
}
