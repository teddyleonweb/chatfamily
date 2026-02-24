import React, { useEffect, useRef, useState } from 'react';
import io from 'socket.io-client';
import Peer from 'simple-peer';
import { useParams, useNavigate } from 'react-router-dom';
import { Mic, MicOff, Video, VideoOff, PhoneOff, Share2, Users } from 'lucide-react';

const Room = () => {
    const { roomID } = useParams();
    const navigate = useNavigate();
    const [peers, setPeers] = useState([]);
    const [userStream, setUserStream] = useState(null);
    const [micOn, setMicOn] = useState(true);
    const [videoOn, setVideoOn] = useState(true);

    const socketRef = useRef();
    const userVideo = useRef();
    const peersRef = useRef([]);

    const [connected, setConnected] = useState(false);
    const [copied, setCopied] = useState(false);

    useEffect(() => {
        const serverUrl = import.meta.env.VITE_SERVER_URL || 'http://localhost:5000';
        socketRef.current = io.connect(serverUrl);

        socketRef.current.on("connect", () => {
            setConnected(true);
            console.log("Conectado al servidor de señalización");
        });

        socketRef.current.on("connect_error", (err) => {
            console.error("Error de conexión:", err);
        });

        const constraints = {
            video: {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            },
            audio: true
        };

        navigator.mediaDevices.getUserMedia(constraints).then(stream => {
            setUserStream(stream);
            if (userVideo.current) {
                userVideo.current.srcObject = stream;
            }

            socketRef.current.emit("join room", roomID);

            socketRef.current.on("all users", users => {
                const peers = [];
                users.forEach(userID => {
                    const peer = createPeer(userID, socketRef.current.id, stream);
                    peersRef.current.push({
                        peerID: userID,
                        peer,
                    });
                    peers.push({
                        peerID: userID,
                        peer,
                    });
                });
                setPeers(peers);
            });

            socketRef.current.on("user joined", payload => {
                const peer = addPeer(payload.signal, payload.callerID, stream);
                peersRef.current.push({
                    peerID: payload.callerID,
                    peer,
                });

                const newPeer = {
                    peerID: payload.callerID,
                    peer,
                };

                setPeers(prev => [...prev, newPeer]);
            });

            socketRef.current.on("receiving returned signal", payload => {
                const item = peersRef.current.find(p => p.peerID === payload.id);
                if (item) item.peer.signal(payload.signal);
            });

            socketRef.current.on("user left", id => {
                const peerObj = peersRef.current.find(p => p.peerID === id);
                if (peerObj) {
                    peerObj.peer.destroy();
                }
                const newPeers = peersRef.current.filter(p => p.peerID !== id);
                peersRef.current = newPeers;
                setPeers(newPeers.map(p => ({ peerID: p.peerID, peer: p.peer })));
            });
        }).catch(err => {
            console.error("No se pudo acceder a la cámara:", err);
            alert("Por favor, permite el acceso a la cámara y micrófono para usar la app.");
        });

        return () => {
            if (socketRef.current) socketRef.current.disconnect();
            if (userStream) userStream.getTracks().forEach(track => track.stop());
        };
    }, []);

    function createPeer(userToSignal, callerID, stream) {
        const peer = new Peer({
            initiator: true,
            trickle: false,
            stream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ]
            }
        });

        peer.on("signal", signal => {
            if (socketRef.current) {
                socketRef.current.emit("sending signal", { userToSignal, callerID, signal });
            }
        });
        return peer;
    }

    function addPeer(incomingSignal, callerID, stream) {
        const peer = new Peer({
            initiator: false,
            trickle: false,
            stream,
            config: {
                iceServers: [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'stun:stun1.l.google.com:19302' },
                ]
            }
        });

        peer.on("signal", signal => {
            if (socketRef.current) {
                socketRef.current.emit("returning signal", { signal, callerID });
            }
        });
        peer.signal(incomingSignal);
        return peer;
    }

    const toggleMic = () => {
        setMicOn(!micOn);
        if (userStream) userStream.getAudioTracks()[0].enabled = !micOn;
    };

    const toggleVideo = () => {
        setVideoOn(!videoOn);
        if (userStream) userStream.getVideoTracks()[0].enabled = !videoOn;
    };

    const leaveCall = () => navigate('/');


    const shareUrl = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="h-screen flex flex-col bg-[#020617] overflow-hidden relative">
            {/* Ambient Background */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
                <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-indigo-500/30 blur-[150px] rounded-full" />
                <div className="absolute bottom-[-20%] right-[-10%] w-[60%] h-[60%] bg-violet-600/30 blur-[150px] rounded-full" />
            </div>

            {/* Top Bar */}
            <header className="px-12 py-8 flex items-center justify-between z-10 shrink-0">
                <div className="flex items-center gap-6 glass-morphism px-6 py-4 rounded-3xl">
                    <div className="w-12 h-12 bg-indigo-500 rounded-2xl flex items-center justify-center shadow-lg">
                        <Video size={24} className="text-white" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold tracking-tight text-white mb-0.5">{roomID}</h2>
                        <span className="text-xs text-indigo-400 font-bold uppercase tracking-widest flex items-center gap-2">
                            <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse" />
                            VIVO • {peers.length + 1} EN LINEA
                        </span>
                    </div>
                </div>

                <div className="flex items-center gap-5">
                    <button
                        onClick={shareUrl}
                        className={`premium-button ${copied ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : 'premium-button-secondary'} py-3 px-8 text-xs font-bold uppercase tracking-widest rounded-2xl min-w-[140px]`}
                    >
                        {copied ? (
                            <>
                                <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping" />
                                COPIADO
                            </>
                        ) : (
                            <>
                                <Share2 size={16} />
                                COMPARTIR
                            </>
                        )}
                    </button>
                    <button
                        onClick={leaveCall}
                        className="premium-button bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 py-3 px-8 text-xs font-bold uppercase tracking-widest rounded-2xl"
                    >
                        <PhoneOff size={16} />
                        SALIR
                    </button>
                </div>
            </header>

            {/* Main Video Arena */}
            <main className="flex-1 px-12 pb-32 flex items-center justify-center z-10 overflow-hidden">
                <div className={`grid gap-10 w-full max-w-7xl mx-auto items-center justify-center ${peers.length === 0 ? 'grid-cols-1' :
                    peers.length === 1 ? 'grid-cols-2' :
                        peers.length === 2 ? 'grid-cols-3' :
                            'grid-cols-2 grid-rows-2'
                    }`}>
                    {/* Local Video Card */}
                    <div className="video-container group shadow-2xl">
                        <video
                            muted
                            ref={userVideo}
                            autoPlay
                            playsInline
                            className="video-element scale-x-[-1]"
                        />
                        <div className="absolute top-6 left-6 z-20">
                            <span className="bg-black/40 backdrop-blur-xl px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 border border-white/10">
                                TÚ
                            </span>
                        </div>
                        {!micOn && (
                            <div className="absolute top-6 right-6 bg-red-500 p-2.5 rounded-xl shadow-xl z-20">
                                <MicOff size={16} className="text-white" />
                            </div>
                        )}
                        {!videoOn && (
                            <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center gap-8 z-10">
                                <div className="w-28 h-28 bg-slate-800 rounded-[2.5rem] flex items-center justify-center border border-white/5 shadow-2xl">
                                    <VideoOff size={48} className="text-slate-600" />
                                </div>
                                <span className="text-slate-500 font-bold uppercase tracking-[0.3em] text-[10px]">Cámara Desactivada</span>
                            </div>
                        )}
                    </div>

                    {/* Remote Participant Cards */}
                    {peers.map((peer) => (
                        <VideoParticipant key={peer.peerID} peer={peer.peer} />
                    ))}
                </div>
            </main>

            {/* Professional Floating Control Bar */}
            <div className="floating-controls mb-12 animate-fade-in">
                <ControlButton
                    active={micOn}
                    onClick={toggleMic}
                    icon={micOn ? <Mic size={26} /> : <MicOff size={26} />}
                    label={micOn ? "SILENCIAR" : "ACTIVAR"}
                />

                <ControlButton
                    active={videoOn}
                    onClick={toggleVideo}
                    icon={videoOn ? <Video size={26} /> : <VideoOff size={26} />}
                    label={videoOn ? "APAGAR" : "ENCENDER"}
                />

                <div className="w-[1px] h-12 bg-slate-800 mx-4 self-center" />

                <button
                    onClick={leaveCall}
                    className="w-16 h-16 bg-red-500 hover:bg-red-400 text-white rounded-[1.5rem] flex items-center justify-center shadow-2xl shadow-red-500/30 active:scale-90 transition-all"
                >
                    <PhoneOff size={28} />
                </button>
            </div>
        </div>
    );
};

