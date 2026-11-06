// Voice chat and table transcripts for remote play.
//
// Voice: every device in the room's voice chat connects straight to every other one over WebRTC (a small
// mesh: fine for a table of up to about 9). The room's Realtime channels carry the setup messages, and the
// device whose id sorts first makes the offer, so two devices never both offer at once. The TV joins as a
// listener (id "tv") so people in the room hear the remote players through its speakers.
//
// Transcripts: each phone turns its own player's speech into text with the browser's speech recognition,
// which runs on the device and costs nothing. Only text leaves the phone; no audio is recorded or stored.

import { useCallback, useEffect, useRef, useState } from 'react';
import { openSignal } from '../party/net';
import { getIceServers } from './dndApi';

const RESTART_MS = 2500;

/** Who makes the offer between two devices: the one whose id sorts first. */
export const isInitiator = (me, other) => String(me) < String(other);

/**
 * Join the room's voice chat while `active`. peers: ids of everyone else in voice. mic: send this device's
 * microphone (false for the TV). Returns { state, error, needsTap, resume } where resume() retries audio
 * playback after a tap if the browser blocked it.
 */
export function useVoice({ code, cid, prefix, peers, active, mic = true, muted = false, video = false, recvVideo = false }) {
  const [state, setState] = useState('off'); // off | starting | on | error
  const [error, setError] = useState('');
  const [needsTap, setNeedsTap] = useState(false);
  const [connected, setConnected] = useState([]);
  const [videos, setVideos] = useState({}); // peer id -> MediaStream with their camera
  const [local, setLocal] = useState(null); // this device's camera stream, when video is on
  const ref = useRef(null); // { stream, signal, ice, pcs: Map(peer -> { pc, audio, pending, timer }) }
  const peersRef = useRef(peers);
  peersRef.current = peers;
  const callRef = useRef(() => {});

  const markConnected = useCallback(() => {
    const live = ref.current;
    if (!live) return;
    setConnected([...live.pcs.entries()].filter(([, p]) => p.pc.connectionState === 'connected').map(([id]) => id));
  }, []);

  const closePeer = useCallback((id) => {
    const live = ref.current;
    const p = live?.pcs.get(id);
    if (!p) return;
    window.clearTimeout(p.timer);
    try { p.pc.close(); } catch (e) { /* already closed */ }
    if (p.audio) {
      p.audio.srcObject = null;
      p.audio.remove();
    }
    live.pcs.delete(id);
    setVideos((v) => { if (!v[id]) return v; const next = { ...v }; delete next[id]; return next; });
    markConnected();
  }, [markConnected]);

  const makePeer = useCallback((id) => {
    const live = ref.current;
    if (!live) return null;
    if (live.pcs.has(id)) return live.pcs.get(id);
    const pc = new RTCPeerConnection({ iceServers: live.ice });
    const entry = { pc, audio: null, pending: [], timer: 0 };
    live.pcs.set(id, entry);
    if (live.stream) live.stream.getTracks().forEach((track) => pc.addTrack(track, live.stream));
    else pc.addTransceiver('audio', { direction: 'recvonly' });
    // Watch other people's cameras even with yours off.
    if (live.recvVideo && !(live.stream && live.stream.getVideoTracks().length)) pc.addTransceiver('video', { direction: 'recvonly' });
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) live.signal.send(id, { kind: 'ice', candidate: candidate.toJSON ? candidate.toJSON() : candidate });
    };
    pc.ontrack = ({ streams, track }) => {
      if (track.kind === 'video') {
        const cam = streams[0] || new MediaStream([track]);
        setVideos((v) => ({ ...v, [id]: cam }));
        track.addEventListener('ended', () => setVideos((v) => { const next = { ...v }; delete next[id]; return next; }));
        return;
      }
      if (!entry.audio) {
        entry.audio = document.createElement('audio');
        entry.audio.autoplay = true;
        entry.audio.setAttribute('playsinline', '');
        entry.audio.style.display = 'none';
        document.body.appendChild(entry.audio);
      }
      entry.audio.srcObject = streams[0] || new MediaStream([track]);
      const played = entry.audio.play();
      if (played && played.catch) played.catch(() => setNeedsTap(true));
    };
    pc.onconnectionstatechange = () => {
      markConnected();
      // A dropped link is rebuilt by whoever made the offer.
      if ((pc.connectionState === 'failed' || pc.connectionState === 'disconnected') && isInitiator(cid, id)) {
        window.clearTimeout(entry.timer);
        entry.timer = window.setTimeout(() => {
          if (pc.connectionState === 'connected') return;
          closePeer(id);
          if (ref.current && peersRef.current.includes(id)) callRef.current(id);
        }, RESTART_MS);
      }
    };
    return entry;
  }, [cid, closePeer, markConnected]);

  const call = useCallback(async (id) => {
    const entry = makePeer(id);
    if (!entry) return;
    try {
      const offer = await entry.pc.createOffer();
      await entry.pc.setLocalDescription(offer);
      ref.current?.signal.send(id, { kind: 'offer', sdp: entry.pc.localDescription.sdp });
    } catch (e) {
      closePeer(id);
    }
  }, [closePeer, makePeer]);
  callRef.current = call;

  const onSignal = useCallback(async (msg) => {
    const live = ref.current;
    if (!live || !msg?.from || msg.from === cid) return;
    const id = msg.from;
    try {
      if (msg.kind === 'offer') {
        // A fresh offer replaces any old link with that device (it reconnected).
        if (live.pcs.has(id)) closePeer(id);
        const entry = makePeer(id);
        await entry.pc.setRemoteDescription({ type: 'offer', sdp: msg.sdp });
        entry.pending.splice(0).forEach((c) => entry.pc.addIceCandidate(c).catch(() => {}));
        const answer = await entry.pc.createAnswer();
        await entry.pc.setLocalDescription(answer);
        live.signal.send(id, { kind: 'answer', sdp: entry.pc.localDescription.sdp });
      } else if (msg.kind === 'answer') {
        const entry = live.pcs.get(id);
        if (entry && entry.pc.signalingState === 'have-local-offer') {
          await entry.pc.setRemoteDescription({ type: 'answer', sdp: msg.sdp });
          entry.pending.splice(0).forEach((c) => entry.pc.addIceCandidate(c).catch(() => {}));
        }
      } else if (msg.kind === 'ice' && msg.candidate) {
        const entry = live.pcs.get(id);
        if (!entry) return;
        if (entry.pc.remoteDescription) await entry.pc.addIceCandidate(msg.candidate).catch(() => {});
        else entry.pending.push(msg.candidate);
      } else if (msg.kind === 'bye') {
        closePeer(id);
      }
    } catch (e) {
      closePeer(id);
    }
  }, [cid, closePeer, makePeer]);

  const onSignalRef = useRef(onSignal);
  onSignalRef.current = onSignal;

  // Join or leave.
  useEffect(() => {
    if (!active || !code || !cid) return undefined;
    if (typeof RTCPeerConnection === 'undefined') {
      setState('error');
      setError('This browser can’t do voice chat.');
      return undefined;
    }
    let cancelled = false;
    setState('starting');
    setError('');
    (async () => {
      let stream = null;
      const audio = { echoCancellation: true, noiseSuppression: true, autoGainControl: true };
      if (mic && video) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio, video: { facingMode: 'user', width: { ideal: 240 }, height: { ideal: 240 }, frameRate: { ideal: 15, max: 20 } } });
        } catch (e) {
          setError('Camera blocked: voice only. Allow the camera in your settings to be seen.');
        }
      }
      if (mic && !stream) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio });
        } catch (e) {
          setError('Microphone blocked: you can still listen. Allow the mic in your browser settings to talk.');
        }
      }
      const ice = await getIceServers();
      if (cancelled) {
        if (stream) stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const signal = openSignal(code, cid, (msg) => onSignalRef.current(msg), prefix);
      ref.current = { stream, signal, ice, pcs: new Map(), recvVideo };
      setLocal(stream && stream.getVideoTracks().length ? stream : null);
      setState('on');
      // Give the signal channel a moment to subscribe before calling anyone.
      window.setTimeout(() => {
        if (!ref.current) return;
        peersRef.current.filter((id) => isInitiator(cid, id)).forEach((id) => call(id));
      }, 1200);
    })();
    return () => {
      cancelled = true;
      const live = ref.current;
      if (!live) return;
      [...live.pcs.keys()].forEach((id) => {
        live.signal.send(id, { kind: 'bye' });
        closePeer(id);
      });
      if (live.stream) live.stream.getTracks().forEach((t) => t.stop());
      live.signal.close();
      ref.current = null;
      setState('off');
      setConnected([]);
      setVideos({});
      setLocal(null);
    };
  }, [active, code, cid, prefix, mic, video, recvVideo, call, closePeer]);

  // Mute.
  useEffect(() => {
    const stream = ref.current?.stream;
    if (stream) stream.getAudioTracks().forEach((t) => { t.enabled = !muted; });
  }, [muted, state]);

  // People joining and leaving voice.
  const peersKey = [...peers].sort().join(',');
  useEffect(() => {
    const live = ref.current;
    if (!live || state !== 'on') return;
    const want = new Set(peersKey ? peersKey.split(',') : []);
    [...live.pcs.keys()].filter((id) => !want.has(id)).forEach((id) => closePeer(id));
    [...want].filter((id) => !live.pcs.has(id) && isInitiator(cid, id)).forEach((id) => call(id));
  }, [peersKey, state, cid, call, closePeer]);

  const resume = useCallback(() => {
    const live = ref.current;
    if (!live) return;
    live.pcs.forEach((p) => { if (p.audio) p.audio.play().catch(() => {}); });
    setNeedsTap(false);
  }, []);

  return { state, error, needsTap, resume, connected, videos, local };
}

