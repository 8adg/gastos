
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { DailyRecord, MonthlySummary, AIAnalysisResponse, ExpenseItem } from './types.ts';
import { analyzeExpenses, extractAmountFromImage } from './services/geminiService.ts';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  Cell,
  ReferenceLine
} from 'recharts';

const STORAGE_KEY_PREFIX = 'gas_control_v3_';
const BUDGET_STORAGE_KEY = 'gas_control_budget_v3';
const API_KEY_STORAGE_KEY = 'gemini_api_key_v3';
const BACKEND_URL_STORAGE_KEY = 'gas_backend_url_v3';

// URL de tu servidor Apache
const DEFAULT_BACKEND_URL = 'https://www.8adg.com.ar/gastos';

const App: React.FC = () => {
  const [initialDailyBudget, setInitialDailyBudget] = useState<number>(() => {
    const saved = localStorage.getItem(BUDGET_STORAGE_KEY);
    return saved ? parseFloat(saved) : 50;
  });
  
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || (typeof process !== 'undefined' && process.env.API_KEY ? process.env.API_KEY : '') || '';
  });

  const [backendUrl, setBackendUrl] = useState<string>(() => {
    return localStorage.getItem(BACKEND_URL_STORAGE_KEY) || DEFAULT_BACKEND_URL;
  });

  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [showSettings, setShowSettings] = useState(false);
  const [records, setRecords] = useState<DailyRecord[]>([]);
  const [loadingAI, setLoadingAI] = useState(false);
  const [scanningDay, setScanningDay] = useState<number | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState<AIAnalysisResponse | null>(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [expandedDay, setExpandedDay] = useState<number | null>(new Date().getDate());
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const currentMonthKey = `${STORAGE_KEY_PREFIX}${selectedYear}_${selectedMonth}`;

  const createNewMonth = (days: number) => Array.from({ length: days }, (_, i) => ({
    day: i + 1,
    expenses: [],
    isLocked: false,
    adjustedBudget: initialDailyBudget,
    date: new Date(selectedYear, selectedMonth, i + 1)
  }));

  // Helper para construir la URL de la API PHP
  const getApiUrl = () => {
    let url = backendUrl.trim();
    if (!url) return null;
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url.endsWith('api.php') ? url : `${url}/api.php`;
  };

  // Sincronización: PULL (Desde api.php)
  const pullFromServer = async (month: number, year: number) => {
    const apiUrl = getApiUrl();
    if (!apiUrl) return null;
    
    setSyncStatus('loading');
    try {
      const response = await fetch(`${apiUrl}?month=${month}&year=${year}`);
      if (response.ok) {
        const data = await response.json();
        setSyncStatus('success');
        return data;
      }
    } catch (e) {
      console.error("Error pulling from server", e);
      setSyncStatus('error');
    }
    return null;
  };

  // Sincronización: PUSH (Hacia api.php)
  const pushToServer = async (data: DailyRecord[]) => {
    const apiUrl = getApiUrl();
    if (!apiUrl || data.length === 0) return;

    setSyncStatus('loading');
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: selectedMonth,
          year: selectedYear,
          records: data
        })
      });
      if (response.ok) {
        setSyncStatus('success');
      } else {
        setSyncStatus('error');
      }
    } catch (e) {
      setSyncStatus('error');
    }
  };

  useEffect(() => {
    const initData = async () => {
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const serverData = await pullFromServer(selectedMonth, selectedYear);
      
      if (serverData && Array.isArray(serverData)) {
        setRecords(serverData);
        return;
      }

      const savedData = localStorage.getItem(currentMonthKey);
      if (savedData) {
        try {
          const parsed = JSON.parse(savedData);
          setRecords(parsed.length === daysInMonth ? parsed : createNewMonth(daysInMonth));
        } catch (e) {
          setRecords(createNewMonth(daysInMonth));
        }
      } else {
        setRecords(createNewMonth(daysInMonth));
      }
    };
    initData();
  }, [selectedMonth, selectedYear, backendUrl]);

  const rebalancedRecords = useMemo(() => {
    if (records.length === 0) return [];
    const totalMonthlyBudget = initialDailyBudget * records.length;
    let accumulatedSpent = 0;
    let processedDaysCount = 0;

    return records.map((record) => {
      const remainingDays = records.length - processedDaysCount;
      const remainingBudget = totalMonthlyBudget - accumulatedSpent;
      const currentTarget = remainingDays > 0 ? remainingBudget / remainingDays : 0;
      const dayTotal = record.expenses.reduce((s, e) => s + e.amount, 0);
      if (record.isLocked) {
        accumulatedSpent += dayTotal;
        processedDaysCount++;
      }
      return { ...record, adjustedBudget: currentTarget };
    });
  }, [records, initialDailyBudget]);

  useEffect(() => {
    if (rebalancedRecords.length > 0) {
      localStorage.setItem(currentMonthKey, JSON.stringify(rebalancedRecords));
      const handler = setTimeout(() => {
        pushToServer(rebalancedRecords);
      }, 1500);
      return () => clearTimeout(handler);
    }
  }, [rebalancedRecords]);

  const saveSettings = (key: string, url: string) => {
    setApiKey(key);
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
    setBackendUrl(url);
    localStorage.setItem(BACKEND_URL_STORAGE_KEY, url);
    setShowSettings(false);
  };

  const handleExpenseChange = (day: number, expenseId: string, field: 'amount' | 'label', value: string) => {
    setRecords(prev => prev.map(r => {
      if (r.day === day) {
        const newExpenses = r.expenses.map(e => {
          if (e.id === expenseId) {
            return { ...e, [field]: field === 'amount' ? (parseFloat(value) || 0) : value };
          }
          return e;
        });
        return { ...r, expenses: newExpenses, isLocked: true };
      }
      return r;
    }));
  };

  const addNewExpenseField = (day: number, initialAmount: number = 0, initialLabel: string = '') => {
    setRecords(prev => prev.map(r => {
      if (r.day === day) {
        const newExpense: ExpenseItem = { 
          id: Math.random().toString(36).substr(2, 9), 
          amount: initialAmount,
          label: initialLabel 
        };
        return { ...r, expenses: [...r.expenses, newExpense], isLocked: true };
      }
      return r;
    }));
  };

  const removeExpense = (day: number, expenseId: string) => {
    setRecords(prev => prev.map(r => {
      if (r.day === day) {
        const filtered = r.expenses.filter(e => e.id !== expenseId);
        return { ...r, expenses: filtered, isLocked: filtered.length > 0 };
      }
      return r;
    }));
  };

  const handleCaptureClick = (day: number) => {
    if (!apiKey) { setShowSettings(true); return; }
    setScanningDay(day);
    fileInputRef.current?.click();
  };

  const onFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || scanningDay === null || !apiKey) return;
    setLoadingAI(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const base64 = (reader.result as string).split(',')[1];
        const amount = await extractAmountFromImage(apiKey, base64, file.type);
        if (amount !== null && amount > 0) addNewExpenseField(scanningDay, amount, 'Escaneo Gasto');
      } catch (err) { console.error(err); }
      finally {
        setLoadingAI(false);
        setScanningDay(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const summary = useMemo<MonthlySummary>(() => {
    const totalSpent = rebalancedRecords.reduce((acc, r) => acc + r.expenses.reduce((s, e) => s + e.amount, 0), 0);
    const lockedDays = rebalancedRecords.filter(r => r.isLocked);
    const totalBudget = initialDailyBudget * rebalancedRecords.length;
    const remainingDaysCount = rebalancedRecords.length - lockedDays.length;
    return {
      totalBudget,
      totalSpent,
      totalBalance: totalBudget - totalSpent,
      projectedSpending: lockedDays.length > 0 ? (totalSpent / lockedDays.length) * rebalancedRecords.length : 0,
      isOverBudget: totalSpent > totalBudget,
      currentDailyAllowance: remainingDaysCount > 0 ? (totalBudget - totalSpent) / remainingDaysCount : 0
    };
  }, [rebalancedRecords, initialDailyBudget]);

  const chartData = useMemo(() => rebalancedRecords.map(r => ({
    name: `${r.day}`,
    gasto: r.expenses.reduce((s, e) => s + e.amount, 0),
    meta: r.adjustedBudget,
    isLocked: r.isLocked
  })), [rebalancedRecords]);

  const runAIAnalysis = async () => {
    if (!apiKey) { setShowSettings(true); return; }
    setLoadingAI(true);
    try {
      const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(selectedYear, selectedMonth));
      const result = await analyzeExpenses(apiKey, rebalancedRecords.filter(r => r.isLocked), initialDailyBudget, monthName);
      setAiAnalysis(result);
    } catch (e) { console.error(e); }
    finally { setLoadingAI(false); }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={onFileChange} className="hidden" />

      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">
              <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
              Ajustes PHP
            </h3>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">Google Gemini API Key</label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="Pega aquí tu clave de IA..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">URL del Servidor</label>
                <input 
                  type="text" 
                  value={backendUrl}
                  onChange={(e) => setBackendUrl(e.target.value)}
                  className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="https://www.8adg.com.ar/gastos"
                />
                <p className="mt-2 text-[10px] text-slate-400 leading-relaxed">
                  Conectado a tu servidor Apache en <strong>{backendUrl}</strong>.
                </p>
              </div>
              <button onClick={() => saveSettings(apiKey, backendUrl)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98]">Actualizar Configuración</button>
              <button onClick={() => setShowSettings(false)} className="w-full text-slate-400 text-sm font-bold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg shadow-indigo-100">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">GAS Control <span className="text-indigo-600 italic">Cloud</span></h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${syncStatus === 'success' ? 'bg-emerald-500' : syncStatus === 'loading' ? 'bg-amber-500 animate-pulse' : syncStatus === 'error' ? 'bg-rose-500' : 'bg-slate-300'}`}></div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  {syncStatus === 'success' ? 'Sincronizado con 8adg.com.ar' : syncStatus === 'loading' ? 'Conectando...' : 'Error de Servidor'}
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <select value={selectedMonth} onChange={(e) => setSelectedMonth(parseInt(e.target.value))} className="bg-slate-50 border-none rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500">
              {Array.from({ length: 12 }, (_, i) => <option key={i} value={i}>{new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2024, i))}</option>)}
            </select>
            <button onClick={() => setShowSettings(true)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:text-indigo-600 hover:bg-indigo-50 transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Presupuesto Diario</h2>
            <div className="relative group">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-bold group-focus-within:text-indigo-500 transition-colors">$</span>
              <input type="number" value={initialDailyBudget} onChange={(e) => setInitialDailyBudget(parseFloat(e.target.value) || 0)} className="w-full pl-10 pr-4 py-5 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-700 text-2xl focus:ring-2 focus:ring-indigo-500 outline-none transition-all" />
            </div>
          </section>

          <section className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white relative overflow-hidden">
             <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full -mr-24 -mt-24 blur-3xl"></div>
             <h2 className="text-[10px] font-bold text-indigo-400 uppercase tracking-[0.2em] mb-8">Estado de Cuenta</h2>
             <div className="space-y-8">
               <div>
                 <p className="text-xs text-slate-500 mb-2 font-bold uppercase tracking-widest">Disponible para hoy</p>
                 <p className={`text-6xl font-black tracking-tighter ${summary.currentDailyAllowance < initialDailyBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
                   ${summary.currentDailyAllowance.toFixed(2)}
                 </p>
               </div>
               <div className="grid grid-cols-2 gap-6 pt-8 border-t border-white/5">
                 <div><p className="text-[10px] text-slate-500 uppercase font-black mb-1">Total Gastado</p><p className="text-2xl font-black text-white">${summary.totalSpent.toFixed(2)}</p></div>
                 <div><p className="text-[10px] text-slate-500 uppercase font-black mb-1">Presupuesto</p><p className="text-2xl font-black text-slate-500">${summary.totalBudget.toFixed(2)}</p></div>
               </div>
             </div>
          </section>

          <button 
            onClick={runAIAnalysis}
            disabled={loadingAI}
            className="w-full bg-white border border-slate-200 p-6 rounded-3xl flex items-center justify-between group hover:border-indigo-500 transition-all shadow-sm"
          >
            <div className="flex items-center gap-4">
               <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                 {loadingAI ? <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin group-hover:border-white"></div> : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
               </div>
               <div className="text-left">
                 <p className="text-sm font-black text-slate-800">Gemini AI Audit</p>
                 <p className="text-[10px] text-slate-400 font-bold uppercase">Optimizar gastos</p>
               </div>
            </div>
            <svg className="w-5 h-5 text-slate-300 group-hover:text-indigo-600 transform group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>
          </button>
        </div>

        <div className="lg:col-span-8 space-y-8">
           <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
             <div className="h-80 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11, fontWeight: 700}} />
                   <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 11}} />
                   <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '24px', border: 'none', boxShadow: '0 25px 50px -12px rgb(0 0 0 / 0.15)'}} />
                   <Bar dataKey="gasto" radius={[8, 8, 0, 0]} barSize={20}>
                     {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.isLocked ? (entry.gasto > entry.meta ? '#f43f5e' : '#6366f1') : '#f1f5f9'} />)}
                   </Bar>
                   <ReferenceLine y={initialDailyBudget} stroke="#cbd5e1" strokeDasharray="12 12" />
                 </BarChart>
               </ResponsiveContainer>
             </div>
           </section>

           <div className="grid grid-cols-1 gap-4">
             {rebalancedRecords.map((record) => {
                const isExpanded = expandedDay === record.day;
                const dayTotal = record.expenses.reduce((s, e) => s + e.amount, 0);
                const isOver = record.isLocked && dayTotal > record.adjustedBudget;
                return (
                  <div key={record.day} className={`bg-white rounded-[2rem] border transition-all duration-300 ${isExpanded ? 'border-indigo-500 shadow-2xl scale-[1.01]' : 'border-slate-100 hover:border-slate-200'}`}>
                    <div onClick={() => setExpandedDay(isExpanded ? null : record.day)} className="p-6 flex items-center justify-between cursor-pointer group">
                       <div className="flex items-center gap-5">
                          <div className={`w-14 h-14 rounded-2xl flex flex-col items-center justify-center font-black transition-all ${record.isLocked ? (isOver ? 'bg-rose-50 text-rose-600' : 'bg-indigo-600 text-white') : 'bg-slate-50 text-slate-300'}`}>
                            <span className="text-[11px] uppercase opacity-60">Día</span>
                            <span className="text-xl leading-none">{record.day}</span>
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-800">Movimientos</p>
                            <p className={`text-[10px] font-black uppercase tracking-tighter ${record.adjustedBudget < initialDailyBudget ? 'text-rose-400' : 'text-slate-400'}`}>Meta: ${record.adjustedBudget.toFixed(2)}</p>
                          </div>
                       </div>
                       <p className={`text-2xl font-black tracking-tight ${isOver ? 'text-rose-500' : (record.isLocked ? 'text-indigo-600' : 'text-slate-200')}`}>
                         ${dayTotal.toFixed(2)}
                       </p>
                    </div>
                    {isExpanded && (
                      <div className="p-6 pt-0 space-y-4 animate-in slide-in-from-top-4">
                        <div className="h-[1px] bg-slate-50 w-full mb-2"></div>
                        {record.expenses.map((expense) => (
                          <div key={expense.id} className="flex gap-3">
                            <input type="text" value={expense.label || ''} onChange={(e) => handleExpenseChange(record.day, expense.id, 'label', e.target.value)} className="flex-grow px-5 py-4 bg-slate-50 rounded-2xl text-sm font-bold outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 transition-all" placeholder="Descripción..." />
                            <input type="number" value={expense.amount || ''} onChange={(e) => handleExpenseChange(record.day, expense.id, 'amount', e.target.value)} className="w-28 px-4 py-4 bg-slate-50 rounded-2xl text-sm font-black outline-none focus:bg-white" placeholder="0.00" />
                            <button onClick={() => removeExpense(record.day, expense.id)} className="text-rose-300 hover:text-rose-600 p-3"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                          </div>
                        ))}
                        <div className="flex gap-4">
                          <button onClick={() => addNewExpenseField(record.day)} className="flex-grow bg-slate-900 text-white py-5 rounded-2xl text-xs font-black uppercase tracking-widest active:scale-95 transition-all">Nuevo Concepto</button>
                          <button onClick={() => handleCaptureClick(record.day)} className="bg-indigo-600 text-white p-5 rounded-2xl shadow-xl active:scale-95 transition-all">
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
             })}
           </div>
        </div>
      </main>
    </div>
  );
};

export default App;
