
import React, { useState, useEffect, useMemo } from 'react';
import { DayData, DailyExpense, AIInsight } from './types';
import { syncService } from './services/syncService';
import { getFinancialAdvice } from './services/geminiService';

const generateId = () => Math.random().toString(36).substring(2, 15) + Date.now().toString(36);

const App: React.FC = () => {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // --- ESTADOS ---
  const [syncKey, setSyncKey] = useState<string>(localStorage.getItem('sync_key') || '');
  const [dailyTarget, setDailyTarget] = useState<number>(() => Number(localStorage.getItem('gas_control_target')) || 30);
  const [days, setDays] = useState<DayData[]>(() => {
    const local = localStorage.getItem('gas_control_data');
    return local ? JSON.parse(local) : Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, expenses: [] }));
  });
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // --- SINCRONIZACIÓN ---
  const handleCreateNewId = async () => {
    setIsSyncing(true);
    const newKey = await syncService.createKey();
    if (newKey) {
      setSyncKey(newKey);
      localStorage.setItem('sync_key', newKey);
      await syncService.save(newKey, { days, target: dailyTarget });
      setSaveStatus('saved');
      alert(`¡Nueva Llave!\nID: ${newKey}\n\nUsa este código en otros dispositivos.`);
    }
    setIsSyncing(false);
  };

  const handleConnect = async () => {
    if (syncKey.length < 4) return alert("ID muy corto");
    setIsSyncing(true);
    setSaveStatus('saving');
    
    const cloudData = await syncService.load(syncKey);
    if (cloudData) {
      if (confirm("¿Descargar datos de la nube? Esto borrará tus datos locales.")) {
        setDays(cloudData.days);
        setDailyTarget(cloudData.target);
        localStorage.setItem('sync_key', syncKey);
        setSaveStatus('saved');
      }
    } else {
      if (confirm("ID no encontrado en la nube. ¿Deseas subir tus datos actuales para activar este ID?")) {
        const ok = await syncService.save(syncKey, { days, target: dailyTarget });
        if (ok) {
          localStorage.setItem('sync_key', syncKey);
          setSaveStatus('saved');
        } else {
          setSaveStatus('error');
          alert("Error de conexión con el servidor. El ID podría estar bloqueado o no haber internet.");
        }
      }
    }
    setIsSyncing(false);
  };

  useEffect(() => {
    localStorage.setItem('gas_control_data', JSON.stringify(days));
    localStorage.setItem('gas_control_target', dailyTarget.toString());
    
    if (syncKey.length > 4) {
      const timer = setTimeout(async () => {
        setSaveStatus('saving');
        const ok = await syncService.save(syncKey, { days, target: dailyTarget });
        setSaveStatus(ok ? 'saved' : 'error');
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [days, dailyTarget, syncKey]);

  // --- IA Y CÁLCULOS ---
  const handleAiAnalyze = async () => {
    setIsAiLoading(true);
    const allExpenses = days.flatMap(d => d.expenses);
    const advice = await getFinancialAdvice(allExpenses, dailyTarget * daysInMonth);
    setAiInsight(advice);
    setIsAiLoading(false);
  };

  const stats = useMemo(() => {
    const dailyExcesses = days.map(d => {
      const spent = d.expenses.reduce((sum, e) => sum + e.amount, 0);
      return { day: d.day, excess: Math.max(0, spent - dailyTarget) };
    });
    const totalExcess = dailyExcesses.reduce((sum, d) => sum + d.excess, 0);

    return days.map(d => {
      const spent = d.expenses.reduce((sum, e) => sum + e.amount, 0);
      const myExcess = Math.max(0, spent - dailyTarget);
      const othersExcess = totalExcess - myExcess;
      const penalty = othersExcess / (daysInMonth - 1 || 1);
      const assigned = dailyTarget - penalty;
      return { day: d.day, assigned, spent, remaining: assigned - spent };
    });
  }, [days, dailyTarget, daysInMonth]);

  const addExpense = (dayNum: number) => {
    const desc = prompt("Descripción:");
    const amountStr = prompt("Monto:");
    if (!desc || !amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return;

    setDays(prev => prev.map(d => 
      d.day === dayNum ? { ...d, expenses: [...d.expenses, { id: generateId(), amount, description: desc }] } : d
    ));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-32">
      {/* HEADER DINÁMICO */}
      <nav className="bg-slate-900 text-white px-4 py-4 sticky top-0 z-[200] shadow-xl">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`w-3 h-3 rounded-full ${
              saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 
              saveStatus === 'saved' ? 'bg-emerald-400' : 
              saveStatus === 'error' ? 'bg-rose-500' : 'bg-slate-600'
            }`}></div>
            <h2 className="font-black text-xs uppercase tracking-widest italic">GasControl <span className="text-indigo-400">Pro</span></h2>
          </div>
          <div className="flex items-center gap-2">
            <input 
              value={syncKey} 
              onChange={e => setSyncKey(e.target.value)}
              placeholder="ID Nube"
              className="bg-white/10 border-none text-white px-4 py-2 rounded-xl text-xs font-bold w-24 md:w-40 focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
            />
            <button onClick={handleConnect} disabled={isSyncing} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 shadow-lg">
              {isSyncing ? '...' : 'Conectar'}
            </button>
            <button onClick={handleCreateNewId} className="bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl text-[10px] font-black uppercase">Nuevo</button>
          </div>
        </div>
      </nav>

      <header className="bg-white border-b px-6 py-20">
        <div className="max-w-6xl mx-auto flex flex-col lg:flex-row items-center justify-between gap-12">
          <div className="text-center lg:text-left space-y-4">
            <h1 className="text-7xl font-black text-slate-900 tracking-tighter uppercase leading-[0.8] italic">
              Dashboard<br/><span className="text-indigo-600">Financiero</span>
            </h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.5em]">Optimización de Gasto Diario de Gas</p>
          </div>

          <div className="bg-slate-100 p-2 rounded-[4rem] border-8 border-slate-50 shadow-2xl flex divide-x-2 divide-slate-200">
            <div className="px-10 py-6 text-center">
              <span className="block text-[9px] font-black text-slate-500 uppercase mb-2">Meta Diaria</span>
              <div className="flex items-center justify-center gap-1">
                <span className="text-2xl font-black text-slate-300">$</span>
                <input 
                  type="number" 
                  value={dailyTarget} 
                  onChange={e => setDailyTarget(Number(e.target.value))}
                  className="bg-transparent border-none p-0 w-20 text-5xl font-black text-slate-900 focus:ring-0 text-center"
                />
              </div>
            </div>
            <div className="px-10 py-6 text-center">
              <span className="block text-[9px] font-black text-slate-500 uppercase mb-2">Total Mes</span>
              <p className="text-5xl font-black text-indigo-600 tracking-tighter">
                ${stats.reduce((acc, s) => acc + s.spent, 0).toFixed(1)}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* PANEL DE IA */}
      <section className="max-w-6xl mx-auto px-6 mt-12">
        <div className={`relative overflow-hidden bg-gradient-to-br from-indigo-900 to-slate-900 rounded-[3rem] p-8 md:p-12 shadow-2xl transition-all duration-700 ${aiInsight ? 'min-h-[300px]' : 'min-h-[120px] flex items-center justify-center'}`}>
          {!aiInsight && !isAiLoading && (
            <button onClick={handleAiAnalyze} className="group relative bg-white/10 hover:bg-white/20 border-2 border-white/20 px-8 py-4 rounded-full text-white font-black text-xs uppercase tracking-widest transition-all">
              Consultar Asistente IA
              <div className="absolute -inset-1 bg-gradient-to-r from-indigo-500 to-emerald-500 rounded-full blur opacity-25 group-hover:opacity-100 transition duration-1000 group-hover:duration-200"></div>
            </button>
          )}
          {isAiLoading && (
            <div className="flex flex-col items-center gap-4 text-white">
              <div className="w-8 h-8 border-4 border-white/20 border-t-white rounded-full animate-spin"></div>
              <p className="text-[10px] font-black uppercase tracking-widest animate-pulse">Analizando tus hábitos...</p>
            </div>
          )}
          {aiInsight && (
            <div className="text-white space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
              <div className="flex justify-between items-start">
                <div className="space-y-2">
                  <span className="bg-emerald-500 text-slate-900 px-3 py-1 rounded-full text-[9px] font-black uppercase">Diagnóstico Gemini</span>
                  <h3 className="text-4xl font-black tracking-tighter leading-none">{aiInsight.analysis}</h3>
                </div>
                <button onClick={() => setAiInsight(null)} className="text-white/40 hover:text-white uppercase text-[9px] font-black">Cerrar</button>
              </div>
              <div className="grid md:grid-cols-2 gap-10">
                <div className="bg-white/5 p-6 rounded-[2rem] border border-white/10">
                  <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-3">Pronóstico</p>
                  <p className="text-xl font-bold leading-tight opacity-90">{aiInsight.forecast}</p>
                </div>
                <div className="space-y-4">
                  <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">Recomendaciones PRO</p>
                  {aiInsight.recommendations.map((rec, i) => (
                    <div key={i} className="flex gap-4 items-start bg-white/5 p-4 rounded-2xl border border-white/5">
                      <span className="bg-white/20 w-6 h-6 rounded-lg flex items-center justify-center text-[10px] font-black shrink-0">{i+1}</span>
                      <p className="text-sm font-medium leading-tight opacity-80">{rec}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      <main className="max-w-6xl mx-auto px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {stats.map(s => {
            const dayData = days.find(d => d.day === s.day);
            const isToday = s.day === now.getDate();
            const isOver = s.remaining < 0;

            return (
              <div key={s.day} className={`bg-white rounded-[4rem] border-4 transition-all flex flex-col ${isToday ? 'border-indigo-500 shadow-2xl ring-8 ring-indigo-50' : 'border-slate-100 shadow-sm opacity-90 hover:opacity-100'}`}>
                <div className={`p-8 flex justify-between items-center ${isToday ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-800 border-b border-slate-100'} rounded-t-[3.6rem]`}>
                  <div className="flex items-center gap-4">
                    <span className="text-4xl font-black tracking-tighter">Día {s.day}</span>
                    {isToday && <span className="bg-white/20 text-[9px] px-3 py-1.5 rounded-xl font-black uppercase">Hoy</span>}
                  </div>
                  <button onClick={() => addExpense(s.day)} className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-black shadow-lg active:scale-90 transition-all ${isToday ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}>
                    +
                  </button>
                </div>

                <div className="p-10 space-y-10 flex-grow">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-6 rounded-[2rem] border border-slate-100">
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Asignación</p>
                      <p className={`text-2xl font-black ${s.assigned < 0 ? 'text-rose-500' : 'text-slate-900'}`}>${s.assigned.toFixed(2)}</p>
                    </div>
                    <div className={`${isOver ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'} p-6 rounded-[2rem] border shadow-inner`}>
                      <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-2">Saldo</p>
                      <p className={`text-2xl font-black ${isOver ? 'text-rose-600' : 'text-emerald-600'}`}>${s.remaining.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                    {dayData?.expenses.map(exp => (
                      <div key={exp.id} className="flex justify-between items-center bg-white p-5 rounded-2xl border-2 border-slate-50 hover:border-indigo-100 transition-all shadow-sm">
                        <div className="flex-grow">
                          <p className="text-[9px] font-black text-slate-400 uppercase truncate mb-1">{exp.description}</p>
                          <p className="text-xl font-black text-slate-800">${exp.amount.toFixed(2)}</p>
                        </div>
                        <button onClick={() => confirm("¿Borrar?") && setDays(prev => prev.map(d => d.day === s.day ? {...d, expenses: d.expenses.filter(e => e.id !== exp.id)} : d))} className="text-slate-200 hover:text-rose-500 p-2 transition-colors">
                          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="px-10 py-8 bg-slate-50 border-t border-slate-100 flex justify-between items-center rounded-b-[3.6rem]">
                  <span className="text-[10px] font-black text-slate-400 uppercase">Consumo total</span>
                  <span className="font-black text-slate-900 text-3xl tracking-tighter">${s.spent.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <div className="fixed bottom-10 left-0 right-0 flex justify-center pointer-events-none px-4">
        <button 
          onClick={() => confirm("¿Resetear todo?") && setDays(Array.from({ length: 31 }, (_, i) => ({ day: i + 1, expenses: [] })))}
          className="bg-slate-900 border-4 border-slate-800 text-white/50 px-12 py-5 rounded-full font-black text-[10px] uppercase tracking-[0.5em] shadow-2xl pointer-events-auto hover:text-rose-400 transition-all"
        >
          Borrar Datos Mes
        </button>
      </div>
    </div>
  );
};

export default App;