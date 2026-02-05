
import React, { useState, useEffect, useMemo } from 'react';
import { DayData, DailyExpense } from './types';
import { syncService } from './services/syncService';

const App: React.FC = () => {
  const now = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  // --- ESTADOS ---
  const [syncKey, setSyncKey] = useState<string>(localStorage.getItem('sync_key') || '');
  const [dailyTarget, setDailyTarget] = useState<number>(30);
  const [days, setDays] = useState<DayData[]>(
    Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, expenses: [] }))
  );
  const [isSyncing, setIsSyncing] = useState(false);

  // --- PERSISTENCIA Y SINCRONIZACIÓN ---
  
  // Carga inicial (Local + Nube si hay llave)
  useEffect(() => {
    const localData = localStorage.getItem('gas_control_data');
    const localTarget = localStorage.getItem('gas_control_target');
    
    if (localData) setDays(JSON.parse(localData));
    if (localTarget) setDailyTarget(parseFloat(localTarget));

    if (syncKey) {
      loadFromCloud(syncKey);
    }
  }, []);

  const loadFromCloud = async (key: string) => {
    setIsSyncing(true);
    const cloudData = await syncService.load(key);
    if (cloudData) {
      setDays(cloudData.days);
      setDailyTarget(cloudData.target);
    }
    setIsSyncing(false);
  };

  const handleSyncChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSyncKey(val);
    localStorage.setItem('sync_key', val);
  };

  // Guardado automático
  useEffect(() => {
    localStorage.setItem('gas_control_data', JSON.stringify(days));
    localStorage.setItem('gas_control_target', dailyTarget.toString());
    
    if (syncKey) {
      const timeout = setTimeout(() => {
        syncService.save(syncKey, { days, target: dailyTarget });
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [days, dailyTarget, syncKey]);

  // --- LÓGICA DE NEGOCIO ---

  const stats = useMemo(() => {
    // 1. Calcular excedentes de cada día respecto a la meta base
    const dailyExcesses = days.map(d => {
      const spent = d.expenses.reduce((sum, e) => sum + e.amount, 0);
      return { day: d.day, excess: Math.max(0, spent - dailyTarget) };
    });

    const totalExcess = dailyExcesses.reduce((sum, d) => sum + d.excess, 0);

    // 2. Calcular stats por cada día con redistribución
    return days.map(d => {
      const spent = d.expenses.reduce((sum, e) => sum + e.amount, 0);
      const myExcess = Math.max(0, spent - dailyTarget);
      
      // El exceso de LOS OTROS días se descuenta de MI asignado equitativamente
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

  const addExpense = (dayNum: number) => {
    const desc = prompt("Descripción del gasto:");
    const amountStr = prompt("Monto:");
    if (!amountStr || isNaN(parseFloat(amountStr))) return;

    setDays(prev => prev.map(d => {
      if (d.day === dayNum) {
        return {
          ...d,
          expenses: [...d.expenses, { 
            id: crypto.randomUUID(), 
            amount: parseFloat(amountStr), 
            description: desc || "Gasto" 
          }]
        };
      }
      return d;
    }));
  };

  const deleteExpense = (dayNum: number, expId: string) => {
    setDays(prev => prev.map(d => {
      if (d.day === dayNum) {
        return { ...d, expenses: d.expenses.filter(e => e.id !== expId) };
      }
      return d;
    }));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Barra de Sincronización Nube */}
      <div className="bg-indigo-900 text-white px-4 py-2 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-[60]">
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${syncKey ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`}></div>
          <span className="text-[10px] font-black uppercase tracking-widest">
            {syncKey ? 'Sincronizado' : 'Solo Local (Datos en riesgo)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="text-[10px] font-black uppercase opacity-70">Sync ID:</label>
          <input 
            type="text" 
            placeholder="Escribe tu clave secreta..."
            value={syncKey}
            onChange={handleSyncChange}
            className="bg-white/10 border-none rounded px-3 py-1 text-xs font-bold outline-none focus:bg-white/20 w-48"
          />
          {syncKey && (
            <button onClick={() => loadFromCloud(syncKey)} className="text-[10px] font-black bg-indigo-700 px-2 py-1 rounded hover:bg-indigo-600 transition-colors">
              {isSyncing ? '...' : 'RECARGAR'}
            </button>
          )}
        </div>
      </div>

      {/* Header Principal */}
      <header className="bg-white border-b shadow-sm sticky top-[40px] z-50">
        <div className="max-w-6xl mx-auto px-4 py-6 flex flex-col md:flex-row items-center justify-between gap-6">
          <div>
            <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">GasControl <span className="text-indigo-600">Pro</span></h1>
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
              Control de Equilibrado de Excedentes Diarios
            </p>
          </div>

          <div className="flex items-center gap-6 bg-slate-50 p-3 rounded-2xl border">
            <div className="px-4">
              <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Meta Base Diaria</label>
              <div className="flex items-center gap-1">
                <span className="font-black text-slate-400">$</span>
                <input 
                  type="number" 
                  value={dailyTarget} 
                  onChange={e => setDailyTarget(parseFloat(e.target.value) || 0)}
                  className="bg-transparent border-none p-0 w-20 font-black text-2xl text-slate-800 focus:ring-0"
                />
              </div>
            </div>
            <div className="w-px h-10 bg-slate-200"></div>
            <div className="px-4">
              <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Total Gastado Mes</p>
              <p className="text-2xl font-black text-indigo-600">
                ${stats.reduce((acc, s) => acc + s.spent, 0).toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </header>

      {/* Grid Calendario */}
      <main className="max-w-6xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {stats.map(s => {
            const dayData = days.find(d => d.day === s.day);
            const isToday = s.day === now.getDate();
            const isCritical = s.remaining < 0;

            return (
              <div 
                key={s.day} 
                className={`bg-white rounded-3xl border-2 transition-all flex flex-col ${
                  isToday ? 'border-indigo-500 shadow-xl shadow-indigo-100 ring-4 ring-indigo-50' : 'border-slate-100'
                }`}
              >
                {/* Cabecera Día */}
                <div className={`p-4 flex justify-between items-center ${
                  isToday ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-800 border-b border-slate-100'
                } rounded-t-[1.4rem]`}>
                  <div className="flex items-center gap-2">
                    <span className="text-xl font-black">Día {s.day}</span>
                    {isToday && <span className="bg-white/20 text-[8px] px-2 py-0.5 rounded-full font-black uppercase">HOY</span>}
                  </div>
                  <button 
                    onClick={() => addExpense(s.day)}
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-bold text-lg shadow-sm ${
                      isToday ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'
                    }`}
                  >
                    +
                  </button>
                </div>

                {/* Info Financiera */}
                <div className="p-5 space-y-4 flex-grow">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-slate-50 p-2 rounded-xl border border-slate-100">
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Asignado</p>
                      <p className={`text-xs font-black ${s.assigned < 0 ? 'text-rose-500' : 'text-slate-600'}`}>
                        ${s.assigned.toFixed(2)}
                      </p>
                    </div>
                    <div className={`${isCritical ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'} p-2 rounded-xl border`}>
                      <p className="text-[8px] font-black text-slate-400 uppercase mb-0.5">Restante</p>
                      <p className={`text-xs font-black ${isCritical ? 'text-rose-600' : 'text-emerald-600'}`}>
                        ${s.remaining.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Lista de Gastos */}
                  <div className="space-y-1.5 max-h-32 overflow-y-auto min-h-[40px]">
                    {dayData?.expenses.map(exp => (
                      <div key={exp.id} className="flex justify-between items-center bg-slate-50 p-2 rounded-lg group">
                        <div className="overflow-hidden">
                          <p className="text-[9px] font-bold text-slate-400 truncate">{exp.description}</p>
                          <p className="text-xs font-black text-slate-700">${exp.amount.toFixed(2)}</p>
                        </div>
                        <button 
                          onClick={() => deleteExpense(s.day, exp.id)}
                          className="text-slate-200 hover:text-rose-500 p-1 opacity-0 group-hover:opacity-100 transition-all"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    {!dayData?.expenses.length && (
                      <p className="text-[9px] text-slate-300 italic text-center py-2">Sin gastos</p>
                    )}
                  </div>
                </div>

                {/* Pie Gasto Total */}
                <div className="px-5 py-3 bg-slate-50 border-t border-slate-100 rounded-b-3xl flex justify-between items-center">
                  <span className="text-[9px] font-black text-slate-400 uppercase">Gasto Día</span>
                  <span className="font-black text-slate-800 text-sm">${s.spent.toFixed(2)}</span>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <div className="fixed bottom-6 right-6 z-[100]">
        <button 
          onClick={() => {
            if(confirm("¿Borrar todo el mes local y nube?")) {
              setDays(Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, expenses: [] })));
              if(syncKey) syncService.save(syncKey, { days: [], target: dailyTarget });
            }
          }}
          className="bg-white border-2 border-slate-200 text-slate-400 p-4 rounded-full shadow-2xl hover:text-rose-500 hover:border-rose-200 transition-all"
          title="Resetear Mes"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>
  );
};

export default App;
