
const BASE_URL = 'https://api.keyvalue.xyz';

export const syncService = {
  // Crea una llave oficial en el servidor
  createKey: async () => {
    try {
      const response = await fetch(`${BASE_URL}/new`, { 
        method: 'POST'
      });
      if (response.ok) {
        const url = await response.text();
        const key = url.split('/').pop()?.trim();
        return key || null;
      }
    } catch (e) {
      console.error('Error al solicitar nueva llave:', e);
    }
    // Si falla el servidor, generamos uno local compatible
    return 'gc-' + Math.random().toString(36).substring(2, 12);
  },

  // Guarda los datos usando un formato de envío más permisivo para CORS
  save: async (key: string, data: any) => {
    if (!key || key.length < 5) return false;
    try {
      // Enviamos como texto plano pero con estructura JSON para evitar preflight OPTIONS costosos
      const response = await fetch(`${BASE_URL}/${key}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
      return response.ok;
    } catch (e) {
      console.error('Error de red al guardar:', e);
      return false;
    }
  },

  // Carga los datos de la nube
  load: async (key: string) => {
    if (!key || key.length < 5) return null;
    try {
      const res = await fetch(`${BASE_URL}/${key}`);
      if (res.ok) {
        const text = await res.text();
        if (!text || text.trim() === "" || text.includes("not found")) return null;
        try {
          return JSON.parse(text);
        } catch (e) {
          return null;
        }
      }
    } catch (e) {
      console.warn('Error al conectar con la llave:', e);
    }
    return null;
  }
};
