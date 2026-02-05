
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

const App: React.FC = () => {
  const [initialDailyBudget, setInitialDailyBudget] = useState<number>(() => {
    const saved = localStorage.getItem(BUDGET_STORAGE_KEY);
    return saved ? parseFloat(saved) : 50;
  });
  
  const [apiKey, setApiKey] = useState<string>(() => {
    return localStorage.getItem(API_KEY_STORAGE_KEY) || (typeof process !== 'undefined' && process.env.API_KEY ? process.env.API_KEY : '') || '';
  });

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

  useEffect(() => {
    const savedData = localStorage.getItem(currentMonthKey);
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
    
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        if (parsed.length === daysInMonth) {
          setRecords(parsed);
        } else {
          setRecords(createNewMonth(daysInMonth));
        }
      } catch (e) {
        setRecords(createNewMonth(daysInMonth));
      }
    } else {
      setRecords(createNewMonth(daysInMonth));
    }
    setAiAnalysis(null);
  }, [selectedMonth, selectedYear, currentMonthKey]);

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
    }
  }, [rebalancedRecords, currentMonthKey]);

  useEffect(() => {
    localStorage.setItem(BUDGET_STORAGE_KEY, initialDailyBudget.toString());
  }, [initialDailyBudget]);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(API_KEY_STORAGE_KEY, key);
  };

  const exportToMarkdown = () => {
    const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long', year: 'numeric' }).format(new Date(selectedYear, selectedMonth));
    let md = `# Reporte de Gastos (GAS) - ${monthName}\n\n`;
    md += `**Presupuesto Base:** $${initialDailyBudget.toFixed(2)}/día\n`;
    md += `**Total Gastado:** $${summary.totalSpent.toFixed(2)}\n`;
    md += `**Balance:** $${summary.totalBalance.toFixed(2)}\n\n`;
    md += `| Día | Descripción | Monto |\n| :--- | :--- | :--- |\n`;
    
    rebalancedRecords.forEach(r => {
      r.expenses.forEach(e => {
        md += `| ${r.day} | ${e.label || 'Gasto General'} | $${e.amount.toFixed(2)} |\n`;
      });
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `reporte_gastos_${selectedYear}_${selectedMonth + 1}.md`;
    link.click();
  };

  const exportToCSV = () => {
    let csv = "Dia,Descripcion,Monto\n";
    rebalancedRecords.forEach(r => {
      r.expenses.forEach(e => {
        csv += `${r.day},"${(e.label || 'Gasto').replace(/"/g, '""')}",${e.amount}\n`;
      });
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `datos_gastos_${selectedYear}_${selectedMonth + 1}.csv`;
    link.click();
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
    if (!apiKey) {
      setShowSettings(true);
      alert("Por favor, configura tu API Key de Gemini en los ajustes para usar el escáner.");
      return;
    }
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
          addNewExpenseField(scanningDay, amount, 'Escaneo Gasto');
        }
      } catch (err) {
        console.error("Error al procesar el ticket", err);
      } finally {
        setLoadingAI(false);
        setScanningDay(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      }
    };
    reader.readAsDataURL(file);
  };

  const summary = useMemo<MonthlySummary>(() => {
    const totalSpent = rebalancedRecords.reduce((acc, r) => acc + r.expenses.reduce((s, e) => s + e.amount, 0), 0);
    const lockedDays = rebalancedRecords.filter(r => r.isLocked);
    const daysInMonth = rebalancedRecords.length;
    const totalBudget = initialDailyBudget * daysInMonth;
    const remainingBudget = totalBudget - totalSpent;
    const remainingDaysCount = daysInMonth - lockedDays.length;
    
    return {
      totalBudget,
      totalSpent,
      totalBalance: totalBudget - totalSpent,
      projectedSpending: lockedDays.length > 0 ? (totalSpent / lockedDays.length) * daysInMonth : 0,
      isOverBudget: totalSpent > totalBudget,
      currentDailyAllowance: remainingDaysCount > 0 ? remainingBudget / remainingDaysCount : 0
    };
  }, [rebalancedRecords, initialDailyBudget]);

  const chartData = useMemo(() => {
    return rebalancedRecords.map(r => ({
      name: `D${r.day}`,
      gasto: r.expenses.reduce((s, e) => s + e.amount, 0),
      meta: r.adjustedBudget,
      isLocked: r.isLocked
    }));
  }, [rebalancedRecords]);

  const runAIAnalysis = async () => {
    if (!apiKey) {
      setShowSettings(true);
      alert("Configura tu API Key para usar el análisis de IA.");
      return;
    }
    setLoadingAI(true);
    try {
      const monthName = new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(selectedYear, selectedMonth));
      const result = await analyzeExpenses(apiKey, rebalancedRecords.filter(r => r.isLocked), initialDailyBudget, monthName);
      setAiAnalysis(result);
    } catch (error) {
      console.error("AI Analysis failed", error);
    } finally {
      setLoadingAI(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-12">
      <input type="file" accept="image/*" capture="environment" ref={fileInputRef} onChange={onFileChange} className="hidden" />

      {/* Modal de Ajustes */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-xl font-bold text-slate-800">Ajustes de IA</h3>
              <button onClick={() => setShowSettings(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Gemini API Key</label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => saveApiKey(e.target.value)}
                  placeholder="Pega tu clave aquí..."
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                />
                <p className="mt-2 text-xs text-slate-400 leading-relaxed">
                  Consigue una clave gratuita en <a href="https://aistudio.google.com/" target="_blank" rel="noopener" className="text-indigo-500 underline">Google AI Studio</a>. 
                  Esta clave se guarda localmente o se lee desde el entorno para mayor seguridad.
                </p>
              </div>
              <button 
                onClick={() => setShowSettings(false)}
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 transition-all"
              >
                Guardar y Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-indigo-600 p-2 rounded-lg shadow-sm">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <h1 className="text-xl font-bold text-slate-800 hidden sm:block">GAS Control <span className="text-indigo-600">Pro</span></h1>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-slate-100 rounded-lg p-1 mr-2 hidden md:flex">
              <button 
                onClick={exportToMarkdown}
                className="p-1.5 hover:bg-white rounded-md text-slate-500 transition-all"
                title="Exportar Markdown"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </button>
              <button 
                onClick={exportToCSV}
                className="p-1.5 hover:bg-white rounded-md text-slate-500 transition-all"
                title="Descargar CSV (Google Sheets)"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              </button>
            </div>

            <button 
              onClick={() => setShowSettings(true)}
              className={`p-2 rounded-lg transition-colors ${!apiKey ? 'text-amber-500 bg-amber-50 animate-pulse' : 'text-slate-400 hover:bg-slate-100'}`}
              title="Ajustes de API"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="bg-slate-100 border-none rounded-lg px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-indigo-500 transition-all"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>{new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2024, i))}</option>
              ))}
            </select>
            <button 
              onClick={runAIAnalysis}
              disabled={loadingAI}
              className="bg-slate-900 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition-all flex items-center gap-2 disabled:opacity-50 shadow-sm"
            >
              {loadingAI ? (
                <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div>
              ) : (
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              )}
              <span className="hidden sm:inline">{loadingAI ? 'Analizando...' : 'Análisis IA'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest mb-4">Meta Base Diaria</h2>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input 
                type="number" 
                value={initialDailyBudget}
                onChange={(e) => setInitialDailyBudget(parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>
          </section>

          <section className="bg-slate-900 p-6 rounded-2xl shadow-lg text-white">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6">Equilibrio Dinámico</h2>
            <div className="space-y-6">
              <div>
                <p className="text-xs text-slate-400 mb-1">Nueva Cuota Diaria (Restante)</p>
                <p className={`text-4xl font-black ${summary.currentDailyAllowance < initialDailyBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ${summary.currentDailyAllowance.toFixed(2)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-slate-800">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Gastado</p>
                  <p className="text-xl font-bold">${summary.totalSpent.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold">Mes Total</p>
                  <p className="text-xl font-bold text-slate-400">${summary.totalBudget.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </section>

          {aiAnalysis && (
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 animate-in fade-in slide-in-from-bottom-2 duration-500">
              <h2 className="text-indigo-600 text-sm font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                <span className="w-2 h-2 bg-indigo-600 rounded-full animate-pulse"></span>
                Insight de la IA
              </h2>
              <p className="text-sm text-slate-600 leading-relaxed italic mb-4 border-l-4 border-indigo-100 pl-4">
                "{aiAnalysis.insight}"
              </p>
              <div className="space-y-3">
                {aiAnalysis.recommendations.map((rec, i) => (
                  <div key={i} className="flex gap-2 text-xs text-slate-500">
                    <span className="text-indigo-400 font-bold">•</span>
                    {rec}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <div className="lg:col-span-8 space-y-8">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-bold text-slate-800 mb-6 flex justify-between items-center">Tendencia Mensual</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}}
                    formatter={(value: any, name: any) => [`$${Number(value).toFixed(2)}`, name === 'meta' ? 'Meta Ajustada' : 'Gasto Real']}
                  />
                  <Bar dataKey="gasto" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isLocked ? (entry.gasto > entry.meta ? '#f43f5e' : '#6366f1') : '#e2e8f0'} />
                    ))}
                  </Bar>
                  <ReferenceLine y={initialDailyBudget} stroke="#94a3b8" strokeDasharray="5 5" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-bold text-slate-800 px-2 flex justify-between items-center">Desglose Diario</h2>
            <div className="space-y-3">
              {rebalancedRecords.map((record) => {
                const isExpanded = expandedDay === record.day;
                const dayTotal = record.expenses.reduce((s, e) => s + e.amount, 0);
                const isOver = record.isLocked && dayTotal > record.adjustedBudget;

                return (
                  <div key={record.day} className={`bg-white rounded-2xl border transition-all duration-300 overflow-hidden ${isExpanded ? 'border-indigo-500 shadow-md ring-1 ring-indigo-500/20' : 'border-slate-200'}`}>
                    <div onClick={() => setExpandedDay(isExpanded ? null : record.day)} className="p-4 flex items-center justify-between cursor-pointer hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold transition-colors ${record.isLocked ? (isOver ? 'bg-rose-50 text-rose-600' : 'bg-indigo-50 text-indigo-600') : 'bg-slate-100 text-slate-400'}`}>
                          {record.day}
                        </div>
                        <div>
                          <p className="text-sm font-bold text-slate-700">Día {record.day}</p>
                          <p className={`text-[10px] font-bold uppercase ${record.adjustedBudget < initialDailyBudget ? 'text-rose-400' : 'text-slate-400'}`}>
                            Meta: ${record.adjustedBudget.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <p className={`text-lg font-black tracking-tight ${isOver ? 'text-rose-500' : (record.isLocked ? 'text-indigo-600' : 'text-slate-300')}`}>
                          ${dayTotal.toFixed(2)}
                        </p>
                        <svg className={`w-5 h-5 text-slate-300 transition-transform duration-300 ${isExpanded ? 'rotate-180 text-indigo-500' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-4 animate-in slide-in-from-top-1 duration-200">
                        <div className="space-y-2">
                          {record.expenses.map((expense) => (
                            <div key={expense.id} className="flex gap-2 items-center animate-in fade-in duration-300">
                              <input type="text" placeholder="Concepto de Gasto" value={expense.label || ''} onChange={(e) => handleExpenseChange(record.day, expense.id, 'label', e.target.value)} className="flex-grow px-3 py-2 bg-white border border-slate-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
                              <div className="relative w-28">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 text-xs font-bold">$</span>
                                <input type="number" placeholder="0.00" value={expense.amount || ''} onChange={(e) => handleExpenseChange(record.day, expense.id, 'amount', e.target.value)} className="w-full pl-6 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold text-slate-700 focus:ring-2 focus:ring-indigo-500 outline-none" />
                              </div>
                              <button onClick={() => removeExpense(record.day, expense.id)} className="p-2 text-rose-300 hover:text-rose-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => addNewExpenseField(record.day)} className="flex-grow bg-white border border-slate-200 text-slate-700 py-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 hover:bg-slate-50 shadow-sm">
                            <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            Agregar Gasto
                          </button>
                          <button onClick={() => handleCaptureClick(record.day)} disabled={loadingAI} className="bg-slate-900 text-white p-3 rounded-xl hover:bg-slate-800 disabled:opacity-50" title="Escanear Recibo"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg></button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
};

export default App;
