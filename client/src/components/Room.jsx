import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
    Mic, MicOff, Video, VideoOff, PhoneOff, Share2, X,
    Maximize2, Minimize2, LayoutGrid, Layout, Rows3, AlignJustify, ChevronUp, Circle, Settings, Volume2,
    Users, UserX, ShieldOff, Lock, PictureInPicture, ExternalLink
} from 'lucide-react';

// ─── Touch / Mouse unified pointer helpers ───────────────────────────────────
function getPointer(e) {
    const src = e.touches ? e.touches[0] : e;
    return { x: src.clientX, y: src.clientY };
}

// ─── Detect mobile (rough) ───────────────────────────────────────────────────
const isMobile = () => window.innerWidth < 768 || navigator.maxTouchPoints > 0;

// ─── Layout helpers ───────────────────────────────────────────────────────────
function computeLayout(mode, count, canvasW, canvasH) {
    const PAD = 10;
    if (count === 0) return [];

    switch (mode) {
        case 'grid': {
            // Orientation-aware: more columns in landscape, more rows in portrait
            const landscape = canvasW >= canvasH;
            let cols, rows;
            if (landscape) {
                cols = Math.ceil(Math.sqrt(count * (canvasW / canvasH)));
                rows = Math.ceil(count / cols);
            } else {
                rows = Math.ceil(Math.sqrt(count * (canvasH / canvasW)));
                cols = Math.ceil(count / rows);
            }
            cols = Math.max(1, cols); rows = Math.max(1, rows);
            const cellW = Math.floor((canvasW - PAD * (cols + 1)) / cols);
            const cellH = Math.floor((canvasH - PAD * (rows + 1)) / rows);
            return Array.from({ length: count }, (_, i) => ({
                x: PAD + (i % cols) * (cellW + PAD),
                y: PAD + Math.floor(i / cols) * (cellH + PAD),
                w: cellW, h: cellH,
            }));
        }
        case 'spotlight': {
            const SIDEBAR_W = Math.min(180, canvasW * 0.3);
            const bigW = count === 1 ? canvasW - PAD * 2 : canvasW - SIDEBAR_W - PAD * 3;
            const bigH = canvasH - PAD * 2;
            const positions = [{ x: PAD, y: PAD, w: bigW, h: bigH }];
            const sideCount = count - 1;
            if (sideCount > 0) {
                const sideH = Math.floor((canvasH - 8 * (sideCount + 1)) / sideCount);
                for (let i = 0; i < sideCount; i++) {
                    positions.push({
                        x: PAD + bigW + PAD,
                        y: 8 + i * (Math.min(sideH, 150) + 8),
                        w: SIDEBAR_W,
                        h: Math.min(sideH, 150),
                    });
                }
            }
            return positions;
        }
        case 'strip': {
            const w = Math.floor((canvasW - PAD * (count + 1)) / count);
            const h = canvasH - PAD * 2;
            return Array.from({ length: count }, (_, i) => ({
                x: PAD + i * (w + PAD), y: PAD, w, h,
            }));
        }
        case 'speaker': {
            // index 0 = active speaker (large), rest = thumbnail strip at bottom
            if (count === 1) return [{ x: 0, y: 0, w: canvasW, h: canvasH }];
            const THUMB_H = Math.min(160, Math.floor(canvasH * 0.22));
            const thumbCount = count - 1;
            const maxThumbW = 220;
            const thumbW = Math.min(maxThumbW, Math.floor((canvasW - PAD * (thumbCount + 1)) / thumbCount));
            const mainH = canvasH - THUMB_H - PAD * 3;
            const totalThumbsW = thumbCount * thumbW + (thumbCount - 1) * PAD;
            const startX = Math.floor((canvasW - totalThumbsW) / 2);
            const positions = [{ x: 0, y: 0, w: canvasW, h: mainH }];
            for (let i = 0; i < thumbCount; i++) {
                positions.push({
                    x: startX + i * (thumbW + PAD),
                    y: mainH + PAD * 2,
                    w: thumbW,
                    h: THUMB_H,
                });
            }
            return positions;
        }
        default: return [];
    }
}

// ─── Audio Level Meter ────────────────────────────────────────────────────────
const SEGMENTS = 24;
const AudioMeter = ({ stream }) => {
    const canvasRef = useRef(null);
    const rafRef = useRef(null);

    useEffect(() => {
        if (!stream) return;
        let audioCtx;
        try { audioCtx = new AudioContext(); } catch { return; }
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        const data = new Uint8Array(analyser.frequencyBinCount);
        let source;
        try { source = audioCtx.createMediaStreamSource(stream); } catch { audioCtx.close(); return; }
        source.connect(analyser);

        const draw = () => {
            rafRef.current = requestAnimationFrame(draw);
            const canvas = canvasRef.current;
            if (!canvas) return;
            analyser.getByteFrequencyData(data);
            // Compute RMS-ish level 0→1
            const avg = data.reduce((a, b) => a + b, 0) / data.length;
            const level = Math.min(1, avg / 80);

            const ctx = canvas.getContext('2d');
            const W = canvas.width, H = canvas.height;
            const gap = 2;
            const segW = (W - gap * (SEGMENTS - 1)) / SEGMENTS;
            ctx.clearRect(0, 0, W, H);
            for (let i = 0; i < SEGMENTS; i++) {
                const ratio = i / SEGMENTS;
                const active = ratio < level;
                // 0→0.6 green, 0.6→0.8 yellow, 0.8→1 red
                const hue = ratio < 0.6 ? 130 : ratio < 0.8 ? 55 : 0;
                const sat = active ? '75%' : '0%';
                const lit = active ? '48%' : '15%';
                ctx.fillStyle = `hsl(${hue},${sat},${lit})`;
                const x = i * (segW + gap);
                ctx.beginPath();
                ctx.roundRect(x, 0, segW, H, 2);
                ctx.fill();
            }
        };
        draw();

        return () => {
            cancelAnimationFrame(rafRef.current);
            try { source.disconnect(); } catch { }
            audioCtx.close();
        };
    }, [stream]);

    return (
        <canvas
            ref={canvasRef}
            width={260}
            height={14}
            style={{ width: '100%', height: 14, display: 'block' }}
        />
    );
};

