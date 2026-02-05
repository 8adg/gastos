import React, { useState, useEffect, useMemo } from 'react';
import { FuelEntry, FuelStats, AIInsight } from './types';
import { analyzeFuelConsumption } from './services/geminiService';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell
} from 'recharts';

const STORAGE_KEY = 'gas_control_pro_v1';

const App: React.FC = () => {
  const [entries, setEntries] = useState<FuelEntry[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split('T')[0],
    odometer: '',
    liters: '',
    pricePerLiter: '',
  });

  const [aiInsight, setAiInsight] = useState<AIInsight | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  }, [entries]);

  const stats = useMemo<FuelStats>(() => {
    if (entries.length === 0) return { totalSpent: 0, totalLiters: 0, avgConsumption: 0, avgPrice: 0, totalKm: 0 };
    
    const sorted = [...entries].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const totalSpent = entries.reduce((acc, e) => acc + e.totalCost, 0);
    const totalLiters = entries.reduce((acc, e) => acc + e.liters, 0);
    const avgPrice = totalSpent / totalLiters;
    
    let totalKm = 0;
    let avgConsumption = 0;
    
    if (sorted.length > 1) {
      totalKm = sorted[sorted.length - 1].odometer - sorted[0].odometer;
      avgConsumption = totalKm > 0 ? (totalLiters / totalKm) * 100 : 0;
    }

    return { totalSpent, totalLiters, avgConsumption, avgPrice, totalKm };
  }, [entries]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const liters = parseFloat(formData.liters);
    const price = parseFloat(formData.pricePerLiter);
    const odometer = parseFloat(formData.odometer);
    
    if (isNaN(liters) || isNaN(price) || isNaN(odometer)) return;

    const newEntry: FuelEntry = {
      id: crypto.randomUUID(),
      date: formData.date,
      odometer: odometer,
      liters: liters,
      pricePerLiter: price,
      totalCost: liters * price,
      fullTank: true
    };

    setEntries(prev => [newEntry, ...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setFormData({ ...formData, odometer: '', liters: '', pricePerLiter: '' });
  };

  const handleAIAnalysis = async () => {
    if (entries.length < 2) {
      alert("Se requieren al menos 2 registros para un análisis inteligente.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const result = await analyzeFuelConsumption(entries);
      setAiInsight(result);
    } catch (err) {
      console.error(err);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const deleteEntry = (id: string) => {
    if (window.confirm("¿Eliminar este registro?")) {
      setEntries(prev => prev.filter(e => e.id !== id));
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 pb-20">
      {/* Navbar Minimalista */}
      <nav className="bg-white/70 backdrop-blur-md border-b sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-slate-800">GasControl <span className="text-indigo-600">Pro</span></h1>
          </div>
          <button 
            onClick={handleAIAnalysis}
            disabled={isAnalyzing || entries.length < 2}
            className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-indigo-600 transition-all active:scale-95 disabled:opacity-30 disabled:pointer-events-none shadow-lg shadow-slate-200"
          >
            {isAnalyzing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2L4.5 20.29l.71.71L12 18l6.79 3 .71-.71L12 2z" /></svg>}
            {isAnalyzing ? 'Analizando...' : 'Análisis IA'}
          </button>
        </div>
      </nav>

      <main className="max-w-5xl mx-auto px-6 pt-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Panel Lateral: Formulario y Estadísticas */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-100">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">Nueva Carga</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">Fecha</label>
                <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-slate-700" required />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-500 ml-1">Km actuales (ODO)</label>
                <input type="number" placeholder="Ej: 45000" value={formData.odometer} onChange={e => setFormData({...formData, odometer: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-slate-700" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1">Litros</label>
                  <input type="number" step="0.01" placeholder="0.00" value={formData.liters} onChange={e => setFormData({...formData, liters: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-slate-700" required />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-500 ml-1">Precio/L</label>
                  <input type="number" step="0.001" placeholder="0.000" value={formData.pricePerLiter} onChange={e => setFormData({...formData, pricePerLiter: e.target.value})} className="w-full bg-slate-50 border-none rounded-2xl px-4 py-3.5 focus:ring-2 focus:ring-indigo-500 outline-none font-semibold text-slate-700" required />
                </div>
              </div>
              <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all active:scale-[0.97] mt-2">
                Registrar Carga
              </button>
            </form>
          </section>

          <section className="bg-slate-900 p-6 rounded-[2.5rem] shadow-2xl text-white overflow-hidden relative">
            <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-3xl -mr-10 -mt-10"></div>
            <h2 className="text-xs font-black text-indigo-400 uppercase tracking-widest mb-6 relative z-10">Resumen General</h2>
            <div className="space-y-6 relative z-10">
              <div>
                <p className="text-slate-400 text-[10px] font-bold uppercase mb-1">Gasto Total</p>
                <p className="text-4xl font-black tracking-tighter">${stats.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-6 border-t border-slate-800">
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Eficiencia</p>
                  <p className="text-xl font-black">{stats.avgConsumption.toFixed(1)} <span className="text-[10px] text-indigo-400">L/100</span></p>
                </div>
                <div>
                  <p className="text-[10px] text-slate-500 uppercase font-black mb-1">Precio Prom.</p>
                  <p className="text-xl font-black">${stats.avgPrice.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Panel Principal: Insights e Historial */}
        <div className="lg:col-span-8 space-y-8">
          
          {aiInsight && (
            <section className="bg-white p-8 rounded-[2rem] border-2 border-indigo-50 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-start gap-5">
                <div className="bg-indigo-50 p-4 rounded-[1.5rem] text-indigo-600 shadow-inner">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                </div>
                <div className="flex-grow">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-black text-slate-800 tracking-tight">Análisis de Inteligencia Artificial</h3>
                    <button onClick={() => setAiInsight(null)} className="text-slate-300 hover:text-slate-500 transition-colors">
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" /></svg>
                    </button>
                  </div>
                  <p className="text-slate-600 text-sm leading-relaxed mb-6 font-medium italic">"{aiInsight.analysis}"</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    {aiInsight.tips.map((tip, i) => (
                      <div key={i} className="bg-slate-50 p-4 rounded-2xl flex items-center gap-3 text-[11px] text-slate-500 font-bold leading-tight">
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full flex-shrink-0"></div>
                        {tip}
                      </div>
                    ))}
                  </div>
                  <div className="bg-indigo-600/5 p-4 rounded-2xl border border-indigo-100/50">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5">Fórmula Google Calc Proyectada</p>
                    <code className="text-xs text-indigo-600 font-mono font-black break-all">{aiInsight.sheetsFormula}</code>
                  </div>
                </div>
              </div>
            </section>
          )}

          <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-100">
            <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-8">Tendencia de Precios</h2>
            <div className="h-[280px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...entries].reverse()}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide domain={['auto', 'auto']} />
                  <Tooltip 
                    contentStyle={{borderRadius: '20px', border: 'none', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1)', fontWeight: 'bold'}}
                    labelStyle={{color: '#94a3b8'}}
                    formatter={(val: any) => [`$${val}`, 'Precio/L']}
                  />
                  <Area type="monotone" dataKey="pricePerLiter" stroke="#6366f1" strokeWidth={4} fill="url(#priceGrad)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-white rounded-[2.5rem] shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-8 border-b border-slate-50 flex items-center justify-between">
              <h2 className="text-xs font-black text-slate-400 uppercase tracking-widest">Historial Reciente</h2>
              <span className="text-[10px] font-bold text-slate-300 uppercase">{entries.length} registros</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-8 py-4">Fecha</th>
                    <th className="px-8 py-4">KM ODO</th>
                    <th className="px-8 py-4">Litros</th>
                    <th className="px-8 py-4">Costo</th>
                    <th className="px-8 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-8 py-5 text-xs font-bold text-slate-500">{new Date(entry.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</td>
                      <td className="px-8 py-5 text-sm font-black text-slate-800">{entry.odometer.toLocaleString()} <span className="text-[10px] text-slate-400 font-bold ml-1">km</span></td>
                      <td className="px-8 py-5 text-sm font-bold text-slate-700">{entry.liters.toFixed(2)} L</td>
                      <td className="px-8 py-5 text-sm font-black text-indigo-600">${entry.totalCost.toFixed(2)}</td>
                      <td className="px-8 py-5 text-right">
                        <button onClick={() => deleteEntry(entry.id)} className="text-slate-200 hover:text-rose-500 transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-8 py-16 text-center text-slate-300 text-sm font-medium italic">Empieza registrando tu primera carga de gasolina</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </main>
      
      <footer className="max-w-5xl mx-auto px-6 py-12 text-center">
        <div className="inline-flex items-center gap-2 bg-white px-4 py-2 rounded-full shadow-sm border border-slate-100 text-[10px] font-black text-slate-400 uppercase tracking-widest">
          <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span>
          Sistema Local • Privacidad Garantizada
        </div>
      </footer>
    </div>
  );
};

export default App;
