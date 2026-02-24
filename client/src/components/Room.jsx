import React, { useEffect, useRef, useState, useCallback } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Share2, X } from 'lucide-react';

// ─── Draggable + Resizable Window ────────────────────────────────────────────
const VideoWindow = ({ id, title, children, initialPos, onClose, closing }) => {
    const [pos, setPos] = useState(initialPos || { x: 80 + Math.random() * 200, y: 80 + Math.random() * 100 });
    const [size, setSize] = useState({ w: 380, h: 240 });
    const [dragging, setDragging] = useState(false);
    const [resizing, setResizing] = useState(false);
    const dragOffset = useRef({ x: 0, y: 0 });
    const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 });

    // ── DRAG ──
    const onTitleMouseDown = (e) => {
        e.preventDefault();
        dragOffset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
        setDragging(true);
    };

    // ── RESIZE ──
    const onResizeMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        resizeStart.current = { x: e.clientX, y: e.clientY, w: size.w, h: size.h };
        setResizing(true);
    };

    useEffect(() => {
        if (!dragging && !resizing) return;

        const onMouseMove = (e) => {
            if (dragging) {
                setPos({
                    x: Math.max(0, e.clientX - dragOffset.current.x),
                    y: Math.max(0, e.clientY - dragOffset.current.y),
                });
            }
            if (resizing) {
                const dx = e.clientX - resizeStart.current.x;
                const dy = e.clientY - resizeStart.current.y;
                setSize({
                    w: Math.max(220, resizeStart.current.w + dx),
                    h: Math.max(150, resizeStart.current.h + dy),
                });
            }
        };

        const onMouseUp = () => {
            setDragging(false);
            setResizing(false);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, [dragging, resizing]);

    return (
        <div
            className={`video-window ${closing ? 'video-window--closing' : ''}`}
            style={{
                left: pos.x,
                top: pos.y,
                width: size.w,
                height: size.h,
            }}
        >
            {/* Title / drag bar */}
            <div
                className="video-window__titlebar"
                onMouseDown={onTitleMouseDown}
            >
                <span className="video-window__title">{title}</span>
                {onClose && (
                    <button className="video-window__close" onClick={onClose} title="Cerrar">
                        <X size={13} />
                    </button>
                )}
            </div>

            {/* Video area */}
            <div className="video-window__body">
                {children}
            </div>

            {/* Resize handle */}
            <div
                className="video-window__resize-handle"
                onMouseDown={onResizeMouseDown}
            />
        </div>
    );
};

// ─── Remote Participant Video ─────────────────────────────────────────────────
const VideoParticipant = ({ peer, peerID, onClose, closing, index }) => {
    const ref = useRef();
    const [remoteStream, setRemoteStream] = useState(null);

    useEffect(() => {
        const onStream = (stream) => {
            setRemoteStream(stream);
        };
        peer.on('stream', onStream);

        if (peer._remoteStreams && peer._remoteStreams[0]) {
            setRemoteStream(peer._remoteStreams[0]);
        }

        return () => { peer.off('stream', onStream); };
    }, [peer]);

    useEffect(() => {
        if (remoteStream && ref.current) {
            ref.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    return (
        <VideoWindow
            id={peerID}
            title="FAMILIAR"
            onClose={onClose}
            closing={closing}
            initialPos={{ x: 120 + index * 40, y: 120 + index * 40 }}
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
const Room = () => {
    const { roomID } = useParams();
    const navigate = useNavigate();
    const [peers, setPeers] = useState([]);
    const [userStream, setUserStream] = useState(null);
    const [micOn, setMicOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);
    const [localHidden, setLocalHidden] = useState(false);
    const [closingPeers, setClosingPeers] = useState(new Set());         // IDs animando salida
    const [hiddenPeers, setHiddenPeers] = useState(new Set());           // IDs ocultos manualmente
    const [copied, setCopied] = useState(false);

    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]);
    const userStreamRef = useRef(null);

    // ── Socket + Media Setup ──
    useEffect(() => {
        const envUrl = import.meta.env.VITE_SERVER_URL;
        const serverUrl = envUrl || (window.location.hostname === 'localhost'
            ? 'http://localhost:5000'
            : 'https://chatfamily.onrender.com');

        socketRef.current = io.connect(serverUrl, { transports: ['websocket'], upgrade: false });

        const constraints = {
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
            audio: true,
        };

        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            userStreamRef.current = stream;
            setUserStream(stream);
            if (userVideo.current) userVideo.current.srcObject = stream;

            socketRef.current.emit('join room', roomID);

            socketRef.current.on('all users', users => {
                const newPeers = users.map((userID, i) => {
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

            // ── Auto-close on user leave ──
            socketRef.current.on('user left', id => {
                // Destroy peer connection
                const peerObj = peersRef.current.find(p => p.peerID === id);
                if (peerObj) peerObj.peer.destroy();

                const remaining = peersRef.current.filter(p => p.peerID !== id);
                peersRef.current = remaining;

                // Animate close, then remove from state
                setClosingPeers(prev => new Set([...prev, id]));
                setTimeout(() => {
                    setPeers(remaining.map(p => ({ peerID: p.peerID, peer: p.peer })));
                    setClosingPeers(prev => {
                        const next = new Set(prev);
                        next.delete(id);
                        return next;
                    });
                }, 400); // matches CSS animation duration
            });

        }).catch(err => {
            console.error('No se pudo acceder a la cámara:', err);
            alert('Por favor, permite el acceso a la cámara y micrófono para usar la app.');
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
            if (userStreamRef.current) userStreamRef.current.getTracks().forEach(t => t.stop());
        };
    }, []);

    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream: stream || undefined,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                ]
            },
        });
        peer.on('signal', signal => {
            if (socketRef.current) socketRef.current.emit('sending signal', { userToSignal, callerID, signal });
        });
        peer.on('error', err => console.error('[createPeer] error:', err));
        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream: stream || undefined,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                    { urls: 'stun:global.stun.twilio.com:3478' },
                ]
            },
        });
        peer.on('signal', signal => {
            if (socketRef.current) socketRef.current.emit('returning signal', { signal, callerID });
        });
        peer.on('error', err => console.error('[addPeer] error:', err));
        peer.signal(incomingSignal);
        return peer;
    }

    const toggleMic = () => {
        setMicOn(v => {
            const next = !v;
            if (userStreamRef.current) userStreamRef.current.getAudioTracks()[0].enabled = next;
            return next;
        });
    };

    const toggleVideo = () => {
        setVideoOn(v => {
            const next = !v;
            if (userStreamRef.current) userStreamRef.current.getVideoTracks()[0].enabled = next;
            return next;
        });
    };

    const leaveCall = () => navigate('/');

    const shareUrl = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const hidePeer = (id) => {
        setHiddenPeers(prev => new Set([...prev, id]));
    };

    // Peers that are still "alive" in state (including those animating out)
    const visiblePeers = peers.filter(p => !hiddenPeers.has(p.peerID));

    return (
        <div className="room-stage">
            {/* Ambient Background */}
            <div className="room-ambient" />

            {/* Top Bar */}
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

                <div className="flex items-center gap-4">
                    <button
                        onClick={shareUrl}
                        className={`premium-button ${copied
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : 'premium-button-secondary'
                            } py-2 px-6 text-xs font-bold uppercase tracking-widest rounded-2xl`}
                    >
                        <Share2 size={14} />
                        {copied ? 'COPIADO' : 'COMPARTIR'}
                    </button>
                    <button
                        onClick={leaveCall}
                        className="premium-button bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 py-2 px-6 text-xs font-bold uppercase tracking-widest rounded-2xl"
                    >
                        <PhoneOff size={14} />
                        SALIR
                    </button>
                </div>
            </header>

            {/* Free-floating Video Windows */}
            <div className="room-canvas">
                {/* Local video */}
                {!localHidden && (
                    <VideoWindow
                        id="local"
                        title="TÚ"
                        onClose={() => setLocalHidden(true)}
                        initialPos={{ x: 40, y: 40 }}
                    >
                        <video
                            muted
                            ref={userVideo}
                            autoPlay
                            playsInline
                            className="video-element scale-x-[-1]"
                        />
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
                        index={i}
                    />
                ))}

                {/* Empty state hint */}
                {peers.length === 0 && !localHidden && (
                    <div className="room-empty-hint">
                        <p>Comparte el enlace para invitar a alguien</p>
                    </div>
                )}
            </div>

            {/* Floating Control Bar */}
            <div className="floating-controls animate-fade-in">
                <ControlButton
                    active={micOn}
                    onClick={toggleMic}
                    icon={micOn ? <Mic size={24} /> : <MicOff size={24} />}
                    label={micOn ? 'SILENCIAR' : 'ACTIVAR'}
                />
                <ControlButton
                    active={videoOn}
                    onClick={toggleVideo}
                    icon={videoOn ? <Video size={24} /> : <VideoOff size={24} />}
                    label={videoOn ? 'APAGAR' : 'ENCENDER'}
                />
                {localHidden && (
                    <ControlButton
                        active={true}
                        onClick={() => setLocalHidden(false)}
                        icon={<Video size={24} />}
                        label="MOSTRAR"
                    />
                )}
                <div className="w-px h-10 bg-slate-800 mx-3 self-center" />
                <button
                    onClick={leaveCall}
                    className="w-14 h-14 bg-red-500 hover:bg-red-400 text-white rounded-[1.25rem] flex items-center justify-center shadow-2xl shadow-red-500/30 active:scale-90 transition-all"
                >
                    <PhoneOff size={24} />
                </button>
            </div>
        </div>
    );
};

// ─── Control Button ───────────────────────────────────────────────────────────
const ControlButton = ({ active, onClick, icon, label }) => (
    <button
        onClick={onClick}
        className={`group relative flex flex-col items-center gap-2 transition-all p-2 rounded-2xl ${active ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-red-500 bg-red-500/5'
            }`}
    >
        <div className={`w-12 h-12 flex items-center justify-center rounded-[1.1rem] transition-all ${active ? 'bg-slate-900 border border-slate-800 group-hover:border-slate-700' : 'bg-red-500/10 border border-red-500/20'
            }`}>
            {icon}
        </div>
        <span className="text-[8px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-5">
            {label}
        </span>
    </button>
);

export default Room;
