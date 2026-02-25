import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, ShieldCheck, Zap, Globe, UserCircle, Lock, Eye, EyeOff } from 'lucide-react';

const LandingPage = () => {
    const [roomName, setRoomName] = useState('');
    const [userName, setUserName] = useState(
        () => localStorage.getItem('nexusmeet_name') || ''
    );
    const [password, setPassword] = useState('');
    const [showPw, setShowPw] = useState(false);
    const navigate = useNavigate();

    const handleJoin = (e) => {
        e.preventDefault();
        const name = userName.trim() || 'Invitado';
        localStorage.setItem('nexusmeet_name', name);
        if (!roomName.trim()) return;
        const target = `/room/${roomName.trim()}${password ? `?pw=${encodeURIComponent(password)}` : ''}`;
        navigate(target);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
            {/* Ambient blobs */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center z-10">

                {/* ── Left: Hero ── */}
                <div className="animate-fade-in text-center lg:text-left lg:pr-10">
                    {/* Logo mark */}
                    <div className="flex items-center justify-center lg:justify-start gap-3 mb-8">
                        <div className="relative w-12 h-12 shrink-0">
                            <img src="/logo.png" alt="Nexus Meet" className="w-12 h-12 object-contain drop-shadow-xl" />
                        </div>
                        <div className="flex flex-col leading-none">
                            <span className="text-xl sm:text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-300 tracking-tight">
                                Nexus Meet
                            </span>
                            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-indigo-400 mt-0.5">
                                Video · Voz · Conexión
                            </span>
                        </div>
                    </div>

                    <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.08] tracking-tight text-white">
                        Conecta con{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400">
                            quien importa.
                        </span>
                    </h1>

                    <p className="text-slate-400 text-base sm:text-lg mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                        Reuniones en alta definición, sin instalaciones, sin complicaciones. Ideal para equipos de trabajo, clases, consultas y momentos con tu familia.
                    </p>

                    <div className="hidden sm:flex flex-col gap-4">
                        <Feature icon={<ShieldCheck size={20} />} title="Privacidad de extremo a extremo" desc="Conexiones WebRTC cifradas directamente entre participantes." />
                        <Feature icon={<Zap size={20} />} title="Sin instalaciones" desc="Funciona en cualquier navegador moderno con un solo enlace." />
                        <Feature icon={<Globe size={20} />} title="Para cualquier ocasión" desc="Reuniones de trabajo, clases, consultas médicas o llamadas familiares." />
                    </div>
                </div>

                {/* ── Right: Form card ── */}
                <div className="relative group">
                    <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-[40px] blur-xl opacity-20 group-hover:opacity-30 transition duration-1000" />
                    <div className="relative glass-morphism landing-card rounded-[32px] sm:rounded-[42px] shadow-2xl">
                        <h3 className="text-2xl sm:text-3xl font-bold text-white mb-2">Unirse a una sala</h3>
                        <p className="text-slate-500 italic text-sm opacity-80 mb-8">
                            Crea una sala nueva o accede a una existente con su ID.
                        </p>

                        <form onSubmit={handleJoin} className="flex flex-col gap-4">
                            {/* Name field */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400/80 ml-1">
                                    Tu nombre
                                </label>
                                <div className="relative">
                                    <UserCircle size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                                    <input
                                        type="text"
                                        placeholder="ej. Ana García"
                                        className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl pl-11 pr-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white text-base placeholder:text-slate-700 font-medium"
                                        value={userName}
                                        onChange={e => setUserName(e.target.value)}
                                        maxLength={32}
                                        autoComplete="nickname"
                                        autoCorrect="off"
                                        autoCapitalize="words"
                                    />
                                </div>
                            </div>

                            {/* Room ID field */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400/80 ml-1">
                                    ID de sala
                                </label>
                                <input
                                    type="text"
                                    placeholder="ej. equipo-producto-2026"
                                    className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl px-5 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white text-base placeholder:text-slate-700 font-medium"
                                    value={roomName}
                                    onChange={e => setRoomName(e.target.value)}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                />
                            </div>

                            {/* Password field (optional) */}
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400/80 ml-1 flex items-center gap-1.5">
                                    <Lock size={11} />
                                    Contraseña de sala
                                    <span className="text-slate-600 normal-case font-normal tracking-normal ml-1">(opcional)</span>
                                </label>
                                <div className="relative">
                                    <Lock size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-600 pointer-events-none" />
                                    <input
                                        type={showPw ? 'text' : 'password'}
                                        placeholder="Dejar vacío = sala pública"
                                        className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl pl-11 pr-12 py-4 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white text-base placeholder:text-slate-700 font-medium"
                                        value={password}
                                        onChange={e => setPassword(e.target.value)}
                                        autoComplete="new-password"
                                        autoCorrect="off"
                                        autoCapitalize="none"
                                    />
                                    <button
                                        type="button"
                                        className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
                                        onClick={() => setShowPw(v => !v)}
                                        tabIndex={-1}
                                    >
                                        {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                                    </button>
                                </div>
                            </div>

                            <button
                                type="submit"
                                className="w-full premium-button premium-button-primary py-4 sm:py-5 text-base sm:text-lg rounded-[18px] mt-1"
                            >
                                <Video size={22} />
                                Iniciar reunión
                            </button>
                        </form>

                        <div className="mt-8 pt-6 border-t border-slate-800/50">
                            <div className="flex items-center justify-center gap-3 text-slate-500">
                                <img src="/logo.png" alt="" className="w-5 h-5 opacity-60 object-contain" />
                                <span className="text-xs font-bold uppercase tracking-[0.3em]">Nexus Meet · Siempre privado</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <footer className="absolute bottom-4 sm:bottom-8 left-0 right-0 px-6 sm:px-12 flex justify-between items-center text-slate-600">
                <p className="text-xs font-medium tracking-widest uppercase">© 2026 Nexus Meet</p>
                <div className="flex gap-5 text-xs font-semibold uppercase tracking-widest">
                    <a href="#" className="hover:text-indigo-400 transition-colors">Seguridad</a>
                    <a href="#" className="hover:text-indigo-400 transition-colors">Ayuda</a>
                </div>
            </footer>
        </div>
    );
};

const Feature = ({ icon, title, desc }) => (
    <div className="flex items-start gap-3 p-3 rounded-2xl hover:bg-slate-800/30 transition-colors group">
        <div className="p-2.5 bg-slate-800 rounded-xl text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all shrink-0">
            {icon}
        </div>
        <div>
            <h4 className="font-bold text-white text-sm mb-0.5">{title}</h4>
            <p className="text-sm text-slate-500">{desc}</p>
        </div>
    </div>
);

export default LandingPage;
