import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Mic, MicOff, Video, VideoOff, PhoneOff, Share2, X,
    Maximize2, Minimize2, LayoutGrid, Layout, Rows3, AlignJustify, ChevronUp
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
            const cols = Math.ceil(Math.sqrt(count));
            const rows = Math.ceil(count / cols);
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
        default: return [];
    }
}

// ─── Draggable + Resizable Window ────────────────────────────────────────────
const VideoWindow = ({ id, title, children, pos, size, onPosChange, onSizeChange, onClose, closing, fullscreen, onFullscreen }) => {
    const [dragging, setDragging] = useState(false);
    const [resizing, setResizing] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    // ── start drag (mouse + touch) ──
    const startDrag = (e) => {
        if (fullscreen) return;
        e.preventDefault();
        const p = getPointer(e);
        dragOffset.current = { x: p.x - pos.x, y: p.y - pos.y };
        setDragging(true);
    };

    // ── start resize ──
    const startResize = (e) => {
        if (fullscreen) return;
        e.preventDefault();
        e.stopPropagation();
        const p = getPointer(e);
        resizeStart.current = { x: p.x, y: p.y, w: size.w, h: size.h };
        setResizing(true);
    };

    useEffect(() => {
        if (!dragging && !resizing) return;
        const onMove = (e) => {
            const p = getPointer(e);
            if (dragging) onPosChange?.({ x: Math.max(0, p.x - dragOffset.current.x), y: Math.max(0, p.y - dragOffset.current.y) });
            if (resizing) {
                const dx = p.x - resizeStart.current.x;
                const dy = p.y - resizeStart.current.y;
                onSizeChange?.({ w: Math.max(200, resizeStart.current.w + dx), h: Math.max(140, resizeStart.current.h + dy) });
            }
        };
        const onEnd = () => { setDragging(false); setResizing(false); };

        window.addEventListener('mousemove', onMove);
        window.addEventListener('mouseup', onEnd);
        window.addEventListener('touchmove', onMove, { passive: false });
        window.addEventListener('touchend', onEnd);
        return () => {
            window.removeEventListener('mousemove', onMove);
            window.removeEventListener('mouseup', onEnd);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
        };
    }, [dragging, resizing]);

    return (
        <div
            className={`video-window ${closing ? 'video-window--closing' : ''} ${fullscreen ? 'video-window--fullscreen' : ''}`}
            style={fullscreen ? {} : { left: pos.x, top: pos.y, width: size.w, height: size.h }}
        >
            {/* Title bar — drag handle */}
            <div
                className="video-window__titlebar"
                onMouseDown={startDrag}
                onTouchStart={startDrag}
            >
                <span className="video-window__title">{title}</span>
                <div className="flex items-center gap-1">
                    <button className="video-window__close" onClick={onFullscreen} title={fullscreen ? 'Restaurar' : 'Pantalla completa'}>
                        {fullscreen ? <Minimize2 size={12} /> : <Maximize2 size={12} />}
                    </button>
                    {onClose && (
                        <button className="video-window__close" onClick={onClose} title="Cerrar">
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
                    onMouseDown={startResize}
                    onTouchStart={startResize}
                />
            )}
        </div>
    );
};

