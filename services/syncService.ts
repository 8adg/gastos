
const BASE_URL = 'https://api.keyvalue.xyz';

export const syncService = {
  // Genera un ID único (Intenta con el servidor, si falla lo hace local)
  createKey: async () => {
    try {
      const response = await fetch(`${BASE_URL}/new`, { 
        method: 'POST',
        mode: 'cors'
      });
      if (response.ok) {
        const url = await response.text();
        return url.split('/').pop()?.trim() || null;
      }
    } catch (e) {
      console.warn('Servidor de llaves no disponible, generando ID local...');
    }
    // Backup: Generador de ID aleatorio seguro si el servicio está caído
    return 'gc-' + Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10);
  },

  // Guarda los datos
  save: async (key: string, data: any) => {
    if (!key || key.length < 5) return false;
    try {
      const response = await fetch(`${BASE_URL}/${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        mode: 'cors',
        body: JSON.stringify(data),
      });
      return response.ok;
    } catch (e) {
      console.error('Error al guardar en la nube:', e);
      return false;
    }
  },

  // Carga los datos
  load: async (key: string) => {
    if (!key || key.length < 5) return null;
    try {
      const res = await fetch(`${BASE_URL}/${key}`, {
        method: 'GET',
        mode: 'cors',
        headers: { 'Accept': 'application/json' }
      });
      
      if (res.ok) {
        const text = await res.text();
        if (!text || text.trim() === "") return null;
        try {
          return JSON.parse(text);
        } catch (e) {
          return null;
        }
      }
    } catch (e) {
      console.warn('Error al cargar (puede ser un ID nuevo):', e);
    }
    return null;
  }
};
