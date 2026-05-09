import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from './useSocket';

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  // Free TURN relay as fallback for symmetric NAT (4G/5G, strict firewalls)
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject',
  },
];

export type SlotId = string | number;

// ─────────────────────────────────────────────────────────────────────────────
// BROADCASTER – used in PlayerPanel (for player cam) and AdminPanel (host cam)
// ─────────────────────────────────────────────────────────────────────────────
export function useCamBroadcaster(slotId: SlotId) {
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [active, setActive] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  const slotKey = String(slotId);

  // Enumerate cameras (works after first getUserMedia call for full labels)
  const refreshCameras = useCallback(async () => {
    const devices = await navigator.mediaDevices.enumerateDevices().catch(() => []);
    const cams = devices.filter((d) => d.kind === 'videoinput');
    setCameras(cams);
    if (cams.length > 0 && !selectedDeviceId) {
      setSelectedDeviceId(cams[0].deviceId);
    }
  }, [selectedDeviceId]);

  useEffect(() => {
    refreshCameras();
    // Re-enumerate when devices change
    navigator.mediaDevices.addEventListener('devicechange', refreshCameras);
    return () => navigator.mediaDevices.removeEventListener('devicechange', refreshCameras);
  }, []);

  const startCamera = useCallback(
    async (deviceId?: string) => {
      try {
        setCamError(null);
        // Stop previous stream
        streamRef.current?.getTracks().forEach((t) => t.stop());

        const id = deviceId ?? selectedDeviceId;
        const stream = await navigator.mediaDevices.getUserMedia({
          video: id
            ? { deviceId: { exact: id }, width: { ideal: 1280 }, height: { ideal: 720 } }
            : { width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });

        streamRef.current = stream;
        setLocalStream(stream);
        setActive(true);

        // Re-enumerate with labels now available
        await refreshCameras();

        // Tell backend this cam slot is live
        getSocket().emit('cam_start', { slotId: slotKey });

        // Close stale peer connections so they re-request
        Object.values(peersRef.current).forEach((pc) => pc.close());
        peersRef.current = {};
      } catch (e: any) {
        setCamError(
          e?.name === 'NotAllowedError'
            ? 'Kamerazugriff verweigert – bitte in den Browser-Einstellungen erlauben.'
            : `Kamera-Fehler: ${e?.message ?? e}`
        );
      }
    },
    [selectedDeviceId, slotKey, refreshCameras]
  );

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setLocalStream(null);
    setActive(false);
    Object.values(peersRef.current).forEach((pc) => pc.close());
    peersRef.current = {};
    getSocket().emit('cam_stop', { slotId: slotKey });
  }, [slotKey]);

  // WebRTC signaling: respond to viewer requests
  useEffect(() => {
    const socket = getSocket();

    const handleRtc = async ({ from, data }: { from: string; data: any }) => {
      // Viewer is requesting our stream
      if (data.type === 'request' && String(data.slotId) === slotKey) {
        const stream = streamRef.current;
        if (!stream) return;

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peersRef.current[from] = pc;

        stream.getTracks().forEach((track) => pc.addTrack(track, stream));

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('rtc', { to: from, data: { type: 'ice', candidate: e.candidate } });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            delete peersRef.current[from];
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('rtc', { to: from, data: { type: 'offer', sdp: offer, slotId: slotKey } });
      }

      // Viewer answered our offer
      if (data.type === 'answer' && peersRef.current[from]) {
        await peersRef.current[from]
          .setRemoteDescription(new RTCSessionDescription(data.sdp))
          .catch(console.error);
      }

      // ICE candidate from viewer
      if (data.type === 'ice' && peersRef.current[from]) {
        await peersRef.current[from]
          .addIceCandidate(new RTCIceCandidate(data.candidate))
          .catch(console.error);
      }
    };

    socket.on('rtc', handleRtc);
    return () => {
      socket.off('rtc', handleRtc);
    };
  }, [slotKey]);

  // On unmount: stop everything
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      Object.values(peersRef.current).forEach((pc) => pc.close());
      getSocket().emit('cam_stop', { slotId: slotKey });
    };
  }, [slotKey]);

  return {
    localStream,
    cameras,
    selectedDeviceId,
    setSelectedDeviceId,
    startCamera,
    stopCamera,
    active,
    camError,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// VIEWER – used in Overlay and AdminPanel to receive streams
// ─────────────────────────────────────────────────────────────────────────────
export function useCamViewer(slotIds: SlotId[]) {
  const [streams, setStreams] = useState<Record<string, MediaStream>>({});
  // key: broadcasterSocketId → RTCPeerConnection
  const peersRef = useRef<Record<string, RTCPeerConnection>>({});
  // Buffer ICE candidates that arrive before remote description is set
  const pendingIce = useRef<Record<string, RTCIceCandidateInit[]>>({});

  const slotKeySet = useRef(new Set(slotIds.map(String)));

  const requestStream = useCallback((broadcasterSocketId: string, slotId: string) => {
    getSocket().emit('rtc', {
      to: broadcasterSocketId,
      data: { type: 'request', slotId },
    });
  }, []);

  useEffect(() => {
    const socket = getSocket();

    // Backend sends current active broadcasters on connect
    const handleCamState = ({ cameras }: { cameras: Record<string, string> }) => {
      for (const [slotId, socketId] of Object.entries(cameras)) {
        if (slotKeySet.current.has(slotId)) {
          requestStream(socketId, slotId);
        }
      }
    };

    const handleCamAvailable = ({
      slotId,
      socketId,
    }: {
      slotId: string;
      socketId: string;
    }) => {
      if (slotKeySet.current.has(slotId)) {
        requestStream(socketId, slotId);
      }
    };

    const handleCamUnavailable = ({ slotId }: { slotId: string }) => {
      setStreams((prev) => {
        const n = { ...prev };
        delete n[slotId];
        return n;
      });
    };

    const handleRtc = async ({ from, data }: { from: string; data: any }) => {
      // Broadcaster sent us an offer
      if (data.type === 'offer') {
        const slotId = String(data.slotId);

        // Close old peer connection for this broadcaster if any
        peersRef.current[from]?.close();

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        peersRef.current[from] = pc;

        pc.ontrack = (e) => {
          if (e.streams[0]) {
            setStreams((prev) => ({ ...prev, [slotId]: e.streams[0] }));
          }
        };

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            socket.emit('rtc', { to: from, data: { type: 'ice', candidate: e.candidate } });
          }
        };

        pc.onconnectionstatechange = () => {
          if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
            setStreams((prev) => {
              const n = { ...prev };
              delete n[slotId];
              return n;
            });
            delete peersRef.current[from];
          }
        };

        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));

        // Flush buffered ICE candidates
        const buffered = pendingIce.current[from] || [];
        for (const c of buffered) {
          await pc.addIceCandidate(new RTCIceCandidate(c)).catch(console.error);
        }
        delete pendingIce.current[from];

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('rtc', { to: from, data: { type: 'answer', sdp: answer } });
      }

      // ICE candidate from broadcaster
      if (data.type === 'ice') {
        const pc = peersRef.current[from];
        if (pc && pc.remoteDescription) {
          await pc.addIceCandidate(new RTCIceCandidate(data.candidate)).catch(console.error);
        } else {
          // Buffer until remote description is set
          pendingIce.current[from] = [
            ...(pendingIce.current[from] || []),
            data.candidate,
          ];
        }
      }
    };

    socket.on('cam_state', handleCamState);
    socket.on('cam_available', handleCamAvailable);
    socket.on('cam_unavailable', handleCamUnavailable);
    socket.on('rtc', handleRtc);

    return () => {
      socket.off('cam_state', handleCamState);
      socket.off('cam_available', handleCamAvailable);
      socket.off('cam_unavailable', handleCamUnavailable);
      socket.off('rtc', handleRtc);
      Object.values(peersRef.current).forEach((pc) => pc.close());
      peersRef.current = {};
    };
  }, []); // run once – slotIds don't change at runtime

  return streams;
}
