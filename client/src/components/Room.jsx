import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { useParams, useNavigate } from 'react-router-dom';
import {
    Mic, MicOff, Video, VideoOff, PhoneOff, Share2, X,
    Maximize2, Minimize2, LayoutGrid, Layout, AlignJustify, Rows3
} from 'lucide-react';

// ─── Layout helpers ───────────────────────────────────────────────────────────
/**
 * Compute { x, y, w, h } positions for each window given a layout mode.
 * canvasW / canvasH = dimensions of the canvas
 * count = total number of windows (including local)
 */
function computeLayout(mode, count, canvasW, canvasH) {
    const PAD = 16;
    const HEADER_H = 0; // windows already inside canvas

    if (count === 0) return [];

    switch (mode) {
        case 'grid': {
            // Responsive grid: try to keep closest to 16/9
            const cols = Math.ceil(Math.sqrt(count));
            const rows = Math.ceil(count / cols);
            const cellW = Math.floor((canvasW - PAD * (cols + 1)) / cols);
            const cellH = Math.floor((canvasH - PAD * (rows + 1)) / rows);
            return Array.from({ length: count }, (_, i) => {
                const col = i % cols;
                const row = Math.floor(i / cols);
                return {
                    x: PAD + col * (cellW + PAD),
                    y: PAD + row * (cellH + PAD),
                    w: cellW,
                    h: cellH,
                };
            });
        }

        case 'spotlight': {
            // First window = big center, rest = sidebar column
            const SIDEBAR_W = 200;
            const SIDEBAR_PAD = 8;
            const bigW = count === 1 ? canvasW - PAD * 2 : canvasW - SIDEBAR_W - PAD * 3;
            const bigH = canvasH - PAD * 2;

            const positions = [{
                x: PAD,
                y: PAD,
                w: bigW,
                h: bigH,
            }];

            const sideCount = count - 1;
            if (sideCount > 0) {
                const sideH = Math.floor((canvasH - SIDEBAR_PAD * (sideCount + 1)) / sideCount);
                for (let i = 0; i < sideCount; i++) {
                    positions.push({
                        x: PAD + bigW + PAD,
                        y: SIDEBAR_PAD + i * (sideH + SIDEBAR_PAD),
                        w: SIDEBAR_W,
                        h: Math.min(sideH, 160),
                    });
                }
            }
            return positions;
        }

        case 'strip': {
            // Horizontal strip — all windows same height, equal width
            const w = Math.floor((canvasW - PAD * (count + 1)) / count);
            const h = canvasH - PAD * 2;
            return Array.from({ length: count }, (_, i) => ({
                x: PAD + i * (w + PAD),
                y: PAD,
                w,
                h,
            }));
        }

        default:
            return [];
    }
}

// ─── Draggable + Resizable Window ────────────────────────────────────────────
const VideoWindow = ({
    id, title, children,
    pos, size, // controlled from parent for layout
    onPosChange, onSizeChange,
    onClose, closing,
    fullscreen, onFullscreen,
}) => {
    const [dragging, setDragging] = useState(false);
    const [resizing, setResizing] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    const onTitleMouseDown = (e) => {
        if (fullscreen) return; // locked in fullscreen
        e.preventDefault();
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        setDragging(true);
    };

    const onResizeMouseDown = (e) => {
        if (fullscreen) return;
        e.preventDefault();
        e.stopPropagation();
        resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
        setResizing(true);
    };

    useEffect(() => {
        if (!dragging && !resizing) return;
        const onMouseMove = (e) => {
            if (dragging) {
                onPosChange?.({ x: Math.max(0, e.clientX - dragOffset.current.x), y: Math.max(0, e.clientY - dragOffset.current.y) });
            }
            if (resizing) {
                const dx = e.clientX - resizeStart.current.x;
                const dy = e.clientY - resizeStart.current.y;
                onSizeChange?.({ w: Math.max(220, resizeStart.current.w + dx), h: Math.max(150, resizeStart.current.h + dy) });
            }
        };
        const onMouseUp = () => { setDragging(false); setResizing(false); };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => { window.removeEventListener('mousemove', onMouseMove); window.removeEventListener('mouseup', onMouseUp); };
    }, [dragging, resizing]);

    return (
        <div
            className={`video-window ${closing ? 'video-window--closing' : ''} ${fullscreen ? 'video-window--fullscreen' : ''}`}
            style={fullscreen ? {} : { left: pos.x, top: pos.y, width: size.w, height: size.h }}
        >
            {/* Title / drag bar */}
            <div className="video-window__titlebar" onMouseDown={onTitleMouseDown}>
                <span className="video-window__title">{title}</span>
                <div className="flex items-center gap-1">
                    <button
                        className="video-window__close"
                        onClick={onFullscreen}
                        title={fullscreen ? 'Restaurar' : 'Pantalla completa'}
                    >
                        {fullscreen ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                    </button>
                    {onClose && (
                        <button className="video-window__close" onClick={onClose} title="Cerrar">
                            <X size={11} />
                        </button>
                    )}
                </div>
            </div>

            {/* Video area */}
            <div className="video-window__body">{children}</div>

            {/* Resize handle (hidden in fullscreen) */}
            {!fullscreen && (
                <div className="video-window__resize-handle" onMouseDown={onResizeMouseDown} />
            )}
        </div>
    );
};

// ─── Remote Participant Video ─────────────────────────────────────────────────
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
                    <span className="text-[10px] font-bold text-slate-400 tracking-widest uppercase ml-2">Conectando...</span>
                </div>
            )}
        </VideoWindow>
    );
};

