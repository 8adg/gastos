
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Expense, Category, SpendingAnalysis } from './types';
import { analyzeSpending, scanReceipt } from './services/geminiService';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, PieChart, Pie, Cell
} from 'recharts';

const STORAGE_KEY = 'daily_expenses_v2';
const CATEGORIES: Category[] = ['Alimentación', 'Transporte', 'Ocio', 'Facturas', 'Salud', 'Hogar', 'Otros'];
const COLORS = ['#6366f1', '#f59e0b', '#ec4899', '#10b981', '#ef4444', '#8b5cf6', '#64748b'];

const App: React.FC = () => {
  const [expenses, setExpenses] = useState<Expense[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });

  const [formData, setFormData] = useState({
    title: '',
    amount: '',
    category: 'Alimentación' as Category,
    date: new Date().toISOString().split('T')[0]
  });

  const [analysis, setAnalysis] = useState<SpendingAnalysis | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
  }, [expenses]);

  const stats = useMemo(() => {
    const total = expenses.reduce((sum, e) => sum + e.amount, 0);
    const byCategory = CATEGORIES.map((cat, i) => ({
      name: cat,
      value: expenses.filter(e => e.category === cat).reduce((sum, e) => sum + e.amount, 0),
      color: COLORS[i]
    })).filter(c => c.value > 0);
    
    return { total, byCategory };
  }, [expenses]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const amount = parseFloat(formData.amount);
    if (isNaN(amount) || !formData.title) return;

    const newExpense: Expense = {
      id: crypto.randomUUID(),
      title: formData.title,
      amount,
      category: formData.category,
      date: formData.date
    };

    setExpenses(prev => [newExpense, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setFormData({ ...formData, title: '', amount: '' });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      try {
        const data = await scanReceipt(base64);
        if (data.total) {
          const newExpense: Expense = {
            id: crypto.randomUUID(),
            title: data.merchant || 'Gasto Escaneado',
            amount: data.total,
            category: data.category || 'Otros',
            date: data.date || new Date().toISOString().split('T')[0]
          };
          setExpenses(prev => [newExpense, ...prev]);
        }
      } catch (err) {
        alert("Error al escanear el ticket");
      } finally {
        setIsBusy(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const runAnalysis = async () => {
    if (expenses.length < 3) return;
    setIsBusy(true);
    const res = await analyzeSpending(expenses);
    setAnalysis(res);
    setIsBusy(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-24 font-sans">
      <nav className="bg-white/80 backdrop-blur-md border-b sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-2xl flex items-center justify-center text-white shadow-lg shadow-indigo-100">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <h1 className="text-xl font-black tracking-tight text-slate-800">Gastos<span className="text-indigo-600">Pro</span></h1>
          </div>
          <div className="flex gap-2">
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isBusy}
              className="bg-slate-100 text-slate-600 p-2.5 rounded-xl hover:bg-slate-200 transition-all active:scale-95"
              title="Escanear Ticket"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>
            </button>
            <button 
              onClick={runAnalysis}
              disabled={isBusy || expenses.length < 3}
              className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-lg shadow-indigo-200 hover:bg-indigo-700 disabled:opacity-50"
            >
              IA Report
            </button>
          </div>
        </div>
      </nav>

      <input type="file" ref={fileInputRef} onChange={handleFileUpload} accept="image/*" className="hidden" />

      <main className="max-w-5xl mx-auto px-6 pt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Columna Izquierda: Entrada y Stats */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Nuevo Gasto</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Concepto</label>
                <input type="text" placeholder="Cena, Supermercado..." value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-slate-700 placeholder:text-slate-300" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Monto</label>
                  <input type="number" step="0.01" placeholder="0.00" value={formData.amount} onChange={e => setFormData({...formData, amount: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-800" required />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Fecha</label>
                  <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-slate-600 text-xs" required />
                </div>
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase ml-1">Categoría</label>
                <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as Category})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 focus:ring-2 focus:ring-indigo-500 outline-none font-bold text-slate-600 appearance-none">
                  {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-slate-800 transition-all active:scale-[0.97]">
                Añadir Gasto
              </button>
            </form>
          </section>

          <section className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col items-center">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4 w-full">Distribución</h2>
            <div className="h-48 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={stats.byCategory} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                    {stats.byCategory.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                  </Pie>
                  <Tooltip contentStyle={{borderRadius: '16px', border: 'none', fontWeight: 'bold'}} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-center mt-2">
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Gasto Total del Mes</p>
              <p className="text-4xl font-black text-slate-800 tracking-tighter">${stats.total.toLocaleString()}</p>
            </div>
          </section>
        </div>

        {/* Columna Derecha: Dashboards e Historial */}
        <div className="lg:col-span-8 space-y-6">
          
          {isBusy && (
            <div className="bg-indigo-600 p-4 rounded-3xl text-white flex items-center justify-center gap-3 animate-pulse">
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
              <span className="font-bold text-sm tracking-wide">IA Procesando información...</span>
            </div>
          )}

          {analysis && (
            <section className="bg-white p-8 rounded-[2.5rem] border-2 border-indigo-50 shadow-sm animate-in slide-in-from-top-4 duration-500">
              <div className="flex justify-between items-start mb-6">
                <div className="flex items-center gap-3">
                  <div className={`px-3 py-1 rounded-full text-[10px] font-black uppercase ${
                    analysis.balanceStatus === 'Excelente' ? 'bg-emerald-100 text-emerald-600' :
                    analysis.balanceStatus === 'Estable' ? 'bg-indigo-100 text-indigo-600' : 'bg-rose-100 text-rose-600'
                  }`}>
                    Status: {analysis.balanceStatus}
                  </div>
                </div>
                <button onClick={() => setAnalysis(null)} className="text-slate-300 hover:text-slate-500"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg></button>
              </div>
              <p className="text-slate-700 font-medium leading-relaxed mb-6 italic">"{analysis.summary}"</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Consejos de Ahorro</h4>
                  {analysis.savingTips.map((tip, i) => (
                    <div key={i} className="bg-slate-50 p-3 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></div> {tip}
                    </div>
                  ))}
                </div>
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Alertas</h4>
                  {analysis.warnings.length > 0 ? analysis.warnings.map((w, i) => (
                    <div key={i} className="bg-rose-50 p-3 rounded-xl text-xs font-bold text-rose-600 flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-rose-400 rounded-full"></div> {w}
                    </div>
                  )) : <p className="text-xs text-slate-400 font-medium italic">Sin alertas relevantes.</p>}
                </div>
              </div>
            </section>
          )}

          <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Flujo de Gastos Diarios</h2>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...expenses].reverse()}>
                  <defs>
                    <linearGradient id="flowGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="6 6" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)'}}
                    formatter={(val: any) => [`$${val}`, 'Gasto']}
                  />
                  <Area type="monotone" dataKey="amount" stroke="#6366f1" strokeWidth={4} fill="url(#flowGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex justify-between items-center">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Movimientos Recientes</h2>
              <span className="text-[10px] font-bold text-slate-300 uppercase">{expenses.length} entradas</span>
            </div>
            <div className="max-h-[400px] overflow-y-auto">
              {expenses.map((expense) => (
                <div key={expense.id} className="p-6 flex items-center justify-between border-b border-slate-50 hover:bg-slate-50/50 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xs font-black ${
                      expense.category === 'Alimentación' ? 'bg-orange-100 text-orange-600' :
                      expense.category === 'Ocio' ? 'bg-pink-100 text-pink-600' :
                      expense.category === 'Transporte' ? 'bg-blue-100 text-blue-600' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {expense.category[0]}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-800 tracking-tight">{expense.title}</p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase">{new Date(expense.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'long' })} • {expense.category}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="text-lg font-black text-slate-800 tracking-tighter">-${expense.amount.toFixed(2)}</p>
                    <button 
                      onClick={() => setExpenses(prev => prev.filter(e => e.id !== expense.id))}
                      className="text-slate-200 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                  </div>
                </div>
              ))}
              {expenses.length === 0 && (
                <div className="py-16 text-center text-slate-300 italic text-sm">Empieza registrando tus gastos diarios</div>
              )}
            </div>
          </section>

        </div>
      </main>
      
      <footer className="max-w-5xl mx-auto px-6 py-12 text-center">
        <div className="inline-flex items-center gap-2 bg-white px-5 py-2.5 rounded-full shadow-sm border border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <span className="w-2 h-2 bg-indigo-500 rounded-full"></span>
          Control de Gastos Corrientes • 100% Local
        </div>
      </footer>
    </div>
  );
};

export default App;
