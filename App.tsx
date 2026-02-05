
import React, { useState, useEffect, useMemo } from 'react';
import { DayData, DailyExpense } from './types';
import { syncService } from './services/syncService';

// Generador de ID seguro para cualquier entorno
const generateId = () => {
  return Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
};

const App: React.FC = () => {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // --- ESTADOS ---
  const [syncKey, setSyncKey] = useState<string>(localStorage.getItem('sync_key') || '');
  const [dailyTarget, setDailyTarget] = useState<number>(() => {
    return Number(localStorage.getItem('gas_control_target')) || 30;
  });
  const [days, setDays] = useState<DayData[]>(() => {
    const local = localStorage.getItem('gas_control_data');
    return local ? JSON.parse(local) : Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, expenses: [] }));
  });
  
  const [isSyncing, setIsSyncing] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  // --- CARGA INICIAL DESDE LA NUBE ---
  const loadFromCloud = async () => {
    if (!syncKey || syncKey.length < 3) {
      alert("Por favor, introduce un ID de sincronización válido.");
      return;
    }
    setIsSyncing(true);
    try {
      const cloudData = await syncService.load(syncKey);
      if (cloudData && cloudData.days) {
        setDays(cloudData.days);
        setDailyTarget(cloudData.target || 30);
        localStorage.setItem('sync_key', syncKey);
        alert("¡Datos cargados desde la nube con éxito!");
      } else {
        alert("No se encontraron datos para este ID. Se usará este ID para tus futuros guardados.");
      }
    } catch (e) {
      alert("Error al conectar con la nube.");
    } finally {
      setIsSyncing(false);
    }
  };

  // --- GUARDADO AUTOMÁTICO (LOCAL + NUBE) ---
  useEffect(() => {
    // Siempre guardar en LocalStorage inmediatamente
    localStorage.setItem('gas_control_data', JSON.stringify(days));
    localStorage.setItem('gas_control_target', dailyTarget.toString());
    
    // Si hay una llave de sincronización, guardar en la nube con debounce
    if (syncKey && syncKey.length >= 3) {
      setSaveStatus('saving');
      const timeout = setTimeout(async () => {
        const ok = await syncService.save(syncKey, { days, target: dailyTarget });
        setSaveStatus(ok ? 'saved' : 'error');
        if (ok) setTimeout(() => setSaveStatus('idle'), 2000);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [days, dailyTarget, syncKey]);

  // --- LÓGICA DE NEGOCIO (REDISTRIBUCIÓN) ---
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

      return {
        day: d.day,
        assigned,
        spent,
        remaining: assigned - spent
      };
    });
  }, [days, dailyTarget, daysInMonth]);

  // --- ACCIONES ---
  const addExpense = (dayNum: number) => {
    const desc = prompt("¿Descripción del gasto?");
    if (desc === null) return;

    const amountStr = prompt("¿Monto del gasto?");
    if (!amountStr) return;
    
    const amount = parseFloat(amountStr);
    if (isNaN(amount)) {
      alert("Monto inválido");
      return;
    }

    const newExpense: DailyExpense = {
      id: generateId(),
      amount: amount,
      description: desc || "Gasto"
    };

    setDays(prev => prev.map(d => 
      d.day === dayNum ? { ...d, expenses: [...d.expenses, newExpense] } : d
    ));
  };

  const deleteExpense = (dayNum: number, expId: string) => {
    setDays(prev => prev.map(d => 
      d.day === dayNum ? { ...d, expenses: d.expenses.filter(e => e.id !== expId) } : d
    ));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20">
      {/* HEADER DE SINCRONIZACIÓN */}
      <div className="bg-slate-900 text-white px-4 py-3 sticky top-0 z-[100] shadow-xl">
        <div className="max-w-4xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full shadow-[0_0_10px_rgba(0,0,0,0.5)] ${
              saveStatus === 'saving' ? 'bg-amber-400 animate-pulse' : 
              saveStatus === 'saved' ? 'bg-emerald-400' : 
              syncKey ? 'bg-indigo-400' : 'bg-slate-500'
            }`}></div>
            <span className="text-[11px] font-black uppercase tracking-tighter">
              {saveStatus === 'saving' ? 'Guardando...' : 
               saveStatus === 'saved' ? 'Sincronizado' : 
               syncKey ? 'ID Conectado' : 'Solo Local'}
            </span>
          </div>
          
          <div className="flex items-center gap-2 bg-white/10 p-1 rounded-xl">
            <input 
              type="text" 
              placeholder="ID de Sincronización"
              value={syncKey}
              onChange={(e) => {
                setSyncKey(e.target.value);
                localStorage.setItem('sync_key', e.target.value);
              }}
              className="bg-transparent border-none text-white px-3 py-1 text-xs font-bold outline-none w-32 md:w-48 placeholder:text-white/30"
            />
            <button 
              onClick={loadFromCloud}
              disabled={isSyncing}
              className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all active:scale-95"
            >
              {isSyncing ? '...' : 'Conectar'}
            </button>
          </div>
        </div>
      </div>

      <header className="bg-white border-b px-4 py-10 shadow-sm">
        <div className="max-w-4xl mx-auto flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="text-center md:text-left">
            <h1 className="text-4xl font-black text-slate-900 tracking-tight uppercase leading-none">
              GasControl <span className="text-indigo-600 italic">Pro</span>
            </h1>
            <p className="text-[11px] font-black text-slate-400 uppercase tracking-[0.3em] mt-3">Balance Mensual Inteligente</p>
          </div>

          <div className="flex bg-slate-100 rounded-[2.5rem] p-3 border-2 border-slate-200 divide-x-2 divide-slate-200">
            <div className="px-8 py-2 text-center">
              <span className="block text-[9px] font-black text-slate-500 uppercase mb-1">Presupuesto Día</span>
              <div className="flex items-center justify-center">
                <span className="text-xl font-black text-slate-400">$</span>
                <input 
                  type="number" 
                  value={dailyTarget} 
                  onChange={e => setDailyTarget(Number(e.target.value) || 0)}
                  className="bg-transparent border-none p-0 w-16 text-3xl font-black text-slate-900 focus:ring-0 text-center"
                />
              </div>
            </div>
            <div className="px-8 py-2 text-center">
              <span className="block text-[9px] font-black text-slate-500 uppercase mb-1">Gasto Total</span>
              <p className="text-3xl font-black text-indigo-600 tracking-tighter">
                ${stats.reduce((acc, s) => acc + s.spent, 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* GRID DE 2 COLUMNAS (Obligatorio) */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
          {stats.map(s => {
            const dayData = days.find(d => d.day === s.day);
            const isToday = s.day === now.getDate();
            const isCritical = s.remaining < 0;

            return (
              <div 
                key={s.day} 
                className={`bg-white rounded-[3.5rem] border-4 transition-all flex flex-col ${
                  isToday ? 'border-indigo-500 shadow-2xl ring-8 ring-indigo-50' : 'border-slate-200/50'
                }`}
              >
                {/* Cabecera Día */}
                <div className={`p-8 flex justify-between items-center ${
                  isToday ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-800 border-b border-slate-100'
                } rounded-t-[3.1rem]`}>
                  <div className="flex items-center gap-4">
                    <span className="text-4xl font-black tracking-tighter">Día {s.day}</span>
                    {isToday && <span className="bg-white/20 text-[11px] px-4 py-1.5 rounded-full font-black uppercase">Hoy</span>}
                  </div>
                  <button 
                    onClick={() => addExpense(s.day)}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center text-3xl font-black shadow-xl transition-all active:scale-90 ${
                      isToday ? 'bg-white text-indigo-600 hover:bg-slate-50' : 'bg-indigo-600 text-white hover:bg-indigo-700'
                    }`}
                  >
                    +
                  </button>
                </div>

                {/* Info Financiera */}
                <div className="p-10 space-y-10 flex-grow">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-slate-50 p-5 rounded-[2rem] border-2 border-slate-100">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Asignado</p>
                      <p className={`text-2xl font-black ${s.assigned < 0 ? 'text-rose-500' : 'text-slate-800'}`}>
                        ${s.assigned.toFixed(2)}
                      </p>
                    </div>
                    <div className={`${isCritical ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'} p-5 rounded-[2rem] border-2`}>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Disponible</p>
                      <p className={`text-2xl font-black ${isCritical ? 'text-rose-600' : 'text-emerald-600'}`}>
                        ${s.remaining.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Lista de Gastos */}
                  <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar min-h-[80px]">
                    {dayData?.expenses.map(exp => (
                      <div key={exp.id} className="flex justify-between items-center bg-white p-5 rounded-[1.5rem] border-2 border-slate-50 hover:border-indigo-100 transition-all shadow-sm group">
                        <div className="flex-grow overflow-hidden mr-4">
                          <p className="text-[11px] font-black text-slate-400 uppercase truncate mb-1">{exp.description}</p>
                          <p className="text-xl font-black text-slate-800">${exp.amount.toFixed(2)}</p>
                        </div>
                        <button 
                          onClick={() => deleteExpense(s.day, exp.id)}
                          className="text-slate-200 hover:text-rose-500 p-2 transition-colors"
                        >
                          <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    {(!dayData || dayData.expenses.length === 0) && (
                      <div className="py-10 text-center opacity-20 border-2 border-dashed border-slate-200 rounded-[2rem]">
                        <p className="text-xs font-black uppercase tracking-widest">Sin gastos hoy</p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-10 py-6 bg-slate-50 border-t-2 border-slate-100 flex justify-between items-center rounded-b-[3.1rem]">
                  <span className="text-xs font-black text-slate-400 uppercase">Gasto Día</span>
                  <span className="font-black text-slate-900 text-2xl tracking-tighter">${s.spent.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <div className="fixed bottom-10 left-0 right-0 flex justify-center pointer-events-none">
        <button 
          onClick={() => {
            if(confirm("¿Borrar todo el registro del mes? Esta acción no se puede deshacer.")) {
              setDays(Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, expenses: [] })));
              localStorage.removeItem('gas_control_data');
            }
          }}
          className="bg-white border-4 border-slate-200 text-slate-400 px-12 py-5 rounded-full font-black text-xs uppercase tracking-[0.4em] shadow-2xl hover:text-rose-600 hover:border-rose-100 transition-all active:scale-95 pointer-events-auto"
        >
          Resetear Mes
        </button>
      </div>
    </div>
  );
};

export default App;
