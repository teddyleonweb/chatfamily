import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Users, ShieldCheck, Heart } from 'lucide-react';

const LandingPage = () => {
    const [roomName, setRoomName] = useState('');
    const navigate = useNavigate();

    const handleJoin = (e) => {
        e.preventDefault();
        if (roomName.trim()) navigate(`/room/${roomName}`);
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
            {/* Background decorations */}
            <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-violet-600/10 blur-[120px] rounded-full pointer-events-none" />

            <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-10 lg:gap-20 items-center z-10">

                {/* ── Left: Hero ── */}
                <div className="animate-fade-in text-center lg:text-left lg:pr-10">
                    {/* Logo */}
                    <div className="flex items-center justify-center lg:justify-start gap-3 mb-8">
                        <div className="w-12 h-12 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20">
                            <Video className="text-white" size={24} />
                        </div>
                        <span className="text-xl sm:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">
                            FamilyCall
                        </span>
                    </div>

                    <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-[1.08] tracking-tight text-white">
                        Donde la familia{' '}
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400">
                            se siente cerca.
                        </span>
                    </h1>

                    <p className="text-slate-400 text-base sm:text-lg md:text-xl mb-8 leading-relaxed max-w-xl mx-auto lg:mx-0">
                        Un espacio seguro y hermoso para conectarte con tus seres queridos con un solo clic. Sin complicaciones, solo amor.
                    </p>

                    {/* Features — hidden on small mobile to save space */}
                    <div className="hidden sm:flex flex-col gap-4">
                        <Feature icon={<Users size={20} />} title="Reuniones Familiares" desc="Soporte optimizado para múltiples cámaras y audio nítido." />
                        <Feature icon={<ShieldCheck size={20} />} title="Privacidad Total" desc="Encriptación punto a punto diseñada para tu tranquilidad." />
                    </div>
                </div>

                {/* ── Right: Form card ── */}
                <div className="relative group">
                    <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-[40px] blur-xl opacity-20 group-hover:opacity-30 transition duration-1000" />
                    <div className="relative glass-morphism landing-card rounded-[32px] sm:rounded-[42px] shadow-2xl">
                        <h3 className="text-2xl sm:text-3xl font-bold text-white mb-3">Entrar a la sala</h3>
                        <p className="text-slate-500 italic text-sm sm:text-base opacity-80 mb-8">
                            Crea una nueva sala o únete a una existente.
                        </p>

                        <form onSubmit={handleJoin} className="flex flex-col gap-5">
                            <div className="flex flex-col gap-2">
                                <label className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400/80 ml-1">
                                    ID de la Sala
                                </label>
                                <input
                                    type="text"
                                    placeholder="ej. DomingoConAbuelos"
                                    className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl px-5 py-4 sm:px-8 sm:py-5 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white text-base sm:text-lg placeholder:text-slate-700 font-medium"
                                    value={roomName}
                                    onChange={(e) => setRoomName(e.target.value)}
                                    autoComplete="off"
                                    autoCorrect="off"
                                    autoCapitalize="none"
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full premium-button premium-button-primary py-4 sm:py-5 text-base sm:text-lg rounded-[18px] mt-1"
                            >
                                <Video size={22} />
                                Iniciar Llamada
                            </button>
                        </form>

                        <div className="mt-8 pt-6 border-t border-slate-800/50">
                            <div className="flex items-center justify-center gap-4 text-slate-500">
                                <Heart size={16} className="text-rose-500 animate-pulse" />
                                <span className="text-xs font-bold uppercase tracking-[0.3em]">Hecho para la familia</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <footer className="absolute bottom-4 sm:bottom-8 left-0 right-0 px-6 sm:px-12 flex justify-between items-center text-slate-600">
                <p className="text-xs font-medium tracking-widest uppercase">© 2026 FamilyCall</p>
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