// ─── Draggable + Resizable Window ────────────────────────────────────────────
const VideoWindow = ({ id, title, children, pos: propPos, size: propSize, onPosChange, onSizeChange, onClose, closing, fullscreen, onFullscreen, onPiP, pipActive }) => {
    // ── Own local state — only THIS component re-renders during drag ──
    const [curr, setCurr] = useState({ x: propPos.x, y: propPos.y, w: propSize.w, h: propSize.h });
    const winRef = useRef(null);  // ref to the outer div

    // Refs for drag/resize — no setState during movement
    const dragging = useRef(false);
    const resizing = useRef(false);
    const dragStart = useRef({});
    const resizeStart = useRef({});
    const livePos = useRef({ x: propPos.x, y: propPos.y });
    const liveSize = useRef({ w: propSize.w, h: propSize.h });
    const rafId = useRef(null);

    // Sync from parent (layout-mode changes) — but only when NOT actively dragging
    useEffect(() => {
        if (!dragging.current) {
            livePos.current = { x: propPos.x, y: propPos.y };
            setCurr(c => ({ ...c, x: propPos.x, y: propPos.y }));
        }
    }, [propPos.x, propPos.y]);
    useEffect(() => {
        if (!resizing.current) {
            liveSize.current = { w: propSize.w, h: propSize.h };
            setCurr(c => ({ ...c, w: propSize.w, h: propSize.h }));
        }
    }, [propSize.w, propSize.h]);

    // Toggle CSS transition off during drag (avoids the 350ms lag)
    const setDragging = (active) => {
        winRef.current?.classList.toggle('video-window--dragging', active);
    };

    // Schedule one setState per animation frame (60fps max)
    const scheduleUpdate = () => {
        if (rafId.current) return;
        rafId.current = requestAnimationFrame(() => {
            rafId.current = null;
            setCurr({ ...livePos.current, ...liveSize.current });
        });
    };

    // ── Drag ──
    const onDragDown = (e) => {
        if (fullscreen || e.button > 0) return;
        e.preventDefault();
        e.currentTarget.setPointerCapture(e.pointerId);
        dragging.current = true;
        setDragging(true);
        dragStart.current = { ox: e.clientX, oy: e.clientY, sx: livePos.current.x, sy: livePos.current.y };
    };
    const onDragMove = (e) => {
        if (!dragging.current) return;
        livePos.current = {
            x: Math.max(0, dragStart.current.sx + e.clientX - dragStart.current.ox),
            y: Math.max(0, dragStart.current.sy + e.clientY - dragStart.current.oy),
        };
        scheduleUpdate();
    };
    const onDragUp = (e) => {
        if (!dragging.current) return;
        dragging.current = false;
        setDragging(false);
        if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null; }
        setCurr(c => ({ ...c, ...livePos.current }));
        onPosChange?.(livePos.current);
    };

    // ── Resize ──
    const onResizeDown = (e) => {
        if (fullscreen || e.button > 0) return;
        e.preventDefault();
        e.stopPropagation();
        e.currentTarget.setPointerCapture(e.pointerId);
        resizing.current = true;
        setDragging(true);
        resizeStart.current = { ox: e.clientX, oy: e.clientY, sw: liveSize.current.w, sh: liveSize.current.h };
    };
    const onResizeMove = (e) => {
        if (!resizing.current) return;
        liveSize.current = {
            w: Math.max(220, resizeStart.current.sw + e.clientX - resizeStart.current.ox),
            h: Math.max(150, resizeStart.current.sh + e.clientY - resizeStart.current.oy),
        };
        scheduleUpdate();
    };
    const onResizeUp = (e) => {
        if (!resizing.current) return;
        resizing.current = false;
        setDragging(false);
        if (rafId.current) { cancelAnimationFrame(rafId.current); rafId.current = null; }
        setCurr(c => ({ ...c, ...liveSize.current }));
        onSizeChange?.(liveSize.current);
    };

    return (
        <div
            ref={winRef}
            className={`video-window ${closing ? 'video-window--closing' : ''} ${fullscreen ? 'video-window--fullscreen' : ''}`}
            style={fullscreen ? {} : { left: curr.x, top: curr.y, width: curr.w, height: curr.h }}
        >
            {/* Title bar — drag handle */}
            <div
                className="video-window__titlebar"
                onPointerDown={onDragDown}
                onPointerMove={onDragMove}
                onPointerUp={onDragUp}
                onPointerCancel={onDragUp}
            >
                <span className="video-window__title">{title}</span>
                <div className="flex items-center gap-1">
                    {onPiP && document.pictureInPictureEnabled && (
                        <button
                            className={`video-window__close ${pipActive ? 'text-indigo-400' : ''}`}
                            onPointerDown={e => e.stopPropagation()}
                            onClick={onPiP}
                            title={pipActive ? 'Cerrar ventana flotante' : 'Ventana flotante (PiP)'}
                        >
                            <ExternalLink size={12} />
                        </button>
                    )}
                    <button
                        className="video-window__close"
                        onPointerDown={e => e.stopPropagation()}
                        onClick={onFullscreen}
                        title={fullscreen ? 'Restaurar' : 'Pantalla completa'}
                    >
                        {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </button>
                    {onClose && (
                        <button
                            className="video-window__close"
                            onPointerDown={e => e.stopPropagation()}
                            onClick={onClose}
                            title="Cerrar"
                        >
                            <X size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Video body */}
            <div className="video-window__body">{children}</div>

            {/* Resize handle */}
            {!fullscreen && (
                <div
                    className="video-window__resize-handle"
                    onPointerDown={onResizeDown}
                    onPointerMove={onResizeMove}
                    onPointerUp={onResizeUp}
                    onPointerCancel={onResizeUp}
                />
            )}
        </div>
    );
};


// ─── Remote Participant ───────────────────────────────────────────────────────
const VideoParticipant = ({ peer, peerID, name, onClose, closing, pos, size, onPosChange, onSizeChange, fullscreen, onFullscreen }) => {
    const videoEl = useRef(null);   // DOM element
    const streamRef = useRef(null);   // latest resolved stream
    const [hasStream, setHasStream] = useState(false);
    const [pipActive, setPipActive] = useState(false);

    const togglePiP = async () => {
        if (!videoEl.current) return;
        try {
            if (document.pictureInPictureElement === videoEl.current) {
                await document.exitPictureInPicture();
            } else {
                await videoEl.current.requestPictureInPicture();
            }
        } catch (err) {
            console.error('[PiP Error]', err);
        }
    };

    // Attach stream to video element — called whenever either changes
    const attachStream = (video, stream) => {
        if (!video || !stream) return;
        if (video.srcObject === stream) return;   // already attached
        video.srcObject = stream;
        video.play().catch(err => {
            if (err.name !== 'AbortError') console.warn('[VideoParticipant] play():', err);
        });
    };

    // Callback ref — fires as soon as the <video> mounts or unmounts
    const videoCallbackRef = useCallback((el) => {
        videoEl.current = el;
        attachStream(el, streamRef.current);
    }, []);  // stable

    useEffect(() => {
        const onStream = (stream) => {
            streamRef.current = stream;
            setHasStream(true);
            attachStream(videoEl.current, stream);
        };

        peer.on('stream', onStream);
        peer.on('connect', () => console.log('[peer connected]', peerID));
        peer.on('error', err => console.error('[peer error]', peerID, err));

        // Capture stream already received before this effect ran (e.g. fast connection)
        if (peer.streams && peer.streams[0]) {
            onStream(peer.streams[0]);
        }

        // ── Mobile resume fix ──────────────────────────────────────────────────
        // Force re-attach on visibility restore
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const stream = streamRef.current || peer.streams?.[0];
                if (stream && videoEl.current) {
                    videoEl.current.srcObject = null;
                    attachStream(videoEl.current, stream);
                }
            }
        };
        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('pageshow', onVisibilityChange);

        // ── Stream-identity guard ───────────────────────────────────────────────
        // Poll every 2 s to make sure the <video> element still carries the correct
        // remote stream. On some mobile browsers the srcObject silently drifts after
        // the app returns from background.
        const guardInterval = setInterval(() => {
            const expected = streamRef.current || peer.streams?.[0];
            if (!expected || !videoEl.current) return;
            if (videoEl.current.srcObject !== expected) {
                console.warn('[VideoParticipant] srcObject drifted — re-attaching remote stream', peerID);
                videoEl.current.srcObject = null;
                attachStream(videoEl.current, expected);
            }
        }, 2000);

        // ── PiP state listeners ────────────────────────────────────────────────
        const onEnterPiP = () => setPipActive(true);
        const onLeavePiP = () => setPipActive(false);

        const videoElem = videoEl.current;
        if (videoElem) {
            videoElem.addEventListener('enterpictureinpicture', onEnterPiP);
            videoElem.addEventListener('leavepictureinpicture', onLeavePiP);
        }

        return () => {
            peer.off('stream', onStream);
            clearInterval(guardInterval);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('pageshow', onVisibilityChange);
            if (videoElem) {
                videoElem.removeEventListener('enterpictureinpicture', onEnterPiP);
                videoElem.removeEventListener('leavepictureinpicture', onLeavePiP);
            }
        };
    }, [peer]);

    return (
        <VideoWindow
            id={peerID} title={name || 'Familiar'}
            pos={pos} size={size}
            onPosChange={onPosChange} onSizeChange={onSizeChange}
            onClose={onClose} closing={closing}
            fullscreen={fullscreen} onFullscreen={onFullscreen}
            onPiP={togglePiP} pipActive={pipActive}
        >
            <video
                ref={videoCallbackRef}
                playsInline
                autoPlay
                muted={false}
                className="video-element"
            />
            {pipActive && (
                <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
                    <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center animate-pulse">
                        <PictureInPicture size={24} className="text-indigo-400" />
                    </div>
                    <span className="text-[10px] font-bold text-white uppercase tracking-widest text-center px-4">
                        Modo ventana flotante activo
                    </span>
                    <button
                        onClick={togglePiP}
                        className="mt-2 px-3 py-1.5 bg-indigo-500 rounded-lg text-[10px] font-bold text-white uppercase tracking-wider"
                    >
                        Volver a la sala
                    </button>
                </div>
            )}
            {!hasStream && (
                <div className="absolute inset-0 bg-slate-900/90 flex items-center justify-center gap-2">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase ml-1">Conectando...</span>
                </div>
            )}
        </VideoWindow>
    );
};


