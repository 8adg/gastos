
const BASE_URL = 'https://api.keyvalue.xyz';

export const syncService = {
  // Guarda los datos en la nube
  save: async (key: string, data: any) => {
    if (!key || key.length < 3) return false;
    try {
      // Usamos el endpoint directo de la llave
      const response = await fetch(`${BASE_URL}/${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });
      return response.ok;
    } catch (e) {
      console.error('Sync save error:', e);
      return false;
    }
  },

  // Carga los datos desde la nube
  load: async (key: string) => {
    if (!key || key.length < 3) return null;
    try {
      const res = await fetch(`${BASE_URL}/${key}`);
      if (res.ok) {
        const text = await res.text();
        if (!text) return null;
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error("JSON Parse error in sync load", e);
          return null;
        }
      }
    } catch (e) {
      console.warn('Sync load error (probably new key):', e);
    }
    return null;
  }
};