const Recognition = typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;
export const canTranscribe = Boolean(Recognition);

/**
 * While `enabled`, listen to this phone's mic and call onLine(text) for each finished phrase. Browsers stop
 * recognition after a pause, so it restarts itself until turned off.
 */
export function useTranscriber({ enabled, onLine, lang = 'en-US' }) {
  const [listening, setListening] = useState(false);
  const [error, setError] = useState('');
  const onLineRef = useRef(onLine);
  onLineRef.current = onLine;

  useEffect(() => {
    if (!enabled || !Recognition) return undefined;
    let stopped = false;
    let rec = null;
    let timer = 0;
    const start = () => {
      if (stopped) return;
      rec = new Recognition();
      rec.lang = lang;
      rec.continuous = true;
      rec.interimResults = false;
      rec.onstart = () => { setListening(true); setError(''); };
      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const r = event.results[i];
          const text = r.isFinal && r[0] ? r[0].transcript.trim() : '';
          if (text) onLineRef.current(text);
        }
      };
      rec.onerror = (event) => {
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          stopped = true;
          setError('Speech-to-text is blocked. Allow the microphone and speech recognition for this site.');
        }
      };
      rec.onend = () => {
        setListening(false);
        if (!stopped) timer = window.setTimeout(start, 300);
      };
      try { rec.start(); } catch (e) { timer = window.setTimeout(start, 1000); }
    };
    start();
    return () => {
      stopped = true;
      window.clearTimeout(timer);
      if (rec) {
        rec.onend = null;
        try { rec.stop(); } catch (e) { /* not running */ }
      }
      setListening(false);
    };
  }, [enabled, lang]);

  return { supported: canTranscribe, listening, error };
}
