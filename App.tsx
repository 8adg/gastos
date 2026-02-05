
import React, { useState, useEffect, useMemo } from 'react';
import { DayData, DailyExpense, AIInsight } from './types';
import { getFinancialAdvice } from './services/geminiService';

const STORAGE_KEY = 'balanced_daily_budget_v2';

const App: React.FC = () => {
  // Configuración de fecha actual
  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();

  // Estados principales
  const [dailyTarget, setDailyTarget] = useState<number>(() => {
    const saved = localStorage.getItem('base_daily_target');
    return saved ? parseFloat(saved) : 30;
  });

  const [days, setDays] = useState<DayData[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Asegurar que el mes coincide o inicializar
      if (parsed.length === daysInMonth) return parsed;
    }
    return Array.from({ length: daysInMonth }, (_, i) => ({
      day: i + 1,
      expenses: []
    }));
  });

  // Estado para consejos de IA
  const [advice, setAdvice] = useState<AIInsight | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  // Persistencia
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(days));
    localStorage.setItem('base_daily_target', dailyTarget.toString());
  }, [days, dailyTarget]);

  // LÓGICA DE EQUILIBRADO
  const totalMonthlyBudget = dailyTarget * daysInMonth;
  const totalSpent = useMemo(() => {
    return days.reduce((acc, d) => acc + d.expenses.reduce((sum, e) => sum + e.amount, 0), 0);
  }, [days]);

  const getDayStats = (dayNum: number) => {
    const dayData = days.find(d => d.day === dayNum);
    const spentOnThisDay = dayData?.expenses.reduce((sum, e) => sum + e.amount, 0) || 0;
    
    // Gasto en todos los demás días
    const spentOnOthers = totalSpent - spentOnThisDay;
    
    // El presupuesto "disponible" para este día se ajusta según lo que ya se gastó en el resto del mes
    const adjustedBudget = totalMonthlyBudget - spentOnOthers;
    const remainingForDay = adjustedBudget - spentOnThisDay;

    return {
      spent: spentOnThisDay,
      limit: adjustedBudget,
      remaining: remainingForDay
    };
  };

  const handleGenerateAdvice = async () => {
    setIsAnalyzing(true);
    try {
      const allExpenses = days.flatMap(d => d.expenses);
      const res = await getFinancialAdvice(allExpenses, totalMonthlyBudget);
      setAdvice(res);
    } catch (err) {
      console.error("Advice generation failed", err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const addExpense = (dayNum: number) => {
    const amountStr = prompt(`Monto para el día ${dayNum}:`);
    if (!amountStr || isNaN(parseFloat(amountStr))) return;
    
    const amount = parseFloat(amountStr);
    const desc = prompt("Descripción (opcional):") || "Gasto";

    setDays(prev => prev.map(d => {
      if (d.day === dayNum) {
        return {
          ...d,
          expenses: [...d.expenses, { id: crypto.randomUUID(), amount, description: desc }]
        };
      }
      return d;
    }));
  };

  const removeExpense = (dayNum: number, expenseId: string) => {
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

  const clearAll = () => {
    if (confirm("¿Estás seguro de borrar todos los datos del mes?")) {
      setDays(Array.from({ length: daysInMonth }, (_, i) => ({ day: i + 1, expenses: [] })));
      setAdvice(null);
    }
  };

  return (
    <div className="min-h-screen bg-zinc-100 text-zinc-900 pb-24">
      {/* Header Fijo */}
      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-black tracking-tighter text-indigo-600 uppercase">Balance Diario</h1>
              <div className="flex items-center gap-3">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">
                  {new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(now)}
                </p>
                <button 
                  onClick={handleGenerateAdvice}
                  disabled={isAnalyzing}
                  className="bg-indigo-600 text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-md shadow-indigo-100"
                >
                  {isAnalyzing ? 'Analizando...' : 'Análisis IA'}
                </button>
              </div>
            </div>
            
            <div className="flex items-center gap-4 bg-zinc-50 p-2 rounded-2xl border">
              <div className="px-2">
                <label className="block text-[9px] font-black text-zinc-400 uppercase">Meta Diaria Base</label>
                <div className="flex items-center gap-1">
                  <span className="font-bold text-zinc-400">$</span>
                  <input 
                    type="number" 
                    value={dailyTarget} 
                    onChange={e => setDailyTarget(parseFloat(e.target.value) || 0)}
                    className="bg-transparent border-none p-0 w-16 font-black text-xl text-zinc-800 focus:ring-0"
                  />
                </div>
              </div>
              <div className="h-8 w-px bg-zinc-200"></div>
              <div className="px-2">
                <p className="text-[9px] font-black text-zinc-400 uppercase">Total Gastado</p>
                <p className="text-xl font-black text-indigo-600">${totalSpent.toFixed(2)}</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Insight Panel */}
      {advice && (
        <section className="max-w-4xl mx-auto px-4 mt-8">
          <div className="bg-indigo-600 text-white p-6 rounded-[2rem] shadow-xl relative">
            <button 
              onClick={() => setAdvice(null)} 
              className="absolute top-4 right-4 text-white/40 hover:text-white transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest opacity-60">Recomendaciones de IA</h3>
                <p className="text-xl font-black tracking-tight leading-tight">{advice.analysis}</p>
                <div className="bg-white/10 p-4 rounded-2xl border border-white/5 inline-block">
                  <p className="text-[10px] font-black uppercase opacity-60 mb-1">Cierre proyectado</p>
                  <p className="text-2xl font-black text-indigo-200">{advice.forecast}</p>
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-xs font-black uppercase tracking-widest opacity-60">Plan de Acción</h3>
                <ul className="space-y-3">
                  {advice.recommendations.map((rec, i) => (
                    <li key={i} className="flex gap-3 items-start text-sm font-bold">
                      <span className="flex-shrink-0 w-6 h-6 bg-white/20 rounded-full flex items-center justify-center text-[10px]">{i+1}</span>
                      <span>{rec}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Grid de Días */}
      <main className="max-w-4xl mx-auto px-4 mt-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {days.map(d => {
            const stats = getDayStats(d.day);
            const isOver = stats.spent > stats.limit;
            const isToday = d.day === now.getDate();

            return (
              <div 
                key={d.day} 
                className={`bg-white rounded-[2rem] border-2 transition-all ${
                  isToday ? 'border-indigo-500 shadow-lg ring-4 ring-indigo-50' : 'border-zinc-100'
                } overflow-hidden`}
              >
                {/* Cabecera del día */}
                <div className={`px-5 py-4 flex justify-between items-center ${
                  isToday ? 'bg-indigo-500 text-white' : 'bg-zinc-50 text-zinc-800'
                }`}>
                  <div>
                    <span className="text-2xl font-black tracking-tighter">Día {d.day}</span>
                    {isToday && <span className="ml-2 text-[10px] font-black uppercase opacity-75">Hoy</span>}
                  </div>
                  <button 
                    onClick={() => addExpense(d.day)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-lg transition-transform hover:scale-110 ${
                      isToday ? 'bg-white text-indigo-600' : 'bg-indigo-600 text-white'
                    }`}
                  >
                    +
                  </button>
                </div>

                <div className="p-5 space-y-4">
                  {/* Stats del día */}
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-zinc-50 p-2 rounded-xl">
                      <p className="text-[8px] font-black text-zinc-400 uppercase">Asignado</p>
                      <p className={`text-sm font-black ${stats.limit < 0 ? 'text-rose-600' : 'text-zinc-700'}`}>
                        ${stats.limit.toFixed(2)}
                      </p>
                    </div>
                    <div className={`${isOver ? 'bg-rose-50' : 'bg-emerald-50'} p-2 rounded-xl`}>
                      <p className="text-[8px] font-black text-zinc-400 uppercase">Gastado</p>
                      <p className={`text-sm font-black ${isOver ? 'text-rose-600' : 'text-emerald-600'}`}>
                        ${stats.spent.toFixed(2)}
                      </p>
                    </div>
                  </div>

                  {/* Listado de gastos del día */}
                  <div className="space-y-1 min-h-[40px]">
                    {d.expenses.map(exp => (
                      <div key={exp.id} className="flex justify-between items-center group bg-zinc-50/50 p-2 rounded-lg hover:bg-zinc-50">
                        <div className="overflow-hidden">
                          <p className="text-xs font-bold text-zinc-700 truncate">{exp.description}</p>
                          <p className="text-[10px] font-black text-indigo-400">${exp.amount.toFixed(2)}</p>
                        </div>
                        <button 
                          onClick={() => removeExpense(d.day, exp.id)}
                          className="text-zinc-300 hover:text-rose-500 transition-colors p-1"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </div>
                    ))}
                    {d.expenses.length === 0 && (
                      <p className="text-[10px] text-zinc-300 italic text-center py-2">Sin gastos</p>
                    )}
                  </div>

                  {/* Barra de progreso local */}
                  <div className="pt-2">
                    <div className="h-1.5 w-full bg-zinc-100 rounded-full overflow-hidden">
                      <div 
                        className={`h-full transition-all duration-500 ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                        style={{ width: `${Math.min(100, (stats.spent / Math.max(0.1, stats.limit)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* Footer de Acciones */}
      <footer className="fixed bottom-0 left-0 right-0 p-4 pointer-events-none">
        <div className="max-w-4xl mx-auto flex justify-end pointer-events-auto">
          <button 
            onClick={clearAll}
            className="bg-white border-2 border-zinc-100 text-rose-500 px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-rose-50 transition-colors"
          >
            Resetear Mes
          </button>
        </div>
      </footer>
    </div>
  );
};

export default App;
