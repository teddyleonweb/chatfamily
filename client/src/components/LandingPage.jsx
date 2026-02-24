import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Video, Users, ShieldCheck, Heart } from 'lucide-react';

const LandingPage = () => {
    const [roomName, setRoomName] = useState('');
    const navigate = useNavigate();

    const handleJoin = (e) => {
        e.preventDefault();
        if (roomName.trim()) {
            navigate(`/room/${roomName}`);
        }
    };

    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-6 relative overflow-hidden">
            {/* Background Decorations */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-indigo-600/10 blur-[120px] rounded-full" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-violet-600/10 blur-[120px] rounded-full" />

            <div className="max-w-6xl w-full grid grid-cols-1 lg:grid-cols-2 gap-20 items-center z-10 px-4">

                <div className="animate-fade-in lg:pr-10">
                    <div className="flex items-center gap-4 mb-10">
                        <div className="w-14 h-14 bg-gradient-to-tr from-indigo-500 to-violet-500 rounded-2xl flex items-center justify-center shadow-xl shadow-indigo-500/20">
                            <Video className="text-white" size={28} />
                        </div>
                        <span className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-slate-400">FamilyCall</span>
                    </div>

                    <h1 className="text-6xl md:text-8xl font-bold mb-10 leading-[1.05] tracking-tight text-white">
                        Donde la familia <br />
                        <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 via-violet-400 to-fuchsia-400">se siente cerca.</span>
                    </h1>

                    <p className="text-slate-400 text-xl md:text-2xl mb-12 leading-relaxed max-w-xl">
                        Un espacio seguro y hermoso para conectarte con tus seres queridos con un solo clic. Sin complicaciones, solo amor.
                    </p>

                    <div className="flex flex-col gap-8">
                        <Feature icon={<Users size={24} />} title="Reuniones Familiares" desc="Soporte optimizado para múltiples cámaras y audio nítido." />
                        <Feature icon={<ShieldCheck size={24} />} title="Privacidad Total" desc="Encriptación punto a punto diseñada para tu tranquilidad." />
                    </div>
                </div>

                <div className="relative group lg:ml-10">
                    <div className="absolute -inset-2 bg-gradient-to-r from-indigo-500 to-violet-600 rounded-[48px] blur-xl opacity-20 group-hover:opacity-30 transition duration-1000"></div>
                    <div className="relative glass-morphism glass-morphism-card rounded-[42px] shadow-2xl">
                        <h3 className="text-4xl font-bold text-white" style={{ marginBottom: '1.5rem' }}>Entrar a la sala</h3>
                        <p className="text-slate-500 italic text-lg opacity-80" style={{ marginBottom: '2.5rem' }}>Crea una nueva sala o únete a una existente.</p>

                        <form onSubmit={handleJoin} className="form-stack">
                            <div className="form-group" style={{ marginBottom: '2rem' }}>
                                <label className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400/80 ml-1" style={{ marginBottom: '0.75rem', display: 'block' }}>ID de la Sala</label>
                                <input
                                    type="text"
                                    placeholder="ej. DomingoConAbuelos"
                                    className="w-full bg-slate-900/60 border border-slate-800 rounded-2xl px-8 py-6 focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all text-white text-xl placeholder:text-slate-700 font-medium"
                                    value={roomName}
                                    onChange={(e) => setRoomName(e.target.value)}
                                />
                            </div>
                            <button
                                type="submit"
                                className="w-full premium-button premium-button-primary py-6 text-xl rounded-[20px]"
                                style={{ marginTop: '1rem' }}
                            >
                                <Video size={28} />
                                Iniciar Llamada
                            </button>
                        </form>

                        <div className="mt-14 pt-10 border-t border-slate-800/50">
                            <div className="flex items-center justify-center gap-5 text-slate-500">
                                <Heart size={20} className="text-rose-500 animate-pulse" />
                                <span className="text-xs font-bold uppercase tracking-[0.3em]">Hecho para la familia</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <footer className="absolute bottom-8 left-0 right-0 px-12 flex justify-between items-center text-slate-600">
                <p className="text-xs font-medium tracking-widest uppercase">© 2026 FamilyCall Global</p>
                <div className="flex gap-8 text-xs font-semibold uppercase tracking-widest">
                    <a href="#" className="hover:text-indigo-400 transition-colors">Seguridad</a>
                    <a href="#" className="hover:text-indigo-400 transition-colors">Ayuda</a>
                </div>
            </footer>
        </div>
    );
};

const Feature = ({ icon, title, desc }) => (
    <div className="flex items-start gap-4 p-4 rounded-2xl hover:bg-slate-800/30 transition-colors group">
        <div className="p-3 bg-slate-800 rounded-xl text-indigo-400 group-hover:bg-indigo-500 group-hover:text-white transition-all">
            {icon}
        </div>
        <div>
            <h4 className="font-bold text-white mb-0.5">{title}</h4>
            <p className="text-sm text-slate-500">{desc}</p>
        </div>
    </div>
);

export default LandingPage;