// ─── Main Room Component ──────────────────────────────────────────────────────
const LAYOUTS = [
    { id: 'free', label: 'Libre', icon: null },     // no icon in toolbar (reset)
    { id: 'grid', label: 'Cuadrícula', icon: 'grid' },
    { id: 'spotlight', label: 'Spotlight', icon: 'spotlight' },
    { id: 'strip', label: 'Tira', icon: 'strip' },
];

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
    const [fullscreenId, setFullscreenId] = useState(null); // 'local' | peerID | null
    const [layoutMode, setLayoutMode] = useState('free');    // 'free' | 'grid' | 'spotlight' | 'strip'

    // Per-window pos/size state: Map<id, {x,y}> and Map<id, {w,h}>
    const [windowPos, setWindowPos] = useState({});
    const [windowSize, setWindowSize] = useState({});

    const canvasRef = useRef();
    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]);
    const userStreamRef = useRef(null);

    // ── Auto layout: compute positions when mode changes or peer count changes ──
    const applyLayout = useCallback((mode, allIds) => {
        if (mode === 'free' || !canvasRef.current) return;
        const { offsetWidth: W, offsetHeight: H } = canvasRef.current;
        const positions = computeLayout(mode, allIds.length, W, H);
        const newPos = {};
        const newSize = {};
        allIds.forEach((id, i) => {
            const p = positions[i] || positions[0];
            newPos[id] = { x: p.x, y: p.y };
            newSize[id] = { w: p.w, h: p.h };
        });
        setWindowPos(newPos);
        setWindowSize(newSize);
    }, []);

    const getAllIds = useCallback((peers, localHidden) => {
        const ids = [];
        if (!localHidden) ids.push('local');
        peers.filter(p => !hiddenPeers.has(p.peerID)).forEach(p => ids.push(p.peerID));
        return ids;
    }, [hiddenPeers]);

    // Re-apply layout whenever it changes or peers change
    useEffect(() => {
        if (layoutMode === 'free') return;
        const ids = getAllIds(peers, localHidden);
        applyLayout(layoutMode, ids);
    }, [layoutMode, peers, localHidden, hiddenPeers]);

    // ── Default position/size for new windows ──
    const getDefaultWindow = (id, index) => {
        const offset = index * 30;
        return {
            pos: { x: 40 + offset, y: 40 + offset },
            size: { w: 380, h: 240 },
        };
    };

    const getPosForId = (id, index) => windowPos[id] || getDefaultWindow(id, index).pos;
    const getSizeForId = (id, index) => windowSize[id] || getDefaultWindow(id, index).size;

    const setPosForId = (id) => (pos) => setWindowPos(prev => ({ ...prev, [id]: pos }));
    const setSizeForId = (id) => (size) => setWindowSize(prev => ({ ...prev, [id]: size }));

    // ── Socket + Media ──
    useEffect(() => {
        const envUrl = import.meta.env.VITE_SERVER_URL;
        const serverUrl = envUrl || (window.location.hostname === 'localhost' ? 'http://localhost:5000' : 'https://chatfamily.onrender.com');

        socketRef.current = io.connect(serverUrl, { transports: ['websocket'], upgrade: false });

        const constraints = {
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: true,
        };

        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            userStreamRef.current = stream;
            if (userVideo.current) userVideo.current.srcObject = stream;

            socketRef.current.emit('join room', roomID);

            socketRef.current.on('all users', users => {
                const newPeers = users.map(userID => {
                    const peer = createPeer(userID, socketRef.current.id, stream);
                    peersRef.current.push({ peerID: userID, peer });
                    return { peerID: userID, peer };
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
            if (socketRef.current) socketRef.current.disconnect();
            if (userStreamRef.current) userStreamRef.current.getTracks().forEach(t => t.stop());
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

    const toggleMic = () => { setMicOn(v => { const n = !v; if (userStreamRef.current) userStreamRef.current.getAudioTracks()[0].enabled = n; return n; }); };
    const toggleVideo = () => { setVideoOn(v => { const n = !v; if (userStreamRef.current) userStreamRef.current.getVideoTracks()[0].enabled = n; return n; }); };
    const leaveCall = () => navigate('/');
    const shareUrl = () => { navigator.clipboard.writeText(window.location.href); setCopied(true); setTimeout(() => setCopied(false), 2000); };
    const hidePeer = (id) => setHiddenPeers(prev => new Set([...prev, id]));
    const toggleFullscreen = (id) => setFullscreenId(prev => prev === id ? null : id);

    const handleLayoutChange = (mode) => {
        setLayoutMode(mode);
        setFullscreenId(null);
        if (mode !== 'free') {
            // Small delay to ensure DOM is measured after state updates
            setTimeout(() => {
                const ids = getAllIds(peers, localHidden);
                applyLayout(mode, ids);
            }, 50);
        }
    };

    const visiblePeers = peers.filter(p => !hiddenPeers.has(p.peerID));
    let peerIndexOffset = localHidden ? 0 : 1;

    return (
        <div className="room-stage">
            <div className="room-ambient" />

            {/* ── Top Bar ── */}
            <header className="room-header">
                <div className="flex items-center gap-4 glass-morphism px-5 py-3 rounded-3xl">
                    <div className="w-10 h-10 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <Video size={20} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-lg font-bold tracking-tight text-white mb-0">{roomID}</h2>
                        <span className="text-xs text-indigo-400 font-bold uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                            VIVO · {peers.length + 1} EN LÍNEA
                        </span>
                    </div>
                </div>

                {/* ── Layout Switcher ── */}
                <div className="layout-switcher">
                    <span className="layout-switcher__label">Vista</span>
                    <button
                        onClick={() => handleLayoutChange('grid')}
                        className={`layout-btn ${layoutMode === 'grid' ? 'layout-btn--active' : ''}`}
                        title="Cuadrícula"
                    >
                        <LayoutGrid size={16} />
                        <span>Cuadrícula</span>
                    </button>
                    <button
                        onClick={() => handleLayoutChange('spotlight')}
                        className={`layout-btn ${layoutMode === 'spotlight' ? 'layout-btn--active' : ''}`}
                        title="Spotlight"
                    >
                        <Layout size={16} />
                        <span>Spotlight</span>
                    </button>
                    <button
                        onClick={() => handleLayoutChange('strip')}
                        className={`layout-btn ${layoutMode === 'strip' ? 'layout-btn--active' : ''}`}
                        title="Tira"
                    >
                        <Rows3 size={16} />
                        <span>Tira</span>
                    </button>
                    {layoutMode !== 'free' && (
                        <button
                            onClick={() => setLayoutMode('free')}
                            className="layout-btn layout-btn--reset"
                            title="Modo libre"
                        >
                            <AlignJustify size={14} />
                        </button>
                    )}
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={shareUrl}
                        className={`premium-button ${copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'premium-button-secondary'} py-2 px-5 text-xs font-bold uppercase tracking-widest rounded-2xl`}
                    >
                        <Share2 size={14} />
                        {copied ? 'COPIADO' : 'COMPARTIR'}
                    </button>
                    <button
                        onClick={leaveCall}
                        className="premium-button bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2 px-5 text-xs font-bold uppercase tracking-widest rounded-2xl"
                    >
                        <PhoneOff size={14} />
                        SALIR
                    </button>
                </div>
            </header>

            {/* ── Canvas ── */}
            <div className="room-canvas" ref={canvasRef}>

                {/* Local video */}
                {!localHidden && (
                    <VideoWindow
                        id="local" title="TÚ"
                        pos={getPosForId('local', 0)}
                        size={getSizeForId('local', 0)}
                        onPosChange={mode => { setLayoutMode('free'); setPosForId('local')(mode); }}
                        onSizeChange={mode => { setLayoutMode('free'); setSizeForId('local')(mode); }}
                        onClose={() => setLocalHidden(true)}
                        fullscreen={fullscreenId === 'local'}
                        onFullscreen={() => toggleFullscreen('local')}
                    >
                        <video muted ref={userVideo} autoPlay playsInline className="video-element scale-x-[-1]" />
                        {!videoOn && (
                            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center gap-4 z-10">
                                <div className="w-20 h-20 bg-slate-800 rounded-[2rem] flex items-center justify-center border border-white/5">
                                    <VideoOff size={36} className="text-slate-600" />
                                </div>
                                <span className="text-slate-500 font-bold uppercase tracking-widest text-[9px]">Cámara Desactivada</span>
                            </div>
                        )}
                        {!micOn && (
                            <div className="absolute top-2 right-2 bg-red-500 p-1.5 rounded-lg z-20">
                                <MicOff size={12} className="text-white" />
                            </div>
                        )}
                    </VideoWindow>
                )}

                {/* Remote peers */}
                {visiblePeers.map((peer, i) => (
                    <VideoParticipant
                        key={peer.peerID}
                        peer={peer.peer}
                        peerID={peer.peerID}
                        closing={closingPeers.has(peer.peerID)}
                        onClose={() => hidePeer(peer.peerID)}
                        pos={getPosForId(peer.peerID, peerIndexOffset + i)}
                        size={getSizeForId(peer.peerID, peerIndexOffset + i)}
                        onPosChange={(pos) => { setLayoutMode('free'); setPosForId(peer.peerID)(pos); }}
                        onSizeChange={(size) => { setLayoutMode('free'); setSizeForId(peer.peerID)(size); }}
                        fullscreen={fullscreenId === peer.peerID}
                        onFullscreen={() => toggleFullscreen(peer.peerID)}
                    />
                ))}

                {/* Empty state */}
                {peers.length === 0 && !localHidden && (
                    <div className="room-empty-hint">
                        <p>Comparte el enlace para invitar a alguien</p>
                    </div>
                )}
            </div>

            {/* ── Floating Controls ── */}
            <div className="floating-controls animate-fade-in">
                <ControlButton active={micOn} onClick={toggleMic}
                    icon={micOn ? <Mic size={22} /> : <MicOff size={22} />}
                    label={micOn ? 'SILENCIAR' : 'ACTIVAR'} />
                <ControlButton active={videoOn} onClick={toggleVideo}
                    icon={videoOn ? <Video size={22} /> : <VideoOff size={22} />}
                    label={videoOn ? 'APAGAR' : 'ENCENDER'} />
                {localHidden && (
                    <ControlButton active={true} onClick={() => setLocalHidden(false)}
                        icon={<Video size={22} />} label="MI CAM" />
                )}
                <div className="w-px h-10 bg-slate-800 mx-2 self-center" />
                <button
                    onClick={leaveCall}
                    className="w-14 h-14 bg-red-500 hover:bg-red-400 text-white rounded-[1.25rem] flex items-center justify-center shadow-2xl shadow-red-500/30 active:scale-90 transition-all"
                >
                    <PhoneOff size={22} />
                </button>
            </div>
        </div>
    );
};

// ─── Control Button ───────────────────────────────────────────────────────────
const ControlButton = ({ active, onClick, icon, label }) => (
    <button
        onClick={onClick}
        className={`group relative flex flex-col items-center gap-2 transition-all p-2 rounded-2xl ${active ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-red-500 bg-red-500/5'}`}
    >
        <div className={`w-12 h-12 flex items-center justify-center rounded-[1.1rem] transition-all ${active ? 'bg-slate-900 border border-slate-800 group-hover:border-slate-700' : 'bg-red-500/10 border border-red-500/20'}`}>
            {icon}
        </div>
        <span className="text-[8px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-5">{label}</span>
    </button>
);

export default Room;
