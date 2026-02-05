
import React, { useState, useEffect, useMemo } from 'react';
import { DayData, DailyExpense } from './types';

const STORAGE_KEY = 'balanced_daily_budget_v3';

const App: React.FC = () => {
  // Configuración de fecha
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Estados
  const [dailyTarget, setDailyTarget] = useState<number>(() => {
    const saved = localStorage.getItem('base_daily_target_v3');
    return saved ? parseFloat(saved) : 50;
  });

  const [days, setDays] = useState<DayData[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length === daysInMonth) return parsed;
    }
    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      expenses: []
    }));
  });

  // Persistencia
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(days));
    localStorage.setItem('base_daily_target_v3', dailyTarget.toString());
  }, [days, dailyTarget]);

  // LÓGICA DE EQUILIBRADO SOLICITADA:
  // "Si me excedí ese día (sobre la meta diaria), en los demás se descuenta ese excedente equitativamente"
  
  const getDayStats = (dayNum: number) => {
    const dayData = days.find(d => d.day === dayNum);
    const spentThisDay = dayData?.expenses.reduce((sum, e) => sum + e.amount, 0) || 0;

    // Calcular excedentes de OTROS días (Diferencia entre gasto y meta base)
    const othersSurplus = days.reduce((acc, d) => {
      if (d.day === dayNum) return acc;
      const dSpent = d.expenses.reduce((sum, e) => sum + e.amount, 0);
      // Solo sumamos si hubo exceso sobre la meta base
      const excess = Math.max(0, dSpent - dailyTarget);
      return acc + excess;
    }, 0);

    // El monto asignado para HOY es la meta base menos el "castigo" por los excedentes de los demás
    // dividido entre los días restantes (o totales menos uno) para ser equitativo.
    const penalty = othersSurplus / (daysInMonth - 1);
    const assignedForDay = dailyTarget - penalty;

    return {
      assigned: assignedForDay,
      spent: spentThisDay,
      remaining: assignedForDay - spentThisDay
    };
  };

  const addExpenseItem = (dayNum: number) => {
    const amountStr = prompt(`Ingrese el monto del gasto para el día ${dayNum}:`);
    if (!amountStr || isNaN(parseFloat(amountStr))) return;
    
    const amount = parseFloat(amountStr);
    const description = prompt("Descripción del gasto:") || "Gasto";

    setDays(prev => prev.map(d => {
      if (d.day === dayNum) {
        return {
          ...d,
          expenses: [...d.expenses, { id: crypto.randomUUID(), amount, description }]
        };
      }
      return d;
    }));
  };

  const removeExpenseItem = (dayNum: number, expenseId: string) => {
    setDays(prev => prev.map(d => {
      if (d.day === dayNum) {
        return {
          ...d,
          expenses: d.expenses.filter(e => e.id !== expenseId)
        };
      }
      return d;
    }));
  };

  const totalSpentMonth = useMemo(() => {
    return days.reduce((acc, d) => acc + d.expenses.reduce((sum, e) => sum + e.amount, 0), 0);
  }, [days]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20 font-sans">
      {/* Header con Configuración de Meta Base */}
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-6 flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex flex-col">
            <h1 className="text-2xl font-black text-slate-800 tracking-tighter uppercase">GasControl <span className="text-indigo-600">Pro</span></h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(now)}
            </p>
          </div>

          <div className="flex items-center gap-6 bg-slate-100 p-3 rounded-3xl border border-slate-200">
            <div className="px-4">
              <label className="block text-[9px] font-black text-slate-500 uppercase mb-1">Meta Gasto Diario Base</label>
              <div className="flex items-center gap-1">
                <span className="text-xl font-black text-slate-400">$</span>
                <input 
                  type="number" 
                  value={dailyTarget} 
                  onChange={e => setDailyTarget(parseFloat(e.target.value) || 0)}
                  className="bg-transparent border-none p-0 w-20 font-black text-2xl text-slate-800 focus:ring-0"
                />
              </div>
            </div>
            <div className="w-px h-10 bg-slate-300"></div>
            <div className="px-4">
              <p className="text-[9px] font-black text-slate-500 uppercase mb-1">Total Gastado Mes</p>
              <p className="text-2xl font-black text-indigo-600">${totalSpentMonth.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </header>

      {/* Grid de Reporte Diario */}
      <main className="max-w-5xl mx-auto px-4 mt-10">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {days.map(d => {
            const stats = getDayStats(d.day);
            const isToday = d.day === now.getDate();
            const isCritical = stats.remaining < 0;

            return (
              <div 
                key={d.day} 
                className={`bg-white rounded-[2.5rem] border-2 transition-all flex flex-col ${
                  isToday ? 'border-indigo-500 shadow-xl shadow-indigo-100 ring-4 ring-indigo-50' : 'border-slate-100'
                }`}
              >
                {/* Cabecera del Día */}
                <div className={`p-5 flex justify-between items-center ${
                  isToday ? 'bg-indigo-600 text-white' : 'bg-slate-50 text-slate-800 border-b border-slate-100'
                } rounded-t-[2.3rem]`}>
                  <div>
                    <span className="text-xl font-black tracking-tighter">Día {d.day}</span>
                    {isToday && <span className="ml-2 text-[9px] font-black bg-white/20 px-2 py-0.5 rounded-full uppercase">Hoy</span>}
                  </div>
                  <button 
                    onClick={() => addExpenseItem(d.day)}
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold text-xl shadow-md transition-transform active:scale-90 ${
                      isToday ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'
                    }`}
                  >
                    +
                  </button>
                </div>

                {/* Cuerpo del Día */}
                <div className="p-6 space-y-5 flex-grow">
                  {/* Panel de Balances */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-50 p-3 rounded-2xl border border-slate-100">
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">Asignado</p>
                      <p className={`text-sm font-black ${stats.assigned < 0 ? 'text-rose-500' : 'text-slate-700'}`}>
                        ${stats.assigned.toFixed(2)}
                      </p>
                    </div>
                    <div className={`${isCritical ? 'bg-rose-50 border-rose-100' : 'bg-emerald-50 border-emerald-100'} p-3 rounded-2xl border`}>
                      <p className="text-[8px] font-black text-slate-400 uppercase tracking-wider mb-1">Restante</p>
                      <p className={`text-sm font-black ${isCritical ? 'text-rose-600' : 'text-emerald-600'}`}>
                        ${stats.remaining.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Listado de Gastos (Campos Autoadicionables) */}
                  <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                    {d.expenses.map(exp => (
                      <div key={exp.id} className="group flex justify-between items-center bg-slate-50/50 p-2.5 rounded-xl border border-dashed border-slate-200 hover:border-indigo-200 transition-colors">
                        <div className="overflow-hidden">
                          <p className="text-[10px] font-bold text-slate-500 truncate">{exp.description}</p>
                          <p className="text-xs font-black text-slate-800">${exp.amount.toFixed(2)}</p>
                        </div>
                        <button 
                          onClick={() => removeExpenseItem(d.day, exp.id)}
                          className="text-slate-300 hover:text-rose-500 transition-all p-1 group-hover:opacity-100"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                      </div>
                    ))}
                    {d.expenses.length === 0 && (
                      <p className="text-[10px] text-slate-300 italic text-center py-4">Sin gastos registrados</p>
                    )}
                  </div>
                </div>

                {/* Footer del Día: Gasto Total */}
                <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 rounded-b-[2.5rem] flex justify-between items-center">
                  <p className="text-[9px] font-black text-slate-400 uppercase">Gasto Total Día</p>
                  <p className="font-black text-slate-800 tracking-tight">${stats.spent.toFixed(2)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 p-6 flex justify-center pointer-events-none">
        <button 
          onClick={() => {
            if(confirm("¿Deseas resetear todos los gastos del mes?")) {
              setDays(Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, expenses: [] })));
            }
          }}
          className="bg-white/80 backdrop-blur-md border border-slate-200 text-slate-400 px-8 py-3 rounded-full text-[10px] font-black uppercase tracking-widest shadow-xl pointer-events-auto hover:text-rose-500 hover:border-rose-100 transition-all"
        >
          Resetear Registro Mensual
        </button>
      </footer>
    </div>
  );
};

export default App;
