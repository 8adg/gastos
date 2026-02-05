
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
  const importInputRef = useRef<HTMLInputElement>(null);
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

  // FUNCIONES DE IMPORTACIÓN (PARA USAR MD/CSV COMO BASE DE DATOS)
  const handleImportDatabase = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
      let newRecords: DailyRecord[] = createNewMonth(daysInMonth);

      if (file.name.endsWith('.csv')) {
        // Parse CSV simple: Dia,Descripcion,Monto
        const lines = content.split('\n').slice(1);
        lines.forEach(line => {
          const [diaStr, label, montoStr] = line.split(',');
          const dia = parseInt(diaStr);
          const monto = parseFloat(montoStr);
          if (dia > 0 && dia <= daysInMonth && !isNaN(monto)) {
            const index = dia - 1;
            newRecords[index].expenses.push({ id: Math.random().toString(36).substr(2, 9), amount: monto, label: label.replace(/"/g, '') });
            newRecords[index].isLocked = true;
          }
        });
      } else if (file.name.endsWith('.md')) {
        // Parse Markdown simple: | Dia | Descripcion | Monto |
        const rows = content.split('\n').filter(l => l.includes('|') && !l.includes(':---') && !l.includes('Día |'));
        rows.forEach(row => {
          const cells = row.split('|').map(c => c.trim()).filter(Boolean);
          if (cells.length >= 3) {
            const dia = parseInt(cells[0]);
            const label = cells[1];
            const monto = parseFloat(cells[2].replace('$', ''));
            if (dia > 0 && dia <= daysInMonth && !isNaN(monto)) {
              const index = dia - 1;
              newRecords[index].expenses.push({ id: Math.random().toString(36).substr(2, 9), amount: monto, label });
              newRecords[index].isLocked = true;
            }
          }
        });
      }

      setRecords(newRecords);
      alert("Base de datos importada correctamente.");
    };
    reader.readAsText(file);
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
    link.download = `database_gas_${selectedYear}_${selectedMonth + 1}.md`;
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
    link.download = `database_gas_${selectedYear}_${selectedMonth + 1}.csv`;
    link.click();
  };

  const copyForSheets = () => {
    let text = "Dia\tDescripcion\tMonto\n";
    rebalancedRecords.forEach(r => {
      r.expenses.forEach(e => {
        text += `${r.day}\t${e.label || 'Gasto'}\t${e.amount}\n`;
      });
    });
    navigator.clipboard.writeText(text);
    alert("Datos copiados al portapapeles. ¡Pégalos en tu Google Calc!");
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
      alert("Por favor, configura tu API Key de Gemini.");
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
      alert("Configura tu API Key.");
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
      <input type="file" accept=".md,.csv" ref={importInputRef} onChange={handleImportDatabase} className="hidden" />

      {/* Modal de Ajustes */}
      {showSettings && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6 shadow-2xl">
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
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl font-mono text-sm"
                />
              </div>
              <button onClick={() => setShowSettings(false)} className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold">Guardar</button>
            </div>
          </div>
        </div>
      )}

      <header className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-200">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-black text-slate-800 tracking-tight">GAS Control <span className="text-indigo-600">Pro</span></h1>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">Base de Datos Dinámica</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* PANEL DE GESTIÓN DE DATOS */}
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              <button 
                onClick={() => importInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-1.5 bg-white text-slate-700 rounded-lg text-xs font-bold shadow-sm hover:text-indigo-600 transition-all"
                title="Cargar base de datos existente (.md o .csv)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 16v1a2 2 0 002 2h12a2 2 0 002-2v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>
                Importar
              </button>
              <button 
                onClick={exportToMarkdown}
                className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-indigo-600 transition-all"
                title="Guardar base maestro (.md)"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" /></svg>
              </button>
              <button 
                onClick={copyForSheets}
                className="p-1.5 hover:bg-white rounded-lg text-slate-500 hover:text-emerald-600 transition-all"
                title="Copiar para Google Sheets"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" /></svg>
              </button>
            </div>

            <div className="h-8 w-[1px] bg-slate-200 mx-1 hidden sm:block"></div>

            <select 
              value={selectedMonth} 
              onChange={(e) => setSelectedMonth(parseInt(e.target.value))}
              className="bg-slate-50 border-none rounded-lg px-3 py-2 text-sm font-bold text-slate-600 focus:ring-2 focus:ring-indigo-500"
            >
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i} value={i}>{new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(new Date(2024, i))}</option>
              ))}
            </select>

            <button 
              onClick={runAIAnalysis}
              disabled={loadingAI}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-700 shadow-md shadow-indigo-100 disabled:opacity-50 flex items-center gap-2"
            >
              {loadingAI ? <div className="w-4 h-4 border-2 border-white/20 border-t-white rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
              <span className="hidden sm:inline">Análisis IA</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 mt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Columna Izquierda: Métricas y Settings */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4">Meta Base Diaria</h2>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
              <input 
                type="number" 
                value={initialDailyBudget}
                onChange={(e) => setInitialDailyBudget(parseFloat(e.target.value) || 0)}
                className="w-full pl-8 pr-4 py-4 bg-slate-50 border border-slate-200 rounded-xl font-bold text-slate-700 text-xl focus:ring-2 focus:ring-indigo-500 outline-none"
              />
            </div>
          </section>

          <section className="bg-slate-900 p-6 rounded-3xl shadow-xl text-white relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full -mr-16 -mt-16 blur-2xl"></div>
            <h2 className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-6">Equilibrio Dinámico</h2>
            <div className="space-y-6">
              <div>
                <p className="text-xs text-slate-400 mb-1">Cuota Diaria Restante</p>
                <p className={`text-5xl font-black ${summary.currentDailyAllowance < initialDailyBudget ? 'text-rose-400' : 'text-emerald-400'}`}>
                  ${summary.currentDailyAllowance.toFixed(2)}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-800">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Total Gastado</p>
                  <p className="text-2xl font-black">${summary.totalSpent.toFixed(2)}</p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-bold mb-1">Presupuesto Mes</p>
                  <p className="text-2xl font-black text-slate-400">${summary.totalBudget.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </section>

          {aiAnalysis && (
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-indigo-500 animate-in fade-in slide-in-from-left duration-500">
              <div className="flex items-center gap-2 mb-4">
                <div className="bg-indigo-50 p-2 rounded-lg"><svg className="w-5 h-5 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div>
                <h2 className="text-slate-800 text-sm font-black uppercase tracking-tight">Estrategia sugerida</h2>
              </div>
              <p className="text-sm text-slate-600 leading-relaxed mb-6 italic">"{aiAnalysis.insight}"</p>
              <div className="space-y-4">
                {aiAnalysis.recommendations.map((rec, i) => (
                  <div key={i} className="bg-slate-50 p-3 rounded-xl text-xs text-slate-500 border border-slate-100 flex gap-3">
                    <span className="text-indigo-400 font-black">#0{i+1}</span>
                    {rec}
                  </div>
                ))}
              </div>
              {aiAnalysis.googleSheetsFormulas.length > 0 && (
                <div className="mt-6 pt-6 border-t border-slate-100">
                   <p className="text-[10px] font-bold text-slate-400 uppercase mb-3">Fórmulas Google Sheets</p>
                   {aiAnalysis.googleSheetsFormulas.map((f, i) => (
                     <div key={i} className="mb-2">
                       <p className="text-[10px] text-slate-600 font-bold mb-1">{f.label}</p>
                       <code className="block bg-slate-900 text-emerald-400 p-2 rounded text-[10px] overflow-x-auto">{f.formula}</code>
                     </div>
                   ))}
                </div>
              )}
            </section>
          )}
        </div>

        {/* Columna Derecha: Gráficos y Lista */}
        <div className="lg:col-span-8 space-y-8">
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
            <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
               <div className="w-2 h-6 bg-indigo-600 rounded-full"></div>
               Tendencia de Consumo
            </h2>
            <div className="h-72 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 10}} />
                  <Tooltip 
                    cursor={{fill: '#f8fafc'}}
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 20px 25px -5px rgb(0 0 0 / 0.1)'}}
                  />
                  <Bar dataKey="gasto" radius={[6, 6, 0, 0]}>
                    {chartData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.isLocked ? (entry.gasto > entry.meta ? '#f43f5e' : '#6366f1') : '#f1f5f9'} />
                    ))}
                  </Bar>
                  <ReferenceLine y={initialDailyBudget} stroke="#cbd5e1" strokeDasharray="10 10" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="text-lg font-black text-slate-800 px-2">Bitácora de Gastos</h2>
            <div className="space-y-3">
              {rebalancedRecords.map((record) => {
                const isExpanded = expandedDay === record.day;
                const dayTotal = record.expenses.reduce((s, e) => s + e.amount, 0);
                const isOver = record.isLocked && dayTotal > record.adjustedBudget;

                return (
                  <div key={record.day} className={`bg-white rounded-2xl border transition-all duration-300 ${isExpanded ? 'border-indigo-500 shadow-xl scale-[1.01]' : 'border-slate-100'}`}>
                    <div onClick={() => setExpandedDay(isExpanded ? null : record.day)} className="p-4 flex items-center justify-between cursor-pointer group">
                      <div className="flex items-center gap-4">
                        <div className={`w-12 h-12 rounded-2xl flex flex-col items-center justify-center font-bold transition-all ${record.isLocked ? (isOver ? 'bg-rose-50 text-rose-600' : 'bg-indigo-600 text-white') : 'bg-slate-50 text-slate-300'}`}>
                          <span className="text-[10px] uppercase opacity-60">Día</span>
                          <span className="text-base leading-none">{record.day}</span>
                        </div>
                        <div>
                          <p className="text-sm font-black text-slate-800">Control Diario</p>
                          <p className={`text-[10px] font-black uppercase tracking-tighter ${record.adjustedBudget < initialDailyBudget ? 'text-rose-400' : 'text-slate-400'}`}>
                            Límite Dinámico: ${record.adjustedBudget.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className={`text-xl font-black ${isOver ? 'text-rose-500' : (record.isLocked ? 'text-indigo-600' : 'text-slate-300')}`}>
                            ${dayTotal.toFixed(2)}
                          </p>
                        </div>
                        <svg className={`w-5 h-5 text-slate-300 transition-transform ${isExpanded ? 'rotate-180 text-indigo-500' : 'group-hover:translate-y-1'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7" /></svg>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="p-4 pt-0 space-y-4 animate-in slide-in-from-top-2 duration-300">
                        <div className="h-[1px] bg-slate-100 w-full mb-4"></div>
                        <div className="space-y-3">
                          {record.expenses.map((expense) => (
                            <div key={expense.id} className="flex gap-2 items-center">
                              <input type="text" placeholder="¿Qué gastaste?" value={expense.label || ''} onChange={(e) => handleExpenseChange(record.day, expense.id, 'label', e.target.value)} className="flex-grow px-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold focus:ring-2 focus:ring-indigo-500 outline-none" />
                              <div className="relative w-32">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-bold">$</span>
                                <input type="number" placeholder="0.00" value={expense.amount || ''} onChange={(e) => handleExpenseChange(record.day, expense.id, 'amount', e.target.value)} className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl text-sm font-black text-slate-800 focus:ring-2 focus:ring-indigo-500 outline-none" />
                              </div>
                              <button onClick={() => removeExpense(record.day, expense.id)} className="p-3 text-rose-400 hover:bg-rose-50 rounded-xl transition-colors"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                            </div>
                          ))}
                        </div>
                        <div className="flex gap-3">
                          <button onClick={() => addNewExpenseField(record.day)} className="flex-grow bg-slate-900 text-white py-4 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-slate-800 transition-all active:scale-95 shadow-lg shadow-slate-200">
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" /></svg>
                            Añadir Concepto
                          </button>
                          <button onClick={() => handleCaptureClick(record.day)} disabled={loadingAI} className="bg-indigo-600 text-white p-4 rounded-2xl hover:bg-indigo-700 shadow-lg shadow-indigo-100 transition-all active:scale-95">
                             <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
                          </button>
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