// ─── Remote Participant ───────────────────────────────────────────────────────
const VideoParticipant = ({ peer, peerID, onClose, closing, pos, size, onPosChange, onSizeChange, fullscreen, onFullscreen }) => {
    const ref = useRef();
    const [remoteStream, setRemoteStream] = useState(null);

    useEffect(() => {
        const onStream = (stream) => setRemoteStream(stream);
        peer.on('stream', onStream);
        if (peer._remoteStreams?.[0]) setRemoteStream(peer._remoteStreams[0]);
        return () => peer.off('stream', onStream);
    }, [peer]);

    useEffect(() => {
        if (remoteStream && ref.current) ref.current.srcObject = remoteStream;
    }, [remoteStream]);

    return (
        <VideoWindow
            id={peerID} title="FAMILIAR"
            pos={pos} size={size}
            onPosChange={onPosChange} onSizeChange={onSizeChange}
            onClose={onClose} closing={closing}
            fullscreen={fullscreen} onFullscreen={onFullscreen}
        >
            <video playsInline autoPlay ref={ref} className="video-element" />
            {!remoteStream && (
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
    const [peers, setPeers] = useState([]);
    const [micOn, setMicOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);
    const [copied, setCopied] = useState(false);
    const [closingPeers, setClosingPeers] = useState(new Set());
    const [hiddenPeers, setHiddenPeers] = useState(new Set());
    const [localHidden, setLocalHidden] = useState(false);
    const [fullscreenId, setFullscreenId] = useState(null);
    const [layoutMode, setLayoutMode] = useState('free');
    const [layoutOpen, setLayoutOpen] = useState(false);      // mobile layout sheet
    const [windowPos, setWindowPos] = useState({});
    const [windowSize, setWindowSize] = useState({});

    const canvasRef = useRef();
    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]);
    const userStreamRef = useRef(null);

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

    useEffect(() => {
        if (layoutMode === 'free') return;
        const ids = getAllIds(peers, localHidden);
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
        const envUrl = import.meta.env.VITE_SERVER_URL;
        const serverUrl = envUrl || (window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://chatfamily.onrender.com');
        socketRef.current = io.connect(serverUrl, { transports: ['websocket'], upgrade: false });

        navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: true,
        }).then(stream => {
            userStreamRef.current = stream;
            if (userVideo.current) userVideo.current.srcObject = stream;
            socketRef.current.emit('join room', roomID);

            socketRef.current.on('all users', users => {
                const newPeers = users.map(uid => {
                    const peer = createPeer(uid, socketRef.current.id, stream);
                    peersRef.current.push({ peerID: uid, peer });
                    return { peerID: uid, peer };
                });
                setPeers(newPeers);
            });
            socketRef.current.on('user joined', payload => {
                const peer = addPeer(payload.signal, payload.callerID, stream);
                peersRef.current.push({ peerID: payload.callerID, peer });
                setPeers(prev => [...prev, { peerID: payload.callerID, peer }]);
            });
            socketRef.current.on('receiving returned signal', payload => {
                const item = peersRef.current.find(p => p.peerID === payload.id);
                if (item) item.peer.signal(payload.signal);
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
        }).catch(err => {
            console.error('Camera error:', err);
            alert('Por favor, permite el acceso a la cámara y micrófono para usar la app.');
        });

        return () => {
            socketRef.current?.disconnect();
            userStreamRef.current?.getTracks().forEach(t => t.stop());
        };
    }, []);

    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({ initiator: true, trickle: false, stream: stream || undefined, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } });
        peer.on('signal', signal => socketRef.current?.emit('sending signal', { userToSignal, callerID, signal }));
        peer.on('error', err => console.error('[createPeer]', err));
        return peer;
    }
    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({ initiator: false, trickle: false, stream: stream || undefined, config: { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }, { urls: 'stun:global.stun.twilio.com:3478' }] } });
        peer.on('signal', signal => socketRef.current?.emit('returning signal', { signal, callerID }));
        peer.on('error', err => console.error('[addPeer]', err));
        peer.signal(incomingSignal);
        return peer;
    }

    const toggleMic = () => { setMicOn(v => { const n = !v; userStreamRef.current?.getAudioTracks()[0] && (userStreamRef.current.getAudioTracks()[0].enabled = n); return n; }); };
    const toggleVideo = () => { setVideoOn(v => { const n = !v; userStreamRef.current?.getVideoTracks()[0] && (userStreamRef.current.getVideoTracks()[0].enabled = n); return n; }); };
    const leaveCall = () => navigate('/');
    const shareUrl = () => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); };
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
    ];

    return (
        <div className="room-stage">
            <div className="room-ambient" />

            {/* ── Top Bar ── */}
            <header className="room-header">
                {/* Room identity pill — shrinks first on small screens */}
                <div className="room-header__identity">
                    <div className="w-8 h-8 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shrink-0">
                        <Video size={15} className="text-white" />
                    </div>
                    <div className="min-w-0 hidden xs:block">
                        <p className="text-sm font-bold text-white truncate leading-none mb-0.5">{roomID}</p>
                        <span className="text-[9px] text-indigo-400 font-bold uppercase tracking-widest flex items-center gap-1 whitespace-nowrap">
                            <span className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse inline-block shrink-0" />
                            {peers.length + 1} en línea
                        </span>
                    </div>
                </div>

                {/* Desktop layout switcher — hidden below md */}
                <div className="layout-switcher hidden md:flex">
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
                    {/* Mobile layout toggle */}
                    <button
                        className="room-header__icon-btn md:hidden"
                        onClick={() => setLayoutOpen(v => !v)}
                        title="Organizar vista"
                    >
                        <LayoutGrid size={17} />
                    </button>

                    <button
                        onClick={shareUrl}
                        className="room-header__icon-btn"
                        title="Compartir"
                    >
                        <Share2 size={17} />
                        <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider">
                            {copied ? 'Copiado' : 'Compartir'}
                        </span>
                    </button>

                    <button
                        onClick={leaveCall}
                        className="room-header__leave-btn"
                        title="Salir"
                    >
                        <PhoneOff size={17} />
                        <span className="hidden sm:inline text-xs font-bold uppercase tracking-wider">Salir</span>
                    </button>
                </div>
            </header>


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
                        id="local" title="TÚ"
                        pos={getPosForId('local', localIndex)}
                        size={getSizeForId('local', localIndex)}
                        onPosChange={p => { setLayoutMode('free'); setPosForId('local')(p); }}
                        onSizeChange={s => { setLayoutMode('free'); setSizeForId('local')(s); }}
                        onClose={() => setLocalHidden(true)}
                        fullscreen={fullscreenId === 'local'}
                        onFullscreen={() => toggleFullscreen('local')}
                    >
                        <video muted ref={userVideo} autoPlay playsInline className="video-element scale-x-[-1]" />
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

            {/* ── Floating Controls ── */}
            <div className="floating-controls">
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
                <div className="w-px h-9 bg-slate-800 mx-1 self-center" />
                <button
                    onClick={leaveCall}
                    className="w-12 h-12 sm:w-14 sm:h-14 bg-red-500 hover:bg-red-400 text-white rounded-xl sm:rounded-[1.25rem] flex items-center justify-center shadow-xl shadow-red-500/30 active:scale-90 transition-all"
                >
                    <PhoneOff size={20} />
                </button>
            </div>
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
