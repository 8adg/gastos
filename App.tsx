
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
      await pullConfig();
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

  const addNewExpenseField = (day: number, initialAmount: number = 0, initialLabel: string = '') => {
    setRecords(prev => prev.map(r => {
      if (r.day === day) {
        const newExpense: ExpenseItem = { id: Math.random().toString(36).substr(2, 9), amount: initialAmount, label: initialLabel };
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
        if (amount !== null && amount > 0) {
          addNewExpenseField(scanningDay, amount, 'Ticket Escaneado');
        }
      } catch (err) { console.error(err); }
      finally { setLoadingAI(false); setScanningDay(null); }
    };
    reader.readAsDataURL(file);
  };

  const handleRunAnalysis = async () => {
    if (!apiKey) { setShowSettings(true); return; }
    setLoadingAI(true);
    try {
      const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(selectedYear, selectedMonth));
      const result = await analyzeExpenses(apiKey, records, initialDailyBudget, monthName);
      setAiAnalysis(result);
    } catch (e) {
      console.error(e);
      alert("Error al contactar con la IA. Revisa tu clave API.");
    } finally {
      setLoadingAI(false);
    }
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

  const chartData = useMemo(() => rebalancedRecords.map(r => ({
    name: `${r.day}`,
    gasto: r.expenses.reduce((s, e) => s + e.amount, 0),
    meta: r.adjustedBudget,
    isLocked: r.isLocked
  })), [rebalancedRecords]);

  return (
    <div className="min-h-screen bg-slate-50 pb-8 text-[13px]">
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={onFileChange} className="hidden" />

      {/* Modal de Resultados IA */}
      {aiAnalysis && (
        <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[200] flex items-center justify-center p-3">
          <div className="bg-white rounded-[1.5rem] w-full max-w-lg max-h-[85vh] overflow-hidden flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="p-5 bg-indigo-600 text-white shrink-0">
               <div className="flex items-center justify-between mb-1">
                 <h3 className="text-lg font-black tracking-tight">IA Auditor</h3>
                 <button onClick={() => setAiAnalysis(null)} className="p-1.5 bg-white/10 rounded-full">
                   <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                 </button>
               </div>
               <p className="text-indigo-100 text-[11px] font-medium opacity-80">Análisis mensual de gastos.</p>
            </div>
            
            <div className="p-5 overflow-y-auto space-y-5 flex-grow">
               <section>
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Resumen</h4>
                 <p className="text-slate-700 leading-snug font-medium bg-slate-50 p-4 rounded-xl border border-slate-100">{aiAnalysis.insight}</p>
               </section>

               <section>
                 <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Recomendaciones</h4>
                 <div className="grid gap-2">
                   {aiAnalysis.recommendations.map((rec, i) => (
                     <div key={i} className="flex gap-3 p-3 bg-emerald-50 rounded-xl border border-emerald-100">
                       <svg className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 20 20"><path d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" /></svg>
                       <p className="text-emerald-800 text-[12px] font-bold">{rec}</p>
                     </div>
                   ))}
                 </div>
               </section>
            </div>
            
            <div className="p-4 border-t bg-slate-50">
              <button onClick={() => setAiAnalysis(null)} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg">Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-3">
          <div className="bg-white rounded-[1.5rem] w-full max-w-sm p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">Configuración Cloud</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Google Gemini API Key</label>
                <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">URL Servidor</label>
                <input type="text" value={backendUrl} onChange={(e) => setBackendUrl(e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs" />
              </div>
              <button onClick={() => saveSettings(apiKey, backendUrl)} className="w-full bg-slate-900 text-white py-3 rounded-xl font-black text-xs shadow-xl hover:bg-slate-800 transition-all">Sincronizar</button>
              <button onClick={() => setShowSettings(false)} className="w-full text-slate-400 text-[11px] font-bold mt-2">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b sticky top-0 z-50 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-1.5 rounded-lg">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <div>
              <h1 className="text-sm font-black text-slate-800 tracking-tight">GAS <span className="text-indigo-600 italic">Cloud</span></h1>
              <div className="flex items-center gap-1.5">
                <div className={`w-1.5 h-1.5 rounded-full ${syncStatus === 'success' ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}></div>
                <p className="text-[9px] text-slate-400 font-bold uppercase">{syncStatus === 'success' ? 'Online' : 'Offline'}</p>
              </div>
            </div>
          </div>
          <button onClick={() => setShowSettings(true)} className="p-2 bg-slate-50 text-slate-400 rounded-lg hover:text-indigo-600">
             <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-3 mt-4 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-4 space-y-4">
          <section className="bg-white p-4 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">Meta Diaria</h2>
            <input type="number" value={initialDailyBudget} onChange={(e) => setInitialDailyBudget(parseFloat(e.target.value) || 0)} className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-black text-slate-700 text-lg outline-none focus:ring-1 focus:ring-indigo-500" />
          </section>

          <section className="bg-slate-900 p-5 rounded-[1.5rem] shadow-xl text-white">
             <h2 className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mb-4">Saldo Disponible</h2>
             <p className={`text-4xl font-black tracking-tighter ${summary.currentDailyAllowance < initialDailyBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
                ${summary.currentDailyAllowance.toFixed(2)}
             </p>
             <div className="grid grid-cols-2 gap-4 pt-4 mt-4 border-t border-white/5">
                <div><p className="text-[9px] text-slate-500 uppercase font-black">Gastado</p><p className="text-lg font-black">${summary.totalSpent.toFixed(2)}</p></div>
                <div><p className="text-[9px] text-slate-500 uppercase font-black">Meta Mes</p><p className="text-lg font-black text-slate-500">${summary.totalBudget.toFixed(2)}</p></div>
             </div>
          </section>

          <button onClick={handleRunAnalysis} disabled={loadingAI} className="w-full bg-white border border-slate-200 p-4 rounded-2xl flex items-center justify-between group hover:border-indigo-500 shadow-sm active:scale-[0.98] transition-all">
             <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-50 rounded-xl text-indigo-600 group-hover:bg-indigo-600 group-hover:text-white">
                   {loadingAI ? <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin group-hover:border-white"></div> : <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
                </div>
                <div className="text-left"><p className="text-xs font-black text-slate-800">{loadingAI ? 'Analizando...' : 'Auditor IA'}</p><p className="text-[9px] text-slate-400 font-bold uppercase">Optimizar Ahorro</p></div>
             </div>
          </button>
        </div>

        <div className="lg:col-span-8 space-y-3">
           <section className="bg-white p-5 rounded-[1.5rem] shadow-sm border border-slate-200">
             <div className="h-48 w-full">
               <ResponsiveContainer width="100%" height="100%">
                 <BarChart data={chartData}>
                   <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                   <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 700}} />
                   <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                   <Bar dataKey="gasto" radius={[4, 4, 0, 0]} barSize={14}>
                     {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.isLocked ? (entry.gasto > entry.meta ? '#f43f5e' : '#6366f1') : '#f1f5f9'} />)}
                   </Bar>
                   <ReferenceLine y={initialDailyBudget} stroke="#cbd5e1" strokeDasharray="6 6" />
                 </BarChart>
               </ResponsiveContainer>
             </div>
           </section>

           <div className="space-y-2">
             {rebalancedRecords.map((record) => {
               const isExpanded = expandedDay === record.day;
               const dayTotal = record.expenses.reduce((s, e) => s + e.amount, 0);
               return (
                 <div key={record.day} className={`bg-white rounded-2xl border transition-all ${isExpanded ? 'border-indigo-500 shadow-lg' : 'border-slate-100'}`}>
                   <div onClick={() => setExpandedDay(isExpanded ? null : record.day)} className="p-4 flex items-center justify-between cursor-pointer">
                      <div className="flex items-center gap-4">
                         <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black text-xs ${record.isLocked ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-300'}`}>
                            {record.day}
                         </div>
                         <div>
                            <p className="text-xs font-black text-slate-800">Día {record.day}</p>
                            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight">Meta: ${record.adjustedBudget.toFixed(2)}</p>
                         </div>
                      </div>
                      <p className={`text-lg font-black ${dayTotal > record.adjustedBudget ? 'text-rose-500' : 'text-slate-800'}`}>${dayTotal.toFixed(2)}</p>
                   </div>
                   {isExpanded && (
                     <div className="p-4 pt-0 space-y-3 border-t border-slate-50 mt-1">
                        <div className="space-y-2 mt-3">
                          {record.expenses.map(exp => (
                            <div key={exp.id} className="flex gap-2 animate-in fade-in slide-in-from-left-1">
                               <input type="text" value={exp.label} onChange={(e) => {
                                 const newRecords = records.map(r => r.day === record.day ? {...r, isLocked: true, expenses: r.expenses.map(x => x.id === exp.id ? {...x, label: e.target.value} : x)} : r);
                                 setRecords(newRecords);
                               }} className="flex-grow bg-slate-50 px-3 py-2.5 rounded-lg text-xs font-bold outline-none focus:ring-1 focus:ring-indigo-100" placeholder="Descripción" />
                               <input type="number" value={exp.amount || ''} onChange={(e) => {
                                 const newRecords = records.map(r => r.day === record.day ? {...r, isLocked: true, expenses: r.expenses.map(x => x.id === exp.id ? {...x, amount: parseFloat(e.target.value) || 0} : x)} : r);
                                 setRecords(newRecords);
                               }} className="w-20 bg-slate-50 px-3 py-2.5 rounded-lg text-xs font-black text-right" placeholder="0" />
                               <button onClick={(e) => { e.stopPropagation(); removeExpense(record.day, exp.id); }} className="p-2 text-rose-300 hover:text-rose-500 transition-colors">
                                 <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                               </button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                           <button onClick={() => addNewExpenseField(record.day)} className="flex-grow bg-slate-900 text-white py-3 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-sm">Agregar Gasto</button>
                           <button onClick={() => handleCaptureClick(record.day)} className="bg-indigo-600 text-white px-5 py-3 rounded-xl shadow-md">
                              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
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
