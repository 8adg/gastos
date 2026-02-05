
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

  const generateNewCloudId = async () => {
    setIsSyncing(true);
    const newKey = await syncService.createKey();
    if (newKey) {
      setSyncKey(newKey);
      localStorage.setItem('sync_key', newKey);
      setSaveStatus('saving');
      const ok = await syncService.save(newKey, { days, target: dailyTarget });
      setSaveStatus(ok ? 'saved' : 'error');
      alert(`¡ID Generado! Tu nueva llave es: ${newKey}\nGuárdala para acceder desde otros dispositivos.`);
    } else {
      alert("No se pudo conectar con el servidor de llaves. Inténtalo más tarde.");
    }
    setIsSyncing(false);
  };

  const connectToCloud = async () => {
    if (!syncKey || syncKey.length < 5) {
      alert("Introduce un ID válido (mínimo 5 caracteres) o genera uno nuevo.");
      return;
    }
    setIsSyncing(true);
    try {
      const cloudData = await syncService.load(syncKey);
      if (cloudData && cloudData.days) {
        if (confirm("Se han encontrado datos en la nube. ¿Deseas SOBREESCRIBIR tus datos locales con los de la nube?")) {
          setDays(cloudData.days);
          setDailyTarget(cloudData.target || 30);
          localStorage.setItem('sync_key', syncKey);
          alert("¡Datos sincronizados desde la nube!");
        }
      } else {
        if (confirm("Este ID está vacío o es nuevo. ¿Deseas VINCULAR tus datos actuales a este ID para empezar a guardar en la nube?")) {
          const ok = await syncService.save(syncKey, { days, target: dailyTarget });
          if (ok) {
            localStorage.setItem('sync_key', syncKey);
            setSaveStatus('saved');
            alert("¡ID vinculado con éxito! Tus cambios se guardarán automáticamente.");
          } else {
            alert("Error al intentar vincular el ID.");
          }
        }
      }
    } catch (e) {
      alert("Error de conexión. Verifica tu internet.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Guardado automático con debounce
  useEffect(() => {
    localStorage.setItem('gas_control_data', JSON.stringify(days));
    localStorage.setItem('gas_control_target', dailyTarget.toString());
    
    if (syncKey && syncKey.length >= 5) {
      setSaveStatus('saving');
      const timeout = setTimeout(async () => {
        const ok = await syncService.save(syncKey, { days, target: dailyTarget });
        setSaveStatus(ok ? 'saved' : 'error');
        if (ok) setTimeout(() => setSaveStatus('idle'), 3000);
      }, 1500);
      return () => clearTimeout(timeout);
    }
  }, [days, dailyTarget, syncKey]);

  // --- LOGICA FINANCIERA ---
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
    const desc = prompt("¿Qué compraste?");
    if (desc === null) return;
    const amountStr = prompt("¿Cuánto costó?");
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
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-24">
      {/* BARRA DE NUBE REDISEÑADA */}
      <div className="bg-indigo-950 text-white px-4 py-3 sticky top-0 z-[110] shadow-2xl">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-3.5 h-3.5 rounded-full border-2 border-white/20 ${
              saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 
              saveStatus === 'saved' ? 'bg-emerald-400 shadow-[0_0_10px_#34d399]' : 
              saveStatus === 'error' ? 'bg-rose-500' : 'bg-slate-500'
            }`}></div>
            <span className="text-[10px] font-black uppercase tracking-widest opacity-90">
              {saveStatus === 'saving' ? 'Subiendo datos...' : 
               saveStatus === 'saved' ? 'Nube Sincronizada' : 
               saveStatus === 'error' ? 'Error de Red' : 'Modo Offline'}
            </span>
          </div>
          
          <div className="flex flex-wrap items-center gap-2">
            <input 
              type="text" 
              placeholder="Pega tu ID aquí..."
              value={syncKey}
              onChange={(e) => setSyncKey(e.target.value)}
              className="bg-white/10 border-none text-white px-4 py-2 rounded-xl text-xs font-bold outline-none w-40 focus:ring-2 focus:ring-indigo-500 placeholder:text-white/20"
            />
            <button onClick={connectToCloud} disabled={isSyncing} className="bg-indigo-600 hover:bg-indigo-500 px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all active:scale-95 shadow-lg">
              {isSyncing ? 'Conectando...' : 'Conectar'}
            </button>
            <button onClick={generateNewCloudId} className="bg-white/10 hover:bg-white/20 px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all">
              Nuevo ID
            </button>
          </div>
        </div>
      </div>

      <header className="bg-white border-b px-4 py-12 shadow-sm">
        <div className="max-w-5xl mx-auto flex flex-col md:flex-row items-center justify-between gap-10">
          <div className="text-center md:text-left">
            <h1 className="text-5xl font-black text-slate-900 tracking-tight uppercase leading-none">
              GasControl <span className="text-indigo-600">Pro</span>
            </h1>
            <p className="text-xs font-black text-slate-400 uppercase tracking-[0.4em] mt-4 ml-1">Sistema de Balance Autonómico</p>
          </div>

          <div className="flex bg-slate-100 rounded-[3rem] p-3 border-4 border-slate-50 divide-x-2 divide-slate-200">
            <div className="px-10 py-3 text-center">
              <span className="block text-[10px] font-black text-slate-500 uppercase mb-2">Meta Base</span>
              <div className="flex items-center justify-center">
                <span className="text-2xl font-black text-slate-300 mr-1">$</span>
                <input 
                  type="number" 
                  value={dailyTarget} 
                  onChange={e => setDailyTarget(Number(e.target.value) || 0)}
                  className="bg-transparent border-none p-0 w-20 text-4xl font-black text-slate-900 focus:ring-0 text-center"
                />
              </div>
            </div>
            <div className="px-10 py-3 text-center">
              <span className="block text-[10px] font-black text-slate-500 uppercase mb-2">Gasto Mes</span>
              <p className="text-4xl font-black text-indigo-600 tracking-tighter">
                ${stats.reduce((acc, s) => acc + s.spent, 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-16">
        {/* GRID DE 2 COLUMNAS (Ajustado desde 'md') */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          {stats.map(s => {
            const dayData = days.find(d => d.day === s.day);
            const isToday = s.day === now.getDate();
            const isOver = s.remaining < 0;

            return (
              <div key={s.day} className={`bg-white rounded-[4rem] border-4 transition-all flex flex-col group ${isToday ? 'border-indigo-500 shadow-2xl ring-[12px] ring-indigo-50' : 'border-slate-100 hover:border-slate-200 shadow-sm'}`}>
                <div className={`p-10 flex justify-between items-center ${isToday ? 'bg-indigo-600 text-white' : 'bg-slate-50/50 text-slate-800 border-b border-slate-100'} rounded-t-[3.6rem]`}>
                  <div className="flex items-center gap-5">
                    <span className="text-5xl font-black tracking-tighter">Día {s.day}</span>
                    {isToday && <span className="bg-white/20 text-[10px] px-4 py-2 rounded-2xl font-black uppercase">En curso</span>}
                  </div>
                  <button onClick={() => addExpense(s.day)} className={`w-16 h-16 rounded-3xl flex items-center justify-center text-4xl font-black shadow-xl transition-all active:scale-90 ${isToday ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'}`}>
                    +
                  </button>
                </div>

                <div className="p-12 space-y-12 flex-grow">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="bg-slate-50 p-6 rounded-[2.5rem] border-2 border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Saldo Asignado</p>
                      <p className={`text-3xl font-black ${s.assigned < 0 ? 'text-rose-500' : 'text-slate-800'}`}>${s.assigned.toFixed(2)}</p>
                    </div>
                    <div className={`${isOver ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'} p-6 rounded-[2.5rem] border-2`}>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Balance Hoy</p>
                      <p className={`text-3xl font-black ${isOver ? 'text-rose-600' : 'text-emerald-600'}`}>${s.remaining.toFixed(2)}</p>
                    </div>
                  </div>

                  <div className="space-y-4 max-h-[350px] overflow-y-auto pr-3 custom-scrollbar min-h-[100px]">
                    {dayData?.expenses.map(exp => (
                      <div key={exp.id} className="flex justify-between items-center bg-white p-6 rounded-[2rem] border-2 border-slate-50 hover:border-indigo-100 hover:shadow-md transition-all group/item">
                        <div className="flex-grow overflow-hidden mr-4">
                          <p className="text-[10px] font-black text-slate-400 uppercase truncate mb-1">{exp.description}</p>
                          <p className="text-2xl font-black text-slate-800">${exp.amount.toFixed(2)}</p>
                        </div>
                        <button onClick={() => deleteExpense(s.day, exp.id)} className="text-slate-200 hover:text-rose-500 p-2 transition-all opacity-0 group-hover/item:opacity-100">
                          <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    {(!dayData || dayData.expenses.length === 0) && (
                      <div className="py-14 text-center opacity-10 border-4 border-dashed border-slate-200 rounded-[3rem]">
                        <p className="text-xs font-black uppercase tracking-[0.5em]">Sin Actividad</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-12 py-8 bg-slate-50 border-t-2 border-slate-100 flex justify-between items-center rounded-b-[3.6rem]">
                  <span className="text-xs font-black text-slate-400 uppercase">Total Día</span>
                  <span className="font-black text-slate-900 text-3xl tracking-tighter">${s.spent.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <div className="fixed bottom-10 left-0 right-0 flex justify-center pointer-events-none">
        <button 
          onClick={() => {
            if(confirm("¿Borrar todo?")) {
              setDays(Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, expenses: [] })));
              localStorage.removeItem('gas_control_data');
            }
          }}
          className="bg-white border-4 border-slate-200 text-slate-400 px-14 py-5 rounded-full font-black text-xs uppercase tracking-[0.5em] shadow-2xl hover:text-rose-600 hover:border-rose-100 transition-all active:scale-95 pointer-events-auto"
        >
          Resetear Registro
        </button>
      </div>
    </div>
  );
};

export default App;
