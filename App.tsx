
import React, { useState, useEffect, useMemo } from 'react';
import { FuelEntry, FuelStats, AIInsight } from './types';
import { analyzeFuelConsumption } from './services/geminiService';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area 
} from 'recharts';

const STORAGE_KEY = 'gas_control_data_v1';

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
    
    const totalSpent = entries.reduce((acc, e) => acc + e.totalCost, 0);
    const totalLiters = entries.reduce((acc, e) => acc + e.liters, 0);
    const avgPrice = totalSpent / totalLiters;
    
    let totalKm = 0;
    let avgConsumption = 0;
    
    if (entries.length > 1) {
      const sorted = [...entries].sort((a, b) => a.odometer - b.odometer);
      totalKm = sorted[sorted.length - 1].odometer - sorted[0].odometer;
      // Consumo aproximado L/100km
      avgConsumption = totalKm > 0 ? (totalLiters / totalKm) * 100 : 0;
    }

    return { totalSpent, totalLiters, avgConsumption, avgPrice, totalKm };
  }, [entries]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const liters = parseFloat(formData.liters);
    const price = parseFloat(formData.pricePerLiter);
    
    const newEntry: FuelEntry = {
      id: crypto.randomUUID(),
      date: formData.date,
      odometer: parseFloat(formData.odometer),
      liters: liters,
      pricePerLiter: price,
      totalCost: liters * price,
      fullTank: true
    };

    setEntries(prev => [...prev, newEntry].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setFormData({ ...formData, odometer: '', liters: '', pricePerLiter: '' });
  };

  const handleAIAnalysis = async () => {
    if (entries.length < 2) {
      alert("Necesitas al menos 2 registros para un análisis preciso.");
      return;
    }
    setIsAnalyzing(true);
    const result = await analyzeFuelConsumption(entries);
    setAiInsight(result);
    setIsAnalyzing(false);
  };

  const deleteEntry = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      <nav className="bg-white border-b sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
            </div>
            <span className="text-xl font-bold tracking-tight">GasControl <span className="text-indigo-600">Pro</span></span>
          </div>
          <button 
            onClick={handleAIAnalysis}
            disabled={isAnalyzing || entries.length < 2}
            className="bg-indigo-600 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-md hover:bg-indigo-700 transition-all active:scale-95 disabled:opacity-50 flex items-center gap-2"
          >
            {isAnalyzing ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div> : <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>}
            IA Insight
          </button>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto px-4 py-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Sidebar: Form & Stats */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Nuevo Registro</h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Fecha</label>
                <input type="date" value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none font-medium" required />
              </div>
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">Kilometraje (ODO)</label>
                <input type="number" placeholder="Ej: 125400" value={formData.odometer} onChange={e => setFormData({...formData, odometer: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none font-medium" required />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Litros</label>
                  <input type="number" step="0.01" placeholder="45.5" value={formData.liters} onChange={e => setFormData({...formData, liters: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none font-medium" required />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 mb-1 block">Precio/L</label>
                  <input type="number" step="0.001" placeholder="1.65" value={formData.pricePerLiter} onChange={e => setFormData({...formData, pricePerLiter: e.target.value})} className="w-full bg-slate-50 border-none rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none font-medium" required />
                </div>
              </div>
              <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-2xl font-bold shadow-xl hover:bg-slate-800 transition-all active:scale-[0.98]">
                Guardar Carga
              </button>
            </form>
          </section>

          <section className="bg-indigo-600 p-6 rounded-3xl shadow-xl text-white">
            <h2 className="text-xs font-black text-indigo-200 uppercase tracking-widest mb-6">Resumen Total</h2>
            <div className="space-y-6">
              <div>
                <p className="text-xs text-indigo-200 mb-1">Gasto Acumulado</p>
                <p className="text-3xl font-black">${stats.totalSpent.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-4 border-t border-indigo-500">
                <div>
                  <p className="text-[10px] text-indigo-300 uppercase font-bold">Consumo</p>
                  <p className="text-lg font-bold">{stats.avgConsumption.toFixed(1)} <span className="text-xs font-normal">L/100</span></p>
                </div>
                <div>
                  <p className="text-[10px] text-indigo-300 uppercase font-bold">Precio Medio</p>
                  <p className="text-lg font-bold">${stats.avgPrice.toFixed(2)}</p>
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Main Content: Charts & History */}
        <div className="lg:col-span-8 space-y-6">
          
          {aiInsight && (
            <section className="bg-white p-6 rounded-3xl border border-indigo-100 shadow-sm animate-in slide-in-from-top-4 duration-500">
              <div className="flex items-start gap-4">
                <div className="bg-indigo-50 p-3 rounded-2xl text-indigo-600">
                  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" /></svg>
                </div>
                <div className="flex-grow">
                  <h3 className="text-lg font-black text-slate-800 mb-2 tracking-tight">Análisis de Inteligencia Artificial</h3>
                  <p className="text-slate-600 text-sm leading-relaxed mb-4">{aiInsight.analysis}</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                    {aiInsight.tips.map((tip, i) => (
                      <div key={i} className="bg-slate-50 p-3 rounded-xl flex items-center gap-3 text-xs text-slate-500 font-medium">
                        <div className="w-1.5 h-1.5 bg-indigo-400 rounded-full"></div>
                        {tip}
                      </div>
                    ))}
                  </div>
                  <div className="bg-indigo-50/50 p-3 rounded-xl border border-indigo-100">
                    <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Fórmula Google Calc Sugerida</p>
                    <code className="text-xs text-indigo-600 font-mono font-bold break-all">{aiInsight.sheetsFormula}</code>
                  </div>
                </div>
                <button onClick={() => setAiInsight(null)} className="text-slate-300 hover:text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </section>
          )}

          <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Evolución de Precio y Gasto</h2>
            <div className="h-[300px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={[...entries].reverse()}>
                  <defs>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.1}/>
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                  <Tooltip 
                    contentStyle={{borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)'}}
                    formatter={(value: any) => [`$${value}`, '']}
                  />
                  <Area type="monotone" dataKey="totalCost" stroke="#6366f1" strokeWidth={3} fillOpacity={1} fill="url(#colorCost)" />
                  <Line type="monotone" dataKey="pricePerLiter" stroke="#fbbf24" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50">
              <h2 className="text-sm font-black text-slate-400 uppercase tracking-widest">Historial de Cargas</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 text-[10px] font-black text-slate-400 uppercase tracking-widest">
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Km Totales</th>
                    <th className="px-6 py-4">Litros</th>
                    <th className="px-6 py-4">Precio/L</th>
                    <th className="px-6 py-4">Costo Total</th>
                    <th className="px-6 py-4"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-slate-50 transition-colors group">
                      <td className="px-6 py-4 text-sm font-medium text-slate-600">{entry.date}</td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">{entry.odometer.toLocaleString()} <span className="text-[10px] text-slate-400 font-normal">km</span></td>
                      <td className="px-6 py-4 text-sm font-bold text-slate-800">{entry.liters} L</td>
                      <td className="px-6 py-4 text-sm font-medium text-slate-500">${entry.pricePerLiter.toFixed(3)}</td>
                      <td className="px-6 py-4 text-sm font-black text-indigo-600">${entry.totalCost.toFixed(2)}</td>
                      <td className="px-6 py-4 text-right">
                        <button onClick={() => deleteEntry(entry.id)} className="text-slate-300 hover:text-rose-500 transition-colors">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                  {entries.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-6 py-12 text-center text-slate-400 text-sm italic">No hay registros aún. Comienza añadiendo uno arriba.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

        </div>
      </main>
      
      <footer className="max-w-6xl mx-auto px-4 py-12 text-center">
        <p className="text-slate-400 text-xs font-medium uppercase tracking-widest">
          GasControl Pro • Los datos se almacenan localmente en tu navegador
        </p>
      </footer>
    </div>
  );
};

export default App;
