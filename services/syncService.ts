
const BASE_URL = 'https://api.keyvalue.xyz';

export const syncService = {
  // Genera una nueva llave oficial en el servidor
  createKey: async () => {
    try {
      const response = await fetch(`${BASE_URL}/new`, {
        method: 'POST',
      });
      if (response.ok) {
        const url = await response.text();
        // La respuesta es una URL completa, extraemos solo el ID final
        return url.split('/').pop()?.trim() || null;
      }
    } catch (e) {
      console.error('Error creando llave:', e);
    }
    return null;
  },

  // Guarda los datos (POST a la llave)
  save: async (key: string, data: any) => {
    if (!key || key.length < 5) return false;
    try {
      const response = await fetch(`${BASE_URL}/${key}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify(data),
      });
      return response.ok;
    } catch (e) {
      console.error('Sync save error:', e);
      return false;
    }
  },

  // Carga los datos (GET a la llave)
  load: async (key: string) => {
    if (!key || key.length < 5) return null;
    try {
      const res = await fetch(`${BASE_URL}/${key}`, {
        headers: { 'Accept': 'application/json' }
      });
      if (res.ok) {
        const text = await res.text();
        if (!text || text.trim() === "") return null;
        try {
          return JSON.parse(text);
        } catch (e) {
          console.error("Error parseando JSON de la nube", e);
          return null;
        }
      }
    } catch (e) {
      console.warn('Error cargando de la nube:', e);
    }
    return null;
  }
};
