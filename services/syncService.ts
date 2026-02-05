
const BASE_URL = 'https://api.keyvalue.xyz';

export const syncService = {
  // Genera un ID nuevo. Intenta con el servidor, si falla genera uno local.
  createKey: async () => {
    try {
      const response = await fetch(`${BASE_URL}/new`, { 
        method: 'POST',
        // Sin cabeceras para evitar bloqueos de seguridad del navegador
      });
      if (response.ok) {
        const url = await response.text();
        const key = url.split('/').pop()?.trim();
        return key || null;
      }
    } catch (e) {
      console.warn('Servidor de llaves lento, usando generador local...');
    }
    return 'gc-' + Math.random().toString(36).substring(2, 10);
  },

  // Guarda los datos de forma simple para evitar errores CORS
  save: async (key: string, data: any) => {
    if (!key || key.length < 5) return false;
    
    // Minificamos los datos para evitar exceder límites de tamaño
    const minimalData = {
      t: data.target,
      d: data.days.filter((d: any) => d.expenses.length > 0) // Solo enviamos días con gastos
    };

    try {
      // Usamos el método más simple posible para el POST
      const response = await fetch(`${BASE_URL}/${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain', // Usamos text/plain para evitar el Preflight de CORS
        },
        body: JSON.stringify(minimalData),
      });
      return response.ok;
    } catch (e) {
      console.error('Error de red en Save:', e);
      return false;
    }
  },

  // Carga y reconstruye los datos
  load: async (key: string) => {
    if (!key || key.length < 5) return null;
    try {
      const res = await fetch(`${BASE_URL}/${key}?t=${Date.now()}`); // Cache busting
      if (res.ok) {
        const text = await res.text();
        if (!text || text.trim() === "" || text.includes("not found")) return null;
        
        const raw = JSON.parse(text);
        // Reconstruimos el formato original
        return {
          target: raw.t,
          days: Array.from({ length: 31 }, (_, i) => {
            const saved = raw.d?.find((sd: any) => sd.day === i + 1);
            return saved || { day: i + 1, expenses: [] };
          })
        };
      }
    } catch (e) {
      console.error('Error de red en Load:', e);
    }
    return null;
  }
};
