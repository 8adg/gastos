
const BASE_URL = 'https://api.keyvalue.xyz';

export const syncService = {
  // Genera una clave aleatoria si el usuario no tiene una
  generateKey: () => Math.random().toString(36).substring(2, 15),

  // Guarda los datos en la nube
  save: async (key: string, data: any) => {
    try {
      // Usamos una estructura simple de KV store pública para persistencia gratuita
      await fetch(`${BASE_URL}/${key}`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (e) {
      console.error('Error de sincronización', e);
    }
  },

  // Carga los datos desde la nube
  load: async (key: string) => {
    try {
      const res = await fetch(`${BASE_URL}/${key}`);
      if (res.ok) return await res.json();
    } catch (e) {
      console.error('Error al cargar datos', e);
    }
    return null;
  }
};
