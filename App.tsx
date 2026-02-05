
import React, { useState, useEffect, useMemo } from 'react';
import { DayData, DailyExpense } from './types';
import { syncService } from './services/syncService';

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
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // --- LOGICA DE SINCRONIZACIÓN ---

  const handleCreateNewId = async () => {
    setIsSyncing(true);
    setSaveStatus('saving');
    const newKey = await syncService.createKey();
    if (newKey) {
      setSyncKey(newKey);
      localStorage.setItem('sync_key', newKey);
      const ok = await syncService.save(newKey, { days, target: dailyTarget });
      if (ok) {
        setSaveStatus('saved');
        alert(`¡Llave Creada!\nID: ${newKey}\n\nTus datos actuales ya están protegidos en la nube.`);
      } else {
        setSaveStatus('error');
        alert(`ID generado: ${newKey}, pero no se pudieron subir los datos inicialmente. Se reintentará en segundo plano.`);
      }
    } else {
      setSaveStatus('error');
      alert("No se pudo contactar con el servidor. Revisa tu conexión a internet.");
    }
    setIsSyncing(false);
  };

  const handleConnect = async () => {
    if (!syncKey || syncKey.trim().length < 5) {
      alert("Ingresa un ID de al menos 5 caracteres.");
      return;
    }
    setIsSyncing(true);
    setSaveStatus('saving');
    try {
      const cloudData = await syncService.load(syncKey);
      if (cloudData && cloudData.days) {
        if (confirm("Se encontraron datos. ¿Deseas descargar la información de la nube y REEMPLAZAR lo que tienes ahora?")) {
          setDays(cloudData.days);
          setDailyTarget(cloudData.target || 30);
          localStorage.setItem('sync_key', syncKey);
          setSaveStatus('saved');
          alert("¡Sincronización completada!");
        }
      } else {
        if (confirm("Este ID no tiene datos. ¿Quieres VINCULAR tus datos actuales a este ID para empezar a guardar?")) {
          const ok = await syncService.save(syncKey, { days, target: dailyTarget });
          if (ok) {
            localStorage.setItem('sync_key', syncKey);
            setSaveStatus('saved');
            alert("¡Vinculado correctamente!");
          } else {
            setSaveStatus('error');
            alert("No se pudo establecer el vínculo. El servidor no responde.");
          }
        }
      }
    } catch (e) {
      setSaveStatus('error');
      alert("Error de conexión. Inténtalo de nuevo.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Guardado automático persistente con Debounce
  useEffect(() => {
    localStorage.setItem('gas_control_data', JSON.stringify(days));
    localStorage.setItem('gas_control_target', dailyTarget.toString());
    
    if (syncKey && syncKey.length >= 5) {
      const timeout = setTimeout(async () => {
        setSaveStatus('saving');
        const ok = await syncService.save(syncKey, { days, target: dailyTarget });
        setSaveStatus(ok ? 'saved' : 'error');
        if (ok) setTimeout(() => setSaveStatus('idle'), 3000);
      }, 2500);
      return () => clearTimeout(timeout);
    }
  }, [days, dailyTarget, syncKey]);

  // --- LOGICA DE CÁLCULO ---
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
    const desc = prompt("¿En qué gastaste?");
    if (desc === null) return;
    const amountStr = prompt("Monto ($):");
    if (!amountStr) return;
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) return;

    setDays(prev => prev.map(d => 
      d.day === dayNum ? { ...d, expenses: [...d.expenses, { id: generateId(), amount, description: desc || "Gasto" }] } : d
    ));
  };

  const deleteExpense = (dayNum: number, expId: string) => {
    setDays(prev => prev.map(d => 
      d.day === dayNum ? { ...d, expenses: d.expenses.filter(e => e.id !== expId) } : d
    ));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-32">
      {/* BARRA DE NUBE */}
      <nav className="bg-slate-900 text-white px-4 py-3 sticky top-0 z-[100] shadow-2xl">
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full transition-all duration-500 ${
              saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 
              saveStatus === 'saved' ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 
              saveStatus === 'error' ? 'bg-rose-500' : 'bg-slate-600'
            }`}></div>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-70">
              {saveStatus === 'saving' ? 'Subiendo...' : 
               saveStatus === 'saved' ? 'Nube OK' : 
               saveStatus === 'error' ? 'Sin Conexión' : 'Local'}
            </span>
          </div>
          
          <div className="flex items-center gap-2">
            <input 
              type="text" 
              placeholder="ID Nube"
              value={syncKey}
              onChange={(e) => setSyncKey(e.target.value)}
              className="bg-white/10 border-none text-white px-3 py-2 rounded-xl text-xs font-bold outline-none w-28 md:w-44 focus:ring-2 focus:ring-indigo-500 transition-all"
            />
            <button 
              onClick={handleConnect} 
              disabled={isSyncing}
              className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 shadow-lg disabled:opacity-50"
            >
              {isSyncing ? '...' : 'Conectar'}
            </button>
            <button 
              onClick={handleCreateNewId} 
              className="bg-white/5 hover:bg-white/10 px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all"
            >
              Nuevo
            </button>
          </div>
        </div>
      </nav>

      <header className="bg-white border-b px-4 py-16 shadow-sm">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-12">
          <div className="text-center md:text-left">
            <h1 className="text-7xl font-black text-slate-900 tracking-tighter uppercase leading-none italic">
              Gas<span className="text-indigo-600">Control</span>
            </h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.6em] mt-5">Sistema de Compensación de Gastos</p>
          </div>

          <div className="flex flex-col sm:flex-row bg-slate-100 rounded-[3.5rem] p-3 border-4 border-slate-50 divide-y-2 sm:divide-y-0 sm:divide-x-2 divide-slate-200 shadow-inner">
            <div className="px-12 py-4 text-center">
              <span className="block text-[10px] font-black text-slate-500 uppercase mb-2">Presupuesto Día</span>
              <div className="flex items-center justify-center">
                <span className="text-2xl font-black text-slate-300 mr-1">$</span>
                <input 
                  type="number" 
                  value={dailyTarget} 
                  onChange={e => setDailyTarget(Number(e.target.value) || 0)}
                  className="bg-transparent border-none p-0 w-24 text-5xl font-black text-slate-900 focus:ring-0 text-center"
                />
              </div>
            </div>
            <div className="px-12 py-4 text-center">
              <span className="block text-[10px] font-black text-slate-500 uppercase mb-2">Total Consumido</span>
              <p className="text-5xl font-black text-indigo-600 tracking-tighter">
                ${stats.reduce((acc, s) => acc + s.spent, 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-20">
        {/* GRID DE 2 COLUMNAS FORZADO EN MD+ */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
          {stats.map(s => {
            const dayData = days.find(d => d.day === s.day);
            const isToday = s.day === now.getDate();
            const isOver = s.remaining < 0;

            return (
              <div key={s.day} className={`bg-white rounded-[4.5rem] border-4 transition-all flex flex-col ${isToday ? 'border-indigo-500 shadow-2xl ring-[15px] ring-indigo-50' : 'border-slate-100 shadow-sm'}`}>
                <div className={`p-10 flex justify-between items-center ${isToday ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-800 border-b border-slate-100'} rounded-t-[4.1rem]`}>
                  <div className="flex items-center gap-5">
                    <span className="text-5xl font-black tracking-tighter">Día {s.day}</span>
                    {isToday && <span className="bg-white/20 text-[10px] px-4 py-2 rounded-2xl font-black uppercase">Hoy</span>}
                  </div>
                  <button onClick={() => addExpense(s.day)} className={`w-16 h-16 rounded-3xl flex items-center justify-center text-4xl font-black shadow-xl transition-all active:scale-90 ${isToday ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}>
                    +
                  </button>
                </div>

                <div className="p-12 space-y-12 flex-grow">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="bg-slate-50 p-7 rounded-[2.5rem] border-2 border-slate-100 shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Saldo Neto</p>
                      <p className={`text-3xl font-black ${s.assigned < 0 ? 'text-rose-500' : 'text-slate-900'}`}>${s.assigned.toFixed(2)}</p>
                    </div>
                    <div className={`${isOver ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'} p-7 rounded-[2.5rem] border-2 shadow-sm`}>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Restante</p>
                      <p className={`text-3xl font-black ${isOver ? 'text-rose-600' : 'text-emerald-600'}`}>${s.remaining.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-[450px] overflow-y-auto pr-3 min-h-[150px]">
                    {dayData?.expenses.map(exp => (
                      <div key={exp.id} className="flex justify-between items-center bg-white p-6 rounded-[2.2rem] border-2 border-slate-100 hover:border-indigo-200 transition-all shadow-sm group">
                        <div className="flex-grow overflow-hidden mr-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase truncate mb-1">{exp.description}</p>
                          <p className="text-2xl font-black text-slate-800">${exp.amount.toFixed(2)}</p>
                        </div>
                        <button onClick={() => deleteExpense(s.day, exp.id)} className="text-slate-200 hover:text-rose-500 p-2 transition-colors">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="4"><path d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    {(!dayData || dayData.expenses.length === 0) && (
                      <div className="py-20 text-center opacity-5 border-4 border-dashed border-slate-300 rounded-[3.5rem]">
                        <p className="text-[11px] font-black uppercase tracking-[0.8em]">Sin Registros</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-12 py-10 bg-slate-50/50 border-t-2 border-slate-100 flex justify-between items-center rounded-b-[4.1rem]">
                  <span className="text-[11px] font-black text-slate-400 uppercase tracking-wider">Total Consumo</span>
                  <span className="font-black text-slate-900 text-4xl tracking-tighter">${s.spent.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <div className="fixed bottom-10 left-0 right-0 flex justify-center pointer-events-none px-4">
        <button 
          onClick={() => confirm("¿Deseas resetear todos los gastos de este mes?") && setDays(Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, expenses: [] })))}
          className="bg-slate-900/90 backdrop-blur-xl border-4 border-slate-800 text-white/50 px-16 py-6 rounded-full font-black text-[11px] uppercase tracking-[0.5em] shadow-[0_20px_50px_rgba(0,0,0,0.3)] pointer-events-auto hover:text-rose-400 hover:border-rose-900/30 transition-all active:scale-95"
        >
          Borrar Registro Mensual
        </button>
      </div>
    </div>
  );
};

export default App;
