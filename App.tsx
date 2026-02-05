
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
const DEFAULT_BACKEND_URL = 'https://www.8adg.com.ar/gastos';

const App: React.FC = () => {
  const [initialDailyBudget, setInitialDailyBudget] = useState<number>(() => {
    const saved = localStorage.getItem(BUDGET_STORAGE_KEY);
    return saved ? parseFloat(saved) : 50;
  });
  
  const [apiKey, setApiKey] = useState<string>('');
  const [backendUrl, setBackendUrl] = useState<string>(DEFAULT_BACKEND_URL);
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

  const getApiUrl = () => {
    let url = backendUrl.trim();
    if (!url) return null;
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url.endsWith('api.php') ? url : `${url}/api.php`;
  };

  // --- Sincronización de Configuración (API KEY) ---
  const pullConfig = async () => {
    const apiUrl = getApiUrl();
    if (!apiUrl) return;
    try {
      const res = await fetch(`${apiUrl}?action=get_config`);
      if (res.ok) {
        const config = await res.json();
        if (config.gemini_api_key) setApiKey(config.gemini_api_key);
      }
    } catch (e) { console.error("Error al cargar config", e); }
  };

  const pushConfig = async (newKey: string) => {
    const apiUrl = getApiUrl();
    if (!apiUrl) return;
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save_config',
          config: { gemini_api_key: newKey }
        })
      });
    } catch (e) { console.error("Error al guardar config", e); }
  };

  // --- Sincronización de Registros ---
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
    } catch (e) { setSyncStatus('error'); }
    return null;
  };

  const pushToServer = async (data: DailyRecord[]) => {
    const apiUrl = getApiUrl();
    if (!apiUrl || data.length === 0) return;
    try {
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear, records: data })
      });
      if (response.ok) setSyncStatus('success');
      else setSyncStatus('error');
    } catch (e) { setSyncStatus('error'); }
  };

  useEffect(() => {
    const init = async () => {
      await pullConfig(); // Primero la clave
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      const serverData = await pullFromServer(selectedMonth, selectedYear);
      
      if (serverData && Array.isArray(serverData)) {
        setRecords(serverData);
      } else {
        const saved = localStorage.getItem(currentMonthKey);
        setRecords(saved ? JSON.parse(saved) : Array.from({ length: daysInMonth }, (_, i) => ({
          day: i + 1, expenses: [], isLocked: false, adjustedBudget: initialDailyBudget, date: new Date(selectedYear, selectedMonth, i + 1)
        })));
      }
    };
    init();
  }, [selectedMonth, selectedYear]);

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
      const handler = setTimeout(() => pushToServer(rebalancedRecords), 1500);
      return () => clearTimeout(handler);
    }
  }, [rebalancedRecords]);

  const saveSettings = (key: string, url: string) => {
    setApiKey(key);
    setBackendUrl(url);
    pushConfig(key);
    setShowSettings(false);
  };

  // --- Funciones de Gasto y Cámara ---
  const addNewExpenseField = (day: number, initialAmount: number = 0, initialLabel: string = '') => {
    setRecords(prev => prev.map(r => {
      if (r.day === day) {
        const newExpense: ExpenseItem = { id: Math.random().toString(36).substr(2, 9), amount: initialAmount, label: initialLabel };
        return { ...r, expenses: [...r.expenses, newExpense], isLocked: true };
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
        if (amount !== null && amount > 0) {
          addNewExpenseField(scanningDay, amount, 'Ticket Escaneado');
        }
      } catch (err) { console.error(err); }
      finally { setLoadingAI(false); setScanningDay(null); }
    };
    reader.readAsDataURL(file);
  };

  const summary = useMemo<MonthlySummary>(() => {
    const totalSpent = rebalancedRecords.reduce((acc, r) => acc + r.expenses.reduce((s, e) => s + e.amount, 0), 0);
    const totalBudget = initialDailyBudget * rebalancedRecords.length;
    const lockedDays = rebalancedRecords.filter(r => r.isLocked);
    const remainingDaysCount = rebalancedRecords.length - lockedDays.length;
    return {
      totalBudget, totalSpent, totalBalance: totalBudget - totalSpent,
      projectedSpending: 0, isOverBudget: totalSpent > totalBudget,
      currentDailyAllowance: remainingDaysCount > 0 ? (totalBudget - totalSpent) / remainingDaysCount : 0
    };
  }, [rebalancedRecords, initialDailyBudget]);

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={onFileChange} className="hidden" />

      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2.5rem] w-full max-w-md p-8 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-2xl font-black text-slate-800 mb-6 flex items-center gap-2">Configuración Cloud</h3>
            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Google Gemini API Key (Se guarda en tu DB)</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm" placeholder="Pega tu clave..." />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">URL del Servidor Apache</label>
                <input type="text" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-mono text-sm" />
              </div>
              <button onClick={() => saveSettings(apiKey, backendUrl)} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all">Sincronizar Todo</button>
              <button onClick={() => setShowSettings(false)} className="w-full text-slate-400 text-sm font-bold">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-2xl shadow-lg">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">GAS Control <span className="text-indigo-600 italic">Cloud</span></h1>
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${syncStatus === 'success' ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}></div>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">
                  {syncStatus === 'success' ? 'Sincronizado' : 'Error / Offline'} | {apiKey ? 'AI Lista' : 'Sin AI'}
                </p>
              </div>
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2.5 bg-slate-50 text-slate-400 rounded-xl hover:text-indigo-600 transition-all">
             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Meta Diaria</h2>
            <input type="number" value={initialDailyBudget} onChange={(e) => setInitialDailyBudget(parseFloat(e.target.value) || 0)} className="w-full px-5 py-4 bg-slate-50 border border-slate-200 rounded-2xl font-black text-slate-700 text-2xl focus:ring-2 focus:ring-indigo-500 outline-none" />
          </section>

          <section className="bg-slate-900 p-8 rounded-[2.5rem] shadow-2xl text-white">
             <h2 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-8">Saldo Disponible</h2>
             <p className={`text-6xl font-black tracking-tighter ${summary.currentDailyAllowance < initialDailyBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
                ${summary.currentDailyAllowance.toFixed(2)}
             </p>
             <div className="grid grid-cols-2 gap-6 pt-8 mt-8 border-t border-white/5">
                <div><p className="text-[10px] text-slate-500 uppercase font-black">Gastado</p><p className="text-2xl font-black">${summary.totalSpent.toFixed(2)}</p></div>
                <div><p className="text-[10px] text-slate-500 uppercase font-black">Presupuesto</p><p className="text-2xl font-black text-slate-500">${summary.totalBudget.toFixed(2)}</p></div>
             </div>
          </section>

          <button onClick={() => analyzeExpenses(apiKey, records, initialDailyBudget, 'Mes Actual').then(setAiAnalysis)} disabled={loadingAI} className="w-full bg-white border border-slate-200 p-6 rounded-3xl flex items-center justify-between group hover:border-indigo-500 transition-all">
             <div className="flex items-center gap-4">
                <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                   {loadingAI ? <div className="w-5 h-5 border-2 border-current border-t-transparent rounded-full animate-spin"></div> : <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                </div>
                <div className="text-left"><p className="text-sm font-black text-slate-800">IA Auditor</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Revisar Ahorros</p></div>
             </div>
          </button>
        </div>

        <div className="lg:col-span-8 space-y-4">
           {rebalancedRecords.map((record) => {
             const isExpanded = expandedDay === record.day;
             const dayTotal = record.expenses.reduce((s, e) => s + e.amount, 0);
             return (
               <div key={record.day} className={`bg-white rounded-[2rem] border transition-all ${isExpanded ? 'border-indigo-500 shadow-xl' : 'border-slate-100'}`}>
                 <div onClick={() => setExpandedDay(isExpanded ? null : record.day)} className="p-6 flex items-center justify-between cursor-pointer">
                    <div className="flex items-center gap-5">
                       <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-black ${record.isLocked ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300'}`}>
                          {record.day}
                       </div>
                       <div><p className="text-sm font-black text-slate-800">Día {record.day}</p><p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Meta: ${record.adjustedBudget.toFixed(2)}</p></div>
                    </div>
                    <p className={`text-2xl font-black ${dayTotal > record.adjustedBudget ? 'text-rose-500' : 'text-slate-800'}`}>${dayTotal.toFixed(2)}</p>
                 </div>
                 {isExpanded && (
                   <div className="p-6 pt-0 space-y-4">
                      {record.expenses.map(exp => (
                        <div key={exp.id} className="flex gap-2">
                           <input type="text" value={exp.label} onChange={(e) => {
                             const newRecords = records.map(r => r.day === record.day ? {...r, isLocked: true, expenses: r.expenses.map(x => x.id === exp.id ? {...x, label: e.target.value} : x)} : r);
                             setRecords(newRecords);
                           }} className="flex-grow bg-slate-50 p-4 rounded-xl text-sm font-bold" />
                           <input type="number" value={exp.amount} onChange={(e) => {
                             const newRecords = records.map(r => r.day === record.day ? {...r, isLocked: true, expenses: r.expenses.map(x => x.id === exp.id ? {...x, amount: parseFloat(e.target.value) || 0} : x)} : r);
                             setRecords(newRecords);
                           }} className="w-24 bg-slate-50 p-4 rounded-xl text-sm font-black" />
                        </div>
                      ))}
                      <div className="flex gap-2">
                         <button onClick={() => addNewExpenseField(record.day)} className="flex-grow bg-slate-900 text-white py-4 rounded-xl text-[10px] font-black uppercase tracking-widest">Nuevo Gasto</button>
                         <button onClick={() => handleCaptureClick(record.day)} className="bg-indigo-600 text-white p-4 rounded-xl">
                            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                         </button>
                      </div>
                   </div>
                 )}
               </div>
             );
           })}
        </div>
      </main>
    </div>
  );
};

export default App;