// ─── Main Room ────────────────────────────────────────────────────────────────
const Room = () => {
    const { roomID } = useParams();
    const navigate = useNavigate();
    const [searchParams] = useSearchParams();
    const roomPassword = searchParams.get('pw') || '';

    const [peers, setPeers] = useState([]);
    const [peerNames, setPeerNames] = useState({});   // peerID → display name
    const [micOn, setMicOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);
    const [copied, setCopied] = useState(false);
    const [closingPeers, setClosingPeers] = useState(new Set());
    const [hiddenPeers, setHiddenPeers] = useState(new Set());
    const [localHidden, setLocalHidden] = useState(false);
    const [fullscreenId, setFullscreenId] = useState(null);
    const [layoutMode, setLayoutMode] = useState('free');
    const [layoutOpen, setLayoutOpen] = useState(false);
    const [windowPos, setWindowPos] = useState({});
    const [windowSize, setWindowSize] = useState({});
    const [localPipActive, setLocalPipActive] = useState(false);
    const [isGlobalPipActive, setIsGlobalPipActive] = useState(false);

    const pipCanvasRef = useRef(null);
    const pipVideoRef = useRef(null);
    const pipRafRef = useRef(null);

    // ── Device selector ──
    const [cameras, setCameras] = useState([]);  // [{deviceId, label}]
    const [mics, setMics] = useState([]);  // [{deviceId, label}]
    const [selCamera, setSelCamera] = useState('');
    const [selMic, setSelMic] = useState('');
    const [settingsOpen, setSettingsOpen] = useState(false);

    // ── Host controls ──
    const [isHost, setIsHost] = useState(false);
    const [participantsOpen, setParticipantsOpen] = useState(false);
    const [peerSocketIDs, setPeerSocketIDs] = useState({}); // peerID → socketId (same)
    const [joinRejected, setJoinRejected] = useState(null); // null | 'kicked' | 'banned'

    // ── Auto-hide controls ──
    const [controlsVisible, setControlsVisible] = useState(true);
    const hideTimerRef = useRef(null);
    const wakeControls = useCallback(() => {
        setControlsVisible(true);
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = setTimeout(() => setControlsVisible(false), 3000);
    }, []);
    // Start the timer once on mount
    useEffect(() => { wakeControls(); return () => clearTimeout(hideTimerRef.current); }, [wakeControls]);

    // ── Password prompt (shown when room is password-protected and user didn't supply one) ──
    const [needsPassword, setNeedsPassword] = useState(false);
    const needsPasswordRef = useRef(false); // mirror for use inside closed-over socket handlers
    const [pwInput, setPwInput] = useState('');
    const [pwWrong, setPwWrong] = useState(false); // show 'wrong password' inline message

    // ── Name gate ──
    // If no name is saved (direct-link guests), show a prompt first
    const saved = localStorage.getItem('nexusmeet_name') || '';
    const [myName, setMyName] = useState(saved);
    const [nameInput, setNameInput] = useState(saved);
    const [nameReady, setNameReady] = useState(!!saved);

    const confirmName = (e) => {
        e.preventDefault();
        const n = nameInput.trim() || 'Anónimo';
        localStorage.setItem('nexusmeet_name', n);
        setMyName(n);
        setNameReady(true);
    };

    const canvasRef = useRef();
    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]);
    const userStreamRef = useRef(null);
    const roomRef = useRef(null);   // whole room container for Fullscreen API

    // ── Join notification sound ──
    const playJoinSound = useCallback(() => {
        try {
            const ctx = new AudioContext();
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.connect(gain); osc2.connect(gain); gain.connect(ctx.destination);
            osc1.type = 'sine'; osc2.type = 'sine';
            osc1.frequency.setValueAtTime(880, ctx.currentTime);
            osc2.frequency.setValueAtTime(1100, ctx.currentTime + 0.12);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.45);
            osc1.start(ctx.currentTime); osc1.stop(ctx.currentTime + 0.15);
            osc2.start(ctx.currentTime + 0.12); osc2.stop(ctx.currentTime + 0.45);
            osc2.onended = () => ctx.close();
        } catch (_) { }
    }, []);

    // ── Active-speaker VAD ──
    const [activeSpeakerId, setActiveSpeakerId] = useState(null);
    const activeSpeakerIdRef = useRef(null);  // mirror, safe inside closures

    // ── App-level fullscreen (like Google Meet) ──
    const [appFullscreen, setAppFullscreen] = useState(false);
    useEffect(() => {
        const onChange = () => setAppFullscreen(!!document.fullscreenElement);
        document.addEventListener('fullscreenchange', onChange);
        return () => document.removeEventListener('fullscreenchange', onChange);
    }, []);
    const toggleAppFullscreen = () => {
        if (!document.fullscreenElement) {
            (roomRef.current || document.documentElement).requestFullscreen?.();
        } else {
            document.exitFullscreen?.();
        }
    };

    // ── Auto layout ──
    const applyLayout = useCallback((mode, allIds) => {
        if (mode === 'free' || !canvasRef.current) return;
        const { offsetWidth: W, offsetHeight: H } = canvasRef.current;
        const positions = computeLayout(mode, allIds.length, W, H);
        const newPos = {}, newSize = {};
        allIds.forEach((id, i) => {
            const p = positions[i] || positions[0];
            newPos[id] = { x: p.x, y: p.y };
            newSize[id] = { w: p.w, h: p.h };
        });
        setWindowPos(newPos);
        setWindowSize(newSize);
    }, []);

    const getAllIds = useCallback((peersArr, lHidden) => {
        const ids = [];
        if (!lHidden) ids.push('local');
        peersArr.filter(p => !hiddenPeers.has(p.peerID)).forEach(p => ids.push(p.peerID));
        return ids;
    }, [hiddenPeers]);

    useEffect(() => { activeSpeakerIdRef.current = activeSpeakerId; }, [activeSpeakerId]);

    // VAD: poll audio levels while in speaker mode
    useEffect(() => {
        if (layoutMode !== 'speaker') return;
        let audioCtx;
        try { audioCtx = new AudioContext(); } catch { return; }
        // Resume in case browser suspended it due to autoplay policy
        audioCtx.resume().catch(() => { });

        const analysers = {}; // id → { analyser, data }

        const setupAnalyser = (id, stream) => {
            if (analysers[id] || !stream) return;
            try {
                const analyser = audioCtx.createAnalyser();
                analyser.fftSize = 64;
                const src = audioCtx.createMediaStreamSource(stream);
                src.connect(analyser);
                analysers[id] = { analyser, data: new Uint8Array(analyser.frequencyBinCount), src };
            } catch { }
        };

        let lastChanged = 0;
        const pollId = setInterval(() => {
            // Lazy-register new participants
            if (userStreamRef.current) setupAnalyser('local', userStreamRef.current);
            peersRef.current.forEach(({ peerID, peer }) => {
                if (peer.streams?.[0]) setupAnalyser(peerID, peer.streams[0]);
            });

            // Find loudest participant
            let maxLevel = 0, maxId = null;
            Object.entries(analysers).forEach(([id, { analyser, data }]) => {
                analyser.getByteFrequencyData(data);
                const level = data.reduce((a, b) => a + b, 0) / data.length;
                if (level > maxLevel) { maxLevel = level; maxId = id; }
            });

            const now = Date.now();
            // Lowered threshold (3) and debounce (800ms) for snappier speaker detection
            if (maxLevel > 3 && maxId && maxId !== activeSpeakerIdRef.current && now - lastChanged > 800) {
                lastChanged = now;
                activeSpeakerIdRef.current = maxId;
                setActiveSpeakerId(maxId);
            }
        }, 200);

        return () => {
            clearInterval(pollId);
            Object.values(analysers).forEach(({ src }) => { try { src.disconnect(); } catch { } });
            audioCtx.close().catch(() => { });
        };
    }, [layoutMode]);

    // Re-apply layout whenever active speaker changes
    // Uses peersRef to avoid stale closure (peers state may lag behind)
    useEffect(() => {
        if (layoutMode !== 'speaker') return;
        const currentPeers = peersRef.current.map(p => ({ peerID: p.peerID }));
        let ids = getAllIds(currentPeers, localHidden);
        if (activeSpeakerId) ids = [activeSpeakerId, ...ids.filter(id => id !== activeSpeakerId)];
        applyLayout('speaker', ids);
    }, [activeSpeakerId, layoutMode, localHidden, hiddenPeers, getAllIds, applyLayout]);
    useEffect(() => {
        if (layoutMode === 'free') return;
        let ids = getAllIds(peers, localHidden);
        if (layoutMode === 'speaker' && activeSpeakerId) {
            ids = [activeSpeakerId, ...ids.filter(id => id !== activeSpeakerId)];
        }
        applyLayout(layoutMode, ids);
    }, [layoutMode, peers, localHidden, hiddenPeers]);

    // ── Responsive helpers ──
    const isMobile = () => window.innerWidth < 640;

    /** Returns default window size based on current canvas dimensions */
    const getDefaultSize = useCallback(() => {
        const canvas = canvasRef.current;
        const cw = canvas ? canvas.offsetWidth : window.innerWidth;
        const ch = canvas ? canvas.offsetHeight : window.innerHeight;
        if (isMobile()) {
            const w = cw - 8;
            return { w, h: Math.round(w * 9 / 16) };
        }
        // Desktop: cap at ~40% of canvas width, min 260px
        const w = Math.max(260, Math.min(Math.round(cw * 0.38), 520));
        const h = Math.max(180, Math.min(Math.round(ch * 0.4), 340));
        return { w, h };
    }, []);

    /** Returns default window position based on index and canvas size */
    const getDefaultPos = useCallback((index) => {
        const canvas = canvasRef.current;
        const cw = canvas ? canvas.offsetWidth : window.innerWidth;
        if (isMobile()) {
            const h = Math.round((cw - 8) * 9 / 16);
            return { x: 4, y: 4 + index * (h + 8) };
        }
        return { x: 12 + index * 32, y: 12 + index * 32 };
    }, []);

    const getPosForId = (id, i) => windowPos[id] || getDefaultPos(i);
    const getSizeForId = (id, i) => windowSize[id] || getDefaultSize();
    const setPosForId = (id) => (p) => setWindowPos(prev => ({ ...prev, [id]: p }));
    const setSizeForId = (id) => (s) => setWindowSize(prev => ({ ...prev, [id]: s }));

    /** Re-apply positions/sizes on canvas resize */
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const onResize = () => {
            const ids = getAllIds(peers, localHidden);
            if (layoutMode !== 'free') {
                // Re-run structured layout with new dimensions
                applyLayout(layoutMode, ids);
            } else {
                // In free mode, scale each window proportionally to new canvas
                const newW = canvas.offsetWidth;
                const newH = canvas.offsetHeight;
                if (!newW || !newH) return;
                setWindowPos(prev => {
                    const next = {};
                    Object.entries(prev).forEach(([id, pos]) => {
                        next[id] = {
                            x: Math.max(0, Math.min(pos.x, newW - 80)),
                            y: Math.max(0, Math.min(pos.y, newH - 60)),
                        };
                    });
                    return next;
                });
                setWindowSize(prev => {
                    const next = {};
                    // Keep manually-set sizes, just clamp to new bounds
                    Object.entries(prev).forEach(([id, sz]) => {
                        next[id] = {
                            w: Math.max(220, Math.min(sz.w, newW - 8)),
                            h: Math.max(150, Math.min(sz.h, newH - 8)),
                        };
                    });
                    return next;
                });
            }
        };

        const ro = new ResizeObserver(onResize);
        ro.observe(canvas);
        return () => ro.disconnect();
    }, [peers, localHidden, layoutMode, getAllIds, applyLayout]);


    // ── Socket / Media ──
    useEffect(() => {
        if (!nameReady) return;   // wait for name confirmation
        const envUrl = import.meta.env.VITE_SERVER_URL;
        const serverUrl = envUrl || (window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://chatfamily.onrender.com');
        socketRef.current = io.connect(serverUrl, { transports: ['websocket'], upgrade: false });

        navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
            },
        }).then(stream => {
            userStreamRef.current = stream;
            if (userVideo.current) userVideo.current.srcObject = stream;

            // Populate device lists now that permission is granted
            navigator.mediaDevices.enumerateDevices().then(devs => {
                setCameras(devs.filter(d => d.kind === 'videoinput').map(d => ({ deviceId: d.deviceId, label: d.label || `Cámara ${d.deviceId.slice(0, 6)}` })));
                setMics(devs.filter(d => d.kind === 'audioinput').map(d => ({ deviceId: d.deviceId, label: d.label || `Micrófono ${d.deviceId.slice(0, 6)}` })));
                const vTrack = stream.getVideoTracks()[0];
                const aTrack = stream.getAudioTracks()[0];
                if (vTrack) setSelCamera(vTrack.getSettings().deviceId || '');
                if (aTrack) setSelMic(aTrack.getSettings().deviceId || '');
            });

            socketRef.current.emit('join room', { roomID, name: myName, password: roomPassword });

            // ── Host / rejection events ──
            socketRef.current.on('you are host', () => setIsHost(true));
            socketRef.current.on('join rejected', ({ reason } = {}) => {
                if (reason === 'wrong_password') {
                    // Don't disconnect — just ask for the password
                    // If the prompt was already open, the previous attempt was wrong
                    setPwWrong(needsPasswordRef.current);
                    needsPasswordRef.current = true;
                    setNeedsPassword(true);
                } else {
                    // banned or unknown
                    setJoinRejected(reason === 'banned' ? 'banned' : 'unknown');
                    socketRef.current.disconnect();
                }
            });
            socketRef.current.on('you were kicked', ({ banned } = {}) => {
                setJoinRejected(banned ? 'banned' : 'kicked');
                socketRef.current.disconnect();
            });
            // Helper to re-join with a password (called from prompt modal)
            socketRef.current._rejoinWithPw = (pw) => {
                socketRef.current.emit('join room', { roomID, name: myName, password: pw });
            };

            socketRef.current.on('all users', users => {
                // users: [{id, name}]
                const newPeers = users.map(({ id: uid, name }) => {
                    const peer = createPeer(uid, socketRef.current.id, stream);
                    peersRef.current.push({ peerID: uid, peer });
                    setPeerNames(prev => ({ ...prev, [uid]: name }));
                    return { peerID: uid, peer };
                });
                if (users.length > 0) playJoinSound(); // others already in room
                setPeers(newPeers);
            });
            socketRef.current.on('user joined', payload => {
                // Check if peer already exists (Trickle ICE can send multiple signals)
                const existing = peersRef.current.find(p => p.peerID === payload.callerID);
                if (existing) {
                    existing.peer.signal(payload.signal);
                    return;
                }

                playJoinSound(); // new participant entered
                const peer = addPeer(payload.signal, payload.callerID, stream);
                peersRef.current.push({ peerID: payload.callerID, peer });
                setPeerNames(prev => ({ ...prev, [payload.callerID]: payload.name || 'Familiar' }));
                setPeers(prev => [...prev, { peerID: payload.callerID, peer }]);
            });
            socketRef.current.on('receiving returned signal', payload => {
                const item = peersRef.current.find(p => p.peerID === payload.id);
                if (item) item.peer.signal(payload.signal);
                if (payload.name) setPeerNames(prev => ({ ...prev, [payload.id]: payload.name }));
            });
            socketRef.current.on('user left', id => {
                const peerObj = peersRef.current.find(p => p.peerID === id);
                if (peerObj) peerObj.peer.destroy();
                const remaining = peersRef.current.filter(p => p.peerID !== id);
                peersRef.current = remaining;
                setClosingPeers(prev => new Set([...prev, id]));
                if (fullscreenId === id) setFullscreenId(null);
                setTimeout(() => {
                    setPeers(remaining.map(p => ({ peerID: p.peerID, peer: p.peer })));
                    setClosingPeers(prev => { const n = new Set(prev); n.delete(id); return n; });
                }, 400);
            });

            // ── Peer reconnection (mobile resume / ICE failure) ──────────────
            // The other peer detected ICE failure and asked us to re-initiate.
            socketRef.current.on('peer-reconnect-request', ({ fromID, name: fromName }) => {
                console.log('[Room] peer-reconnect-request from', fromID);
                // Destroy old peer if it still exists
                const existing = peersRef.current.find(p => p.peerID === fromID);
                if (existing) {
                    try { existing.peer.destroy(); } catch (_) { }
                }
                peersRef.current = peersRef.current.filter(p => p.peerID !== fromID);

                // Re-create as initiator using current local stream
                const currentStream = userStreamRef.current;
                const newPeer = createPeer(fromID, socketRef.current.id, currentStream);
                peersRef.current.push({ peerID: fromID, peer: newPeer });
                if (fromName) setPeerNames(prev => ({ ...prev, [fromID]: fromName }));

                // Update React state so VideoParticipant gets fresh peer object
                setPeers(prev => {
                    const without = prev.filter(p => p.peerID !== fromID);
                    return [...without, { peerID: fromID, peer: newPeer }];
                });
            });
        }).catch(err => {
            console.error('Camera error:', err);
            alert('Por favor, permite el acceso a la cámara y micrófono para usar la app.');
        });

        // ── Mobile resume: re-acquire local stream if OS stopped it ──────────
        const handleVisibilityResume = async () => {
            if (document.visibilityState !== 'visible') return;
            const stream = userStreamRef.current;
            if (!stream) return;

            const videoTrack = stream.getVideoTracks()[0];
            const audioTrack = stream.getAudioTracks()[0];
            const tracksStopped = (videoTrack && videoTrack.readyState === 'ended')
                || (audioTrack && audioTrack.readyState === 'ended');

            if (!tracksStopped) {
                // Tracks still live — just make sure the local <video> is attached
                if (userVideo.current && userVideo.current.srcObject !== stream) {
                    userVideo.current.srcObject = stream;
                    userVideo.current.play().catch(() => { });
                }
                return;
            }

            console.log('[Room] Mobile resume: re-acquiring local stream');
            try {
                const newStream = await navigator.mediaDevices.getUserMedia({
                    video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
                    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
                });

                // Stop old tracks and replace reference
                stream.getTracks().forEach(t => t.stop());
                userStreamRef.current = newStream;

                // Re-attach to local video element
                if (userVideo.current) {
                    userVideo.current.srcObject = newStream;
                    userVideo.current.play().catch(() => { });
                }

                // Push new tracks to all existing peers
                peersRef.current.forEach(({ peer: p }) => {
                    const pc = p._pc;
                    if (!pc) return;
                    newStream.getTracks().forEach(newTrack => {
                        const sender = pc.getSenders().find(s => s.track?.kind === newTrack.kind);
                        if (sender) sender.replaceTrack(newTrack).catch(console.warn);
                    });
                });
            } catch (err) {
                console.warn('[Room] Could not re-acquire stream on resume:', err);
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityResume);
        window.addEventListener('pageshow', handleVisibilityResume);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityResume);
            window.removeEventListener('pageshow', handleVisibilityResume);
            socketRef.current?.disconnect();
            userStreamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, [nameReady]);

    // ── ICE configuration (STUN + TURN for Mobile Data) ─────────────────────
    const COMMON_ICE_CONFIG = {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' },
            { urls: 'stun:global.stun.twilio.com:3478' },
            // Public TURN server (OpenRelay) to bypass mobile symmetric NAT
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    };

    // ── ICE failure → notify the other side to re-initiate ───────────────────
    function watchICE(peer, remotePeerID) {
        const pc = peer._pc;
        if (!pc) return;
        let notified = false;
        const onICEChange = () => {
            const state = pc.iceConnectionState;
            console.log(`[ICE] ${remotePeerID} → ${state}`);
            if ((state === 'failed' || state === 'closed') && !notified) {
                notified = true;
                console.warn(`[ICE] Connection to ${remotePeerID} failed — requesting reconnect`);
                socketRef.current?.emit('reconnect-peer', { targetID: remotePeerID });
            }
        };
        pc.addEventListener('iceconnectionstatechange', onICEChange);
    }

    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({
            initiator: true,
            trickle: true,
            stream: stream || undefined,
            config: COMMON_ICE_CONFIG
        });
        peer.on('signal', signal => socketRef.current?.emit('sending signal', { userToSignal, callerID, signal }));
        peer.on('error', err => console.error('[createPeer]', err));
        peer.on('connect', () => watchICE(peer, userToSignal));
        // _pc may already be set before 'connect'
        setTimeout(() => watchICE(peer, userToSignal), 500);
        return peer;
    }
    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: true,
            stream: stream || undefined,
            config: COMMON_ICE_CONFIG
        });
        peer.on('signal', signal => socketRef.current?.emit('returning signal', { signal, callerID }));
        peer.on('error', err => console.error('[addPeer]', err));
        peer.on('connect', () => watchICE(peer, callerID));
        setTimeout(() => watchICE(peer, callerID), 500);
        peer.signal(incomingSignal);
        return peer;
    }

    const toggleLocalPiP = async () => {
        if (!userVideo.current) return;
        try {
            if (document.pictureInPictureElement === userVideo.current) {
                await document.exitPictureInPicture();
            } else {
                await userVideo.current.requestPictureInPicture();
            }
        } catch (err) {
            console.error('[Local PiP Error]', err);
        }
    };

    useEffect(() => {
        const onEnterPiP = () => setLocalPipActive(true);
        const onLeavePiP = () => setLocalPipActive(false);

        const videoElem = userVideo.current;
        if (videoElem) {
            videoElem.addEventListener('enterpictureinpicture', onEnterPiP);
            videoElem.addEventListener('leavepictureinpicture', onLeavePiP);
        }
        return () => {
            if (videoElem) {
                videoElem.removeEventListener('enterpictureinpicture', onEnterPiP);
                videoElem.removeEventListener('leavepictureinpicture', onLeavePiP);
            }
        };
    }, []);

    const toggleMic = () => { setMicOn(v => { const n = !v; userStreamRef.current?.getAudioTracks()[0] && (userStreamRef.current.getAudioTracks()[0].enabled = n); return n; }); };
    const toggleVideo = () => { setVideoOn(v => { const n = !v; userStreamRef.current?.getVideoTracks()[0] && (userStreamRef.current.getVideoTracks()[0].enabled = n); return n; }); };
    const leaveCall = () => navigate('/');
    const shareUrl = () => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); };

    // ── Global PiP (Unified Room View) ─────────────────────────────────────────
    const toggleGlobalPiP = async () => {
        if (isGlobalPipActive) {
            if (document.pictureInPictureElement === pipVideoRef.current) {
                await document.exitPictureInPicture();
            }
            setIsGlobalPipActive(false);
            return;
        }

        if (!pipVideoRef.current) return;
        try {
            // We need a gesture to start PiP
            setIsGlobalPipActive(true);
            // Delay slightly to allow canvas/stream to initialize if needed
            setTimeout(async () => {
                try {
                    await pipVideoRef.current.requestPictureInPicture();
                } catch (e) {
                    console.error('PiP request failed', e);
                    setIsGlobalPipActive(false);
                }
            }, 100);
        } catch (err) {
            console.error('[Global PiP Error]', err);
            setIsGlobalPipActive(false);
        }
    };

    useEffect(() => {
        if (!isGlobalPipActive) {
            cancelAnimationFrame(pipRafRef.current);
            return;
        }

        const roomCanvas = canvasRef.current;
        const offscreen = pipCanvasRef.current;
        if (!roomCanvas || !offscreen) return;

        const ctx = offscreen.getContext('2d');
        const cw = roomCanvas.offsetWidth;
        const ch = roomCanvas.offsetHeight;
        offscreen.width = cw;
        offscreen.height = ch;

        const drawCover = (vid, dx, dy, dw, dh) => {
            if (!vid.videoWidth || !vid.videoHeight) return;
            const vidAR = vid.videoWidth / vid.videoHeight;
            const boxAR = dw / dh;
            let sx, sy, sw, sh;
            if (vidAR > boxAR) {
                sw = vid.videoHeight * boxAR;
                sh = vid.videoHeight;
                sx = (vid.videoWidth - sw) / 2;
                sy = 0;
            } else {
                sw = vid.videoWidth;
                sh = vid.videoWidth / boxAR;
                sx = 0;
                sy = (vid.videoHeight - sh) / 2;
            }
            ctx.drawImage(vid, sx, sy, sw, sh, dx, dy, dw, dh);
        };

        const drawFrame = () => {
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, cw, ch);

            const ro = roomCanvas.getBoundingClientRect();
            roomCanvas.querySelectorAll('video').forEach(vid => {
                if (vid.readyState < 2 || !vid.videoWidth || vid === pipVideoRef.current) return;
                const r = vid.getBoundingClientRect();
                const x = r.left - ro.left;
                const y = r.top - ro.top;
                const w = r.width;
                const h = r.height;

                ctx.save();
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, 8);
                ctx.clip();

                if (vid.classList.contains('scale-x-[-1]')) {
                    ctx.translate(x + w, y);
                    ctx.scale(-1, 1);
                    drawCover(vid, 0, 0, w, h);
                } else {
                    drawCover(vid, x, y, w, h);
                }
                ctx.restore();
            });

            // ── Visual Control Bar (The "Footer") ──
            const barH = 34; // height of the controls bar
            ctx.fillStyle = 'rgba(15, 23, 42, 0.95)'; // slate-900 with high opacity
            ctx.fillRect(0, ch - barH, cw, barH);

            // Separator line
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(0, ch - barH, cw, 1);

            // Text/Icon status
            ctx.font = 'bold 12px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const drawBtn = (text, active, x, w) => {
                ctx.fillStyle = active ? '#ffffff' : '#ef4444'; // white vs red-500
                ctx.fillText(text, x + w / 2, ch - barH / 2);
            };

            const mid = cw / 2;
            drawBtn(micOn ? '🎤 MICRO ACTIVADO' : '🔇 MICRO SILENCIADO', micOn, 0, mid);
            drawBtn(videoOn ? '📹 CÁMARA ON' : '🚫 CÁMARA OFF', videoOn, mid, mid);

            // Vertical separator
            ctx.fillStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.fillRect(mid, ch - barH + 6, 1, barH - 12);
        };

        const stream = offscreen.captureStream(15);

        // ── Background Persistence (Silent Audio) ──
        // Browsers often throttle canvas streams if they don't have an active audio track
        let silentTrack = null;
        try {
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const destination = audioCtx.createMediaStreamDestination();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            gainNode.gain.value = 0.001; // extremely quiet
            oscillator.connect(gainNode);
            gainNode.connect(destination);
            oscillator.start();
            silentTrack = destination.stream.getAudioTracks()[0];
            stream.addTrack(silentTrack);
        } catch (e) { console.warn('Silent audio failed', e); }

        pipVideoRef.current.srcObject = stream;
        pipVideoRef.current.play();

        // ── Drawing Loop ──
        // setInterval is better than requestAnimationFrame for background tabs
        const drawInterval = setInterval(drawFrame, 60);

        // ── MediaSession Controls ──
        if ('mediaSession' in navigator) {
            navigator.mediaSession.metadata = new MediaMetadata({
                title: `Nexus Meet: ${roomID}`,
                artist: 'Anterior=Micro | Siguiente=Cámara',
                album: 'Llamada activa (Vista PiP)',
                artwork: [
                    { src: 'https://cdn-icons-png.flaticon.com/512/3616/3616215.png', sizes: '512x512', type: 'image/png' }
                ]
            });

            navigator.mediaSession.setActionHandler('previoustrack', toggleMic);
            navigator.mediaSession.setActionHandler('nexttrack', toggleVideo);
        }

        const handleLeavePiP = () => setIsGlobalPipActive(false);
        pipVideoRef.current.addEventListener('leavepictureinpicture', handleLeavePiP);

        return () => {
            clearInterval(drawInterval);
            if (silentTrack) silentTrack.stop();
            if (pipVideoRef.current) {
                pipVideoRef.current.removeEventListener('leavepictureinpicture', handleLeavePiP);
                pipVideoRef.current.srcObject = null;
            }
        };
    }, [isGlobalPipActive, micOn, videoOn, roomID]);

    // ── Automatic PiP Trigger (Visibility) ────────────────────────────────────
    useEffect(() => {
        const handleVisibilityChangePiP = () => {
            if (document.visibilityState === 'hidden' && !isGlobalPipActive && peers.length > 0) {
                console.log('[Auto-PiP] Attempting automatic transition...');
                toggleGlobalPiP();
            }
        };
        document.addEventListener('visibilitychange', handleVisibilityChangePiP);
        return () => document.removeEventListener('visibilitychange', handleVisibilityChangePiP);
    }, [isGlobalPipActive, peers.length]);

    // ── Host actions ──
    const kickUser = (socketId) => {
        socketRef.current?.emit('kick user', { targetSocketId: socketId });
    };
    const banUser = (socketId, name) => {
        if (!window.confirm(`¿Bloquear permanentemente a ${name} de esta sala?`)) return;
        socketRef.current?.emit('ban user', { targetSocketId: socketId });
    };

    // ── Switch camera or microphone ────────────────────────────────────────────
    const switchDevice = async (kind, deviceId) => {
        if (!deviceId) return;
        try {
            const constraints = kind === 'videoinput'
                ? { video: { deviceId: { exact: deviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
                : { video: false, audio: { deviceId: { exact: deviceId }, echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
            const newStream = await navigator.mediaDevices.getUserMedia(constraints);
            const newTrack = kind === 'videoinput' ? newStream.getVideoTracks()[0] : newStream.getAudioTracks()[0];

            // Stop the old track
            const oldStream = userStreamRef.current;
            const oldTracks = kind === 'videoinput' ? oldStream?.getVideoTracks() : oldStream?.getAudioTracks();
            oldTracks?.forEach(t => t.stop());

            // Replace in the stream
            if (oldStream) {
                oldTracks?.forEach(t => oldStream.removeTrack(t));
                oldStream.addTrack(newTrack);
            }

            // Update local video element
            if (kind === 'videoinput' && userVideo.current) {
                userVideo.current.srcObject = oldStream;
            }

            // Replace on all peer RTCPeerConnections (no renegotiation needed)
            peersRef.current.forEach(({ peer: p }) => {
                const pc = p._pc;
                if (!pc) return;
                const sender = pc.getSenders().find(s => s.track?.kind === newTrack.kind);
                if (sender) sender.replaceTrack(newTrack).catch(console.warn);
            });

            // Update selected device state
            if (kind === 'videoinput') setSelCamera(deviceId);
            else setSelMic(deviceId);
        } catch (err) {
            console.error('[switchDevice]', err);
            alert('No se pudo acceder al dispositivo: ' + err.message);
        }
    };

    // ── Recording ─────────────────────────────────────────────────────────────
    const [isRecording, setIsRecording] = useState(false);
    const [recSeconds, setRecSeconds] = useState(0);
    const recorderRef = useRef(null);
    const recChunksRef = useRef([]);
    const recTimerRef = useRef(null);
    const recRafRef = useRef(null);
    const recCanvasRef = useRef(null);
    const audioCtxRef = useRef(null);

    const startRecording = async () => {
        // ── Build composite canvas matching screen at full DPR ──
        const roomCanvas = canvasRef.current;
        const dpr = window.devicePixelRatio || 1;
        const cw = roomCanvas.offsetWidth;
        const ch = roomCanvas.offsetHeight;

        const offscreen = document.createElement('canvas');
        offscreen.width = Math.round(cw * dpr);
        offscreen.height = Math.round(ch * dpr);
        recCanvasRef.current = offscreen;
        const ctx = offscreen.getContext('2d');
        ctx.scale(dpr, dpr);   // so all coordinates stay in CSS-pixel space

        // Helper: draw a video using object-fit:cover math (no distortion)
        const drawCover = (vid, dx, dy, dw, dh) => {
            if (!vid.videoWidth || !vid.videoHeight) return;
            const vidAR = vid.videoWidth / vid.videoHeight;
            const boxAR = dw / dh;
            let sx, sy, sw, sh;
            if (vidAR > boxAR) {
                // Video wider than box → crop sides
                sh = vid.videoHeight;
                sw = sh * boxAR;
                sx = (vid.videoWidth - sw) / 2;
                sy = 0;
            } else {
                // Video taller than box → crop top/bottom
                sw = vid.videoWidth;
                sh = sw / boxAR;
                sx = 0;
                sy = (vid.videoHeight - sh) / 2;
            }
            ctx.drawImage(vid, sx, sy, sw, sh, dx, dy, dw, dh);
        };

        // Draw all visible <video> elements every frame
        const drawFrame = () => {
            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, cw, ch);

            const ro = roomCanvas.getBoundingClientRect();
            roomCanvas.querySelectorAll('video').forEach(vid => {
                if (vid.readyState < 2 || !vid.videoWidth) return;
                const r = vid.getBoundingClientRect();
                const x = r.left - ro.left;
                const y = r.top - ro.top;
                const w = r.width;
                const h = r.height;

                ctx.save();

                // Clip to the video box (matches the window's visual shape)
                ctx.beginPath();
                ctx.roundRect(x, y, w, h, 6);
                ctx.clip();

                // Mirror local camera (CSS scale-x-[-1])
                if (vid.classList.contains('scale-x-[-1]')) {
                    ctx.translate(x + w, y);
                    ctx.scale(-1, 1);
                    drawCover(vid, 0, 0, w, h);
                } else {
                    drawCover(vid, x, y, w, h);
                }

                ctx.restore();
            });

            recRafRef.current = requestAnimationFrame(drawFrame);
        };
        recRafRef.current = requestAnimationFrame(drawFrame);

        const videoStream = offscreen.captureStream(30);

        // ── Mix all audio tracks ──
        const audioCtx = new AudioContext();
        audioCtxRef.current = audioCtx;
        const dest = audioCtx.createMediaStreamDestination();

        // Local mic
        if (userStreamRef.current) {
            const src = audioCtx.createMediaStreamSource(userStreamRef.current);
            src.connect(dest);
        }
        // All peer audio tracks
        peersRef.current.forEach(({ peer: p }) => {
            if (p.streams?.[0]) {
                try {
                    const src = audioCtx.createMediaStreamSource(p.streams[0]);
                    src.connect(dest);
                } catch (_) { }
            }
        });

        // Combine video + audio
        const combined = new MediaStream([
            ...videoStream.getVideoTracks(),
            ...dest.stream.getAudioTracks(),
        ]);

        // Choose best supported codec
        const mimeType = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
            .find(t => MediaRecorder.isTypeSupported(t)) || '';

        const recorder = new MediaRecorder(combined, mimeType ? { mimeType } : {});
        recorderRef.current = recorder;
        recChunksRef.current = [];
        recorder.ondataavailable = e => { if (e.data.size > 0) recChunksRef.current.push(e.data); };
        recorder.onstop = () => {
            const blob = new Blob(recChunksRef.current, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            const a = Object.assign(document.createElement('a'), { href: url, download: `familycall-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm` });
            document.body.appendChild(a); a.click(); document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 5000);
        };
        recorder.start(1000);   // collect chunk every second
        setIsRecording(true);
        setRecSeconds(0);
        recTimerRef.current = setInterval(() => setRecSeconds(s => s + 1), 1000);
    };

    const stopRecording = () => {
        recorderRef.current?.stop();
        cancelAnimationFrame(recRafRef.current);
        audioCtxRef.current?.close();
        clearInterval(recTimerRef.current);
        setIsRecording(false);
        setRecSeconds(0);
    };

    const fmtTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

    const hidePeer = (id) => setHiddenPeers(prev => new Set([...prev, id]));
    const toggleFullscreen = (id) => setFullscreenId(prev => prev === id ? null : id);

    const handleLayoutChange = (mode) => {
        setLayoutMode(mode);
        setFullscreenId(null);
        setLayoutOpen(false);
        setTimeout(() => {
            const ids = getAllIds(peers, localHidden);
            applyLayout(mode, ids);
        }, 60);
    };

    const visiblePeers = peers.filter(p => !hiddenPeers.has(p.peerID));
    const localIndex = 0;
    const peerOffset = localHidden ? 0 : 1;

    const LAYOUT_OPTIONS = [
        { id: 'grid', label: 'Cuadrícula', icon: <LayoutGrid size={18} /> },
        { id: 'spotlight', label: 'Spotlight', icon: <Layout size={18} /> },
        { id: 'strip', label: 'Tira', icon: <Rows3 size={18} /> },
        { id: 'speaker', label: 'Orador activo', icon: <Volume2 size={18} /> },
    ];

    return (
        <div
            className="room-stage"
            ref={roomRef}
            onMouseMove={wakeControls}
            onTouchStart={wakeControls}
            onPointerMove={wakeControls}
        >
            <div className="room-ambient" />

            {/* ── Password Prompt Modal ── */}
            {needsPassword && !joinRejected && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
                    <div className="relative w-full max-w-sm">
                        <div className="absolute -inset-3 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-[40px] blur-2xl opacity-20 pointer-events-none" />
                        <div className="relative glass-morphism rounded-[28px] p-8 shadow-2xl flex flex-col items-center gap-5">
                            <div className="w-14 h-14 bg-gradient-to-tr from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 rounded-2xl flex items-center justify-center">
                                <Lock size={26} className="text-indigo-400" />
                            </div>
                            <div className="text-center">
                                <h2 className="text-2xl font-bold text-white mb-1">Sala protegida</h2>
                                <p className="text-slate-400 text-sm">Esta sala requiere contraseña para entrar</p>
                            </div>
                            <form
                                onSubmit={e => {
                                    e.preventDefault();
                                    setPwWrong(false);
                                    setNeedsPassword(false);
                                    // needsPasswordRef stays true so next rejection shows inline error
                                    socketRef.current?._rejoinWithPw?.(pwInput);
                                }}
                                className="w-full flex flex-col gap-3"
                            >
                                <div className="flex flex-col gap-1">
                                    <input
                                        type="password"
                                        placeholder="Introduce la contraseña"
                                        autoFocus
                                        value={pwInput}
                                        onChange={e => setPwInput(e.target.value)}
                                        className={`w-full bg-slate-900/70 border rounded-2xl px-5 py-4 text-white text-base placeholder:text-slate-600 focus:outline-none focus:ring-2 transition-all ${pwWrong
                                            ? 'border-red-500/60 focus:ring-red-500/40'
                                            : 'border-slate-700 focus:ring-indigo-500/60'
                                            }`}
                                    />
                                    {pwWrong && (
                                        <p className="text-red-400 text-xs font-medium ml-1 mt-0.5">Contraseña incorrecta. Inténtalo de nuevo.</p>
                                    )}
                                </div>
                                <button
                                    type="submit"
                                    className="premium-button premium-button-primary py-4 rounded-xl text-base font-bold"
                                >
                                    <Lock size={18} />
                                    Entrar
                                </button>
                                <button
                                    type="button"
                                    onClick={() => navigate('/')}
                                    className="text-slate-500 text-sm hover:text-slate-300 transition-colors py-1"
                                >
                                    Cancelar y volver al inicio
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}
            {joinRejected && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/95 backdrop-blur-md p-4">
                    <div className="relative w-full max-w-sm">
                        <div className="absolute -inset-3 bg-gradient-to-r from-red-500 to-orange-600 rounded-[40px] blur-2xl opacity-20 pointer-events-none" />
                        <div className="relative glass-morphism rounded-[28px] p-8 shadow-2xl flex flex-col items-center gap-5 text-center">
                            <div className={`w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg ${joinRejected === 'banned' ? 'bg-red-500/15 shadow-red-500/20' :
                                joinRejected === 'kicked' ? 'bg-orange-500/15 shadow-orange-500/20' :
                                    'bg-yellow-500/15 shadow-yellow-500/20'
                                }`}>
                                {joinRejected === 'banned' ? <ShieldOff size={28} className="text-red-400" /> :
                                    joinRejected === 'kicked' ? <UserX size={28} className="text-orange-400" /> :
                                        <Lock size={28} className="text-yellow-400" />}
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white mb-2">
                                    {joinRejected === 'banned' ? 'Acceso bloqueado' :
                                        joinRejected === 'kicked' ? 'Has sido expulsado' :
                                            'Contraseña incorrecta'}
                                </h2>
                                <p className="text-slate-400 text-sm leading-relaxed">
                                    {joinRejected === 'banned' ? 'El anfitrión ha bloqueado tu acceso a esta sala permanentemente.' :
                                        joinRejected === 'kicked' ? 'El anfitrión te ha expulsado de la sala.' :
                                            'La contraseña que ingresaste no es correcta. Verifica e intenta de nuevo.'}
                                </p>
                            </div>
                            <button
                                onClick={() => navigate('/')}
                                className="w-full premium-button premium-button-primary py-3 rounded-xl text-sm font-bold"
                            >
                                Volver al inicio
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Name prompt modal (shown to direct-link guests) ── */}
            {!nameReady && !joinRejected && (
                <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/90 backdrop-blur-md p-4">
                    <div className="relative w-full max-w-sm">
                        {/* Glow */}
                        <div className="absolute -inset-3 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-[40px] blur-2xl opacity-20 pointer-events-none" />
                        <div className="relative glass-morphism rounded-[28px] p-8 shadow-2xl flex flex-col items-center gap-6">
                            <div className="w-14 h-14 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-2xl flex items-center justify-center shadow-lg shadow-indigo-500/30">
                                <Video size={26} className="text-white" />
                            </div>
                            <div className="text-center">
                                <h2 className="text-2xl font-bold text-white mb-1">¿Cómo te llamas?</h2>
                                <p className="text-slate-400 text-sm">Para que los demás sepan quién eres</p>
                            </div>
                            <form onSubmit={confirmName} className="w-full flex flex-col gap-3">
                                <input
                                    type="text"
                                    placeholder="ej. Carlos López"
                                    autoFocus
                                    maxLength={32}
                                    autoComplete="nickname"
                                    autoCapitalize="words"
                                    value={nameInput}
                                    onChange={e => setNameInput(e.target.value)}
                                    className="w-full bg-slate-900/70 border border-slate-700 rounded-2xl px-5 py-4 text-white text-base placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/60 transition-all"
                                />
                                <button
                                    type="submit"
                                    className="premium-button premium-button-primary py-4 rounded-xl text-base font-bold"
                                >
                                    <Video size={18} />
                                    Entrar a la llamada
                                </button>
                            </form>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Top Bar ── */}
            <header className="room-header">
                {/* Room identity pill */}
                <div className="room-header__identity">
                    <img src="/logo.png" alt="Nexus" className="w-7 h-7 sm:w-8 sm:h-8 object-contain drop-shadow-md shrink-0" />
                    <div className="min-w-0">
                        <p className="text-xs sm:text-sm font-bold text-white truncate leading-none mb-0.5">{roomID}</p>
                        <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest flex items-center gap-1 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse inline-block shrink-0" />
                            {peers.length + 1} en línea
                        </span>
                    </div>
                </div>

                {/* Desktop layout switcher — CSS media query controls visibility */}
                <div className="layout-switcher">
                    <span className="layout-switcher__label">Vista</span>
                    {LAYOUT_OPTIONS.map(opt => (
                        <button
                            key={opt.id}
                            onClick={() => handleLayoutChange(opt.id)}
                            className={`layout-btn ${layoutMode === opt.id ? 'layout-btn--active' : ''}`}
                            title={opt.label}
                        >
                            {opt.icon}
                            <span className="hidden lg:inline">{opt.label}</span>
                        </button>
                    ))}
                    {layoutMode !== 'free' && (
                        <button onClick={() => setLayoutMode('free')} className="layout-btn layout-btn--reset" title="Libre">
                            <AlignJustify size={14} />
                        </button>
                    )}
                </div>

                {/* Right actions */}
                <div className="room-header__actions">
                    {/* Mobile layout toggle — CSS media query hides above md */}
                    <button
                        className="room-header__icon-btn header-mobile-only"
                        onClick={() => setLayoutOpen(v => !v)}
                        title="Organizar vista"
                    >
                        <LayoutGrid size={16} />
                    </button>

                    {/* Participants panel */}
                    <button
                        onClick={() => setParticipantsOpen(v => !v)}
                        className={`room-header__icon-btn ${participantsOpen ? 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30' : ''}`}
                        title="Participantes"
                    >
                        <Users size={16} />
                        <span className="text-xs font-bold">{peers.length + 1}</span>
                    </button>

                    {/* Share — CSS class hides below 600px */}
                    <button
                        onClick={shareUrl}
                        className="room-header__icon-btn header-sm-up"
                        title="Compartir"
                    >
                        <Share2 size={16} />
                        <span className="hidden md:inline text-xs font-bold uppercase tracking-wider">
                            {copied ? 'Copiado' : 'Compartir'}
                        </span>
                    </button>

                    {/* Fullscreen — CSS class hides below 600px */}
                    <button
                        onClick={toggleAppFullscreen}
                        className="room-header__icon-btn header-sm-up"
                        title={appFullscreen ? 'Salir de pantalla completa' : 'Pantalla completa'}
                    >
                        {appFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>

                    <button
                        onClick={leaveCall}
                        className="room-header__leave-btn"
                        title="Salir"
                    >
                        <PhoneOff size={16} />
                        <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider">Salir</span>
                    </button>
                </div>
            </header>

            {/* ── Participants Panel ── */}
            {participantsOpen && (
                <div className="fixed top-16 right-4 z-50 w-72">
                    <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/60 overflow-hidden">
                        {/* Header */}
                        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
                            <div className="flex items-center gap-2">
                                <Users size={15} className="text-indigo-400" />
                                <span className="text-sm font-bold text-white">Participantes</span>
                                {isHost && (
                                    <span className="text-[9px] font-bold uppercase tracking-widest bg-indigo-500/20 text-indigo-400 px-2 py-0.5 rounded-full ml-1">Anfitrión</span>
                                )}
                            </div>
                            <button onClick={() => setParticipantsOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
                                <X size={15} />
                            </button>
                        </div>

                        {/* List */}
                        <div className="max-h-80 overflow-y-auto">
                            {/* Local user */}
                            <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/50">
                                <div className="w-8 h-8 bg-indigo-500/20 rounded-xl flex items-center justify-center shrink-0">
                                    <span className="text-xs font-bold text-indigo-400">{(myName || 'Y')[0].toUpperCase()}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-semibold text-white truncate">{myName || 'Tú'}</p>
                                    <p className="text-[10px] text-slate-500">{isHost ? 'Anfitrión · Tú' : 'Tú'}</p>
                                </div>
                            </div>

                            {/* Remote peers */}
                            {peers.map(p => (
                                <div key={p.peerID} className="flex items-center gap-3 px-4 py-3 border-b border-slate-800/30 last:border-0 group hover:bg-slate-800/30 transition-colors">
                                    <div className="w-8 h-8 bg-slate-700/50 rounded-xl flex items-center justify-center shrink-0">
                                        <span className="text-xs font-bold text-slate-300">{(peerNames[p.peerID] || '?')[0].toUpperCase()}</span>
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-semibold text-white truncate">{peerNames[p.peerID] || 'Participante'}</p>
                                        <p className="text-[10px] text-slate-500">En llamada</p>
                                    </div>
                                    {/* Host-only controls */}
                                    {isHost && (
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button
                                                onClick={() => kickUser(p.peerID)}
                                                title="Expulsar"
                                                className="p-1.5 rounded-lg text-orange-400 hover:bg-orange-500/15 transition-colors"
                                            >
                                                <UserX size={14} />
                                            </button>
                                            <button
                                                onClick={() => banUser(p.peerID, peerNames[p.peerID] || 'este usuario')}
                                                title="Bloquear por IP"
                                                className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/15 transition-colors"
                                            >
                                                <ShieldOff size={14} />
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}

                            {peers.length === 0 && (
                                <div className="px-4 py-6 text-center">
                                    <p className="text-slate-500 text-xs">Nadie más en la sala</p>
                                </div>
                            )}
                        </div>

                        {isHost && peers.length > 0 && (
                            <div className="px-4 py-2.5 bg-slate-950/40 border-t border-slate-800">
                                <p className="text-[10px] text-slate-600 flex items-center gap-1.5">
                                    <UserX size={10} className="text-orange-400/60" /> Expulsar · temporal &nbsp;
                                    <ShieldOff size={10} className="text-red-400/60" /> Bloquear · permanente (por IP)
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}


            {/* ── Mobile layout sheet (bottom slide-up) ── */}
            {layoutOpen && (
                <div className="mobile-layout-sheet">
                    <div className="mobile-layout-sheet__handle" />
                    <p className="mobile-layout-sheet__title">Organizar vista</p>
                    <div className="mobile-layout-sheet__options">
                        {LAYOUT_OPTIONS.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => handleLayoutChange(opt.id)}
                                className={`mobile-layout-option ${layoutMode === opt.id ? 'mobile-layout-option--active' : ''}`}
                            >
                                {opt.icon}
                                <span>{opt.label}</span>
                            </button>
                        ))}
                        <button
                            onClick={() => { setLayoutMode('free'); setLayoutOpen(false); }}
                            className={`mobile-layout-option ${layoutMode === 'free' ? 'mobile-layout-option--active' : ''}`}
                        >
                            <AlignJustify size={18} />
                            <span>Libre</span>
                        </button>
                    </div>
                </div>
            )}

            {/* ── Canvas ── */}
            <div className="room-canvas" ref={canvasRef}>
                {!localHidden && (
                    <VideoWindow
                        id="local" title={myName}
                        pos={getPosForId('local', localIndex)}
                        size={getSizeForId('local', localIndex)}
                        onPosChange={p => { setLayoutMode('free'); setPosForId('local')(p); }}
                        onSizeChange={s => { setLayoutMode('free'); setSizeForId('local')(s); }}
                        onClose={() => setLocalHidden(true)}
                        fullscreen={fullscreenId === 'local'}
                        onFullscreen={() => toggleFullscreen('local')}
                        onPiP={toggleLocalPiP}
                        pipActive={localPipActive}
                    >
                        <video muted ref={userVideo} autoPlay playsInline className="video-element scale-x-[-1]" />
                        {localPipActive && (
                            <div className="absolute inset-0 bg-slate-900/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-30">
                                <div className="w-12 h-12 bg-indigo-500/20 rounded-full flex items-center justify-center animate-pulse">
                                    <PictureInPicture size={24} className="text-indigo-400" />
                                </div>
                                <span className="text-[10px] font-bold text-white uppercase tracking-widest text-center px-4">
                                    Tu cámara en ventana flotante
                                </span>
                                <button
                                    onClick={toggleLocalPiP}
                                    className="mt-2 px-3 py-1.5 bg-indigo-500 rounded-lg text-[10px] font-bold text-white uppercase tracking-wider"
                                >
                                    Volver a la sala
                                </button>
                            </div>
                        )}
                        {!videoOn && (
                            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center gap-3 z-10">
                                <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center border border-white/5">
                                    <VideoOff size={28} className="text-slate-600" />
                                </div>
                                <span className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Cámara Desactivada</span>
                            </div>
                        )}
                        {!micOn && (
                            <div className="absolute top-1 right-1 bg-red-500 p-1.5 rounded-lg z-20">
                                <MicOff size={11} className="text-white" />
                            </div>
                        )}
                    </VideoWindow>
                )}

                {visiblePeers.map((peer, i) => (
                    <VideoParticipant
                        key={peer.peerID}
                        peer={peer.peer} peerID={peer.peerID}
                        name={peerNames[peer.peerID] || 'Familiar'}
                        closing={closingPeers.has(peer.peerID)}
                        onClose={() => hidePeer(peer.peerID)}
                        pos={getPosForId(peer.peerID, peerOffset + i)}
                        size={getSizeForId(peer.peerID, peerOffset + i)}
                        onPosChange={p => { setLayoutMode('free'); setPosForId(peer.peerID)(p); }}
                        onSizeChange={s => { setLayoutMode('free'); setSizeForId(peer.peerID)(s); }}
                        fullscreen={fullscreenId === peer.peerID}
                        onFullscreen={() => toggleFullscreen(peer.peerID)}
                    />
                ))}

                {peers.length === 0 && !localHidden && (
                    <div className="room-empty-hint">
                        <p>Comparte el enlace para invitar a alguien</p>
                    </div>
                )}
            </div>

            {/* ── Device Settings Panel ── */}
            {settingsOpen && (
                <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-sm">
                    <div className="bg-slate-900/95 backdrop-blur-xl border border-slate-700/60 rounded-2xl shadow-2xl shadow-black/60 p-5 flex flex-col gap-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-sm font-bold text-white tracking-wide">Dispositivos de audio/video</h3>
                            <button onClick={() => setSettingsOpen(false)} className="text-slate-500 hover:text-white transition-colors p-1 rounded-lg hover:bg-white/5">
                                <X size={16} />
                            </button>
                        </div>

                        {/* Camera selector */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Video size={11} /> Cámara
                            </label>
                            <select
                                value={selCamera}
                                onChange={e => switchDevice('videoinput', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all cursor-pointer"
                            >
                                {cameras.map(c => (
                                    <option key={c.deviceId} value={c.deviceId}>{c.label}</option>
                                ))}
                                {cameras.length === 0 && <option disabled>Sin cámaras detectadas</option>}
                            </select>
                        </div>

                        {/* Mic selector */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                                <Mic size={11} /> Micrófono
                            </label>
                            <select
                                value={selMic}
                                onChange={e => switchDevice('audioinput', e.target.value)}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all cursor-pointer"
                            >
                                {mics.map(m => (
                                    <option key={m.deviceId} value={m.deviceId}>{m.label}</option>
                                ))}
                                {mics.length === 0 && <option disabled>Sin micrófonos detectados</option>}
                            </select>
                        </div>

                        {/* Live audio meter */}
                        <div className="flex flex-col gap-1.5">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                                Nivel de entrada
                            </label>
                            <div className="bg-slate-800 rounded-xl p-3">
                                <AudioMeter stream={userStreamRef.current} />
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Persistent mini mic meter ── */}
            <div
                style={{
                    transition: 'opacity 0.4s ease, transform 0.4s ease',
                    opacity: controlsVisible ? 1 : 0,
                    transform: controlsVisible ? 'translateY(0)' : 'translateY(20px)',
                    pointerEvents: 'none',
                }}
                className="fixed bottom-[4.75rem] left-1/2 -translate-x-1/2 z-40 w-40 sm:w-52"
            >
                <AudioMeter stream={userStreamRef.current} />
            </div>

            {/* ── Floating Controls ── */}
            <div
                className="floating-controls"
                style={{
                    transition: 'opacity 0.4s ease, transform 0.4s ease',
                    opacity: controlsVisible ? 1 : 0,
                    transform: controlsVisible ? 'translateX(-50%) translateY(0)' : 'translateX(-50%) translateY(calc(100% + 1.5rem))',
                    pointerEvents: controlsVisible ? 'auto' : 'none',
                }}
            >
                <ControlButton active={micOn} onClick={toggleMic}
                    icon={micOn ? <Mic size={20} /> : <MicOff size={20} />}
                    label={micOn ? 'Silenciar' : 'Activar'} />
                <ControlButton active={videoOn} onClick={toggleVideo}
                    icon={videoOn ? <Video size={20} /> : <VideoOff size={20} />}
                    label={videoOn ? 'Apagar' : 'Encender'} />
                {localHidden && (
                    <ControlButton active={true} onClick={() => setLocalHidden(false)}
                        icon={<Video size={20} />} label="Mi Cam" />
                )}

                {/* Settings button */}
                <ControlButton
                    active={!settingsOpen}
                    onClick={() => setSettingsOpen(v => !v)}
                    icon={<Settings size={20} className={settingsOpen ? 'text-indigo-400' : ''} />}
                    label="Dispositivos"
                />

                <div className="w-px h-9 bg-slate-800 mx-1 self-center" />

                {/* Global PiP Button */}
                {document.pictureInPictureEnabled && (
                    <ControlButton
                        active={!isGlobalPipActive}
                        onClick={toggleGlobalPiP}
                        icon={<PictureInPicture size={20} className={isGlobalPipActive ? 'text-indigo-400' : ''} />}
                        label="Vista PiP"
                    />
                )}

                {/* Record button */}
                <button
                    onClick={isRecording ? stopRecording : startRecording}
                    title={isRecording ? 'Detener grabación' : 'Grabar llamada'}
                    className={`group relative flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${isRecording ? 'text-red-400' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}
                >
                    <div className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl transition-all border ${isRecording ? 'bg-red-500/10 border-red-500/30' : 'bg-slate-900 border-slate-800 group-hover:border-slate-700'}`}>
                        {isRecording
                            ? <span className="w-4 h-4 rounded bg-red-500 animate-pulse" />
                            : <Circle size={20} />
                        }
                    </div>
                    <span className={`text-[8px] font-bold uppercase tracking-wider ${isRecording ? 'opacity-100 text-red-400' : 'opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-4 whitespace-nowrap'}`}>
                        {isRecording ? fmtTime(recSeconds) : 'Grabar'}
                    </span>
                </button>

                <div className="w-px h-9 bg-slate-800 mx-1 self-center" />
                <button
                    onClick={leaveCall}
                    className="w-12 h-12 sm:w-14 sm:h-14 bg-red-500 hover:bg-red-400 text-white rounded-xl sm:rounded-[1.25rem] flex items-center justify-center shadow-xl shadow-red-500/30 active:scale-90 transition-all"
                >
                    <PhoneOff size={20} />
                </button>
            </div>

            {/* Hidden elements for Global PiP */}
            <canvas ref={pipCanvasRef} style={{ display: 'none' }} />
            <video
                ref={pipVideoRef}
                style={{ display: 'none' }}
                playsInline
                muted
                autoPictureInPicture={true}
            />
        </div>
    );
};

const ControlButton = ({ active, onClick, icon, label }) => (
    <button
        onClick={onClick}
        className={`group relative flex flex-col items-center gap-1 p-1.5 rounded-xl transition-all ${active ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-red-500 bg-red-500/5'}`}
    >
        <div className={`w-10 h-10 sm:w-12 sm:h-12 flex items-center justify-center rounded-xl transition-all ${active ? 'bg-slate-900 border border-slate-800 group-hover:border-slate-700' : 'bg-red-500/10 border border-red-500/20'}`}>
            {icon}
        </div>
        <span className="text-[8px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-4 whitespace-nowrap">{label}</span>
    </button>
);

export default Room;