const ControlButton = ({ active, onClick, icon, label }) => (
    <button
        onClick={onClick}
        className={`group relative flex flex-col items-center gap-2 transition-all p-2 rounded-2xl ${active ? 'text-slate-400 hover:text-white hover:bg-white/5' : 'text-red-500 bg-red-500/5'
            }`}
    >
        <div className={`w-14 h-14 flex items-center justify-center rounded-[1.25rem] transition-all ${active ? 'bg-slate-900 border border-slate-800 group-hover:border-slate-700' : 'bg-red-500/10 border border-red-500/20'
            }`}>
            {icon}
        </div>
        <span className="text-[9px] font-bold uppercase tracking-wider opacity-0 group-hover:opacity-100 transition-opacity absolute -bottom-6">
            {label}
        </span>
    </button>
);

// Update VideoParticipant as well to use the same logic
const VideoParticipant = ({ peer }) => {
    const ref = useRef();
    const [remoteStream, setRemoteStream] = useState(null);

    useEffect(() => {
        const onStream = (stream) => {
            console.log("Stream remoto recibido");
            setRemoteStream(stream);
        };

        peer.on("stream", onStream);

        // Manejar el caso donde el stream ya llegó antes de montar el componente
        if (peer._remoteStreams && peer._remoteStreams[0]) {
            setRemoteStream(peer._remoteStreams[0]);
        }

        return () => {
            peer.off("stream", onStream);
        };
    }, [peer]);

    useEffect(() => {
        if (remoteStream && ref.current) {
            ref.current.srcObject = remoteStream;
        }
    }, [remoteStream]);

    return (
        <div className="video-container group shadow-2xl">
            <video playsInline autoPlay ref={ref} className="video-element" />
            <div className="absolute top-6 left-6 z-20">
                <span className="bg-black/40 backdrop-blur-xl px-4 py-2 rounded-xl text-[10px] font-bold uppercase tracking-[0.2em] text-white/90 border border-white/10">
                    FAMILIAR
                </span>
            </div>
            {!remoteStream && (
                <div className="absolute inset-0 bg-slate-900 flex items-center justify-center gap-3">
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.15s]" />
                    <div className="w-2 h-2 bg-indigo-500 rounded-full animate-bounce [animation-delay:-0.3s]" />
                    <span className="text-[10px] font-bold text-slate-500 tracking-widest uppercase ml-2">Conectando...</span>
                </div>
            )}
        </div>
    );
};

export default Room;
