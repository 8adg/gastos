import { GoogleGenAI, Type } from "@google/genai";
import { FuelEntry, AIInsight } from "../types";

export const analyzeFuelConsumption = async (entries: FuelEntry[]): Promise<AIInsight> => {
  // Inicialización siguiendo estrictamente las reglas del desarrollador
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const historyStr = entries.slice(0, 15).map(e => 
    `- Fecha: ${e.date}, KM: ${e.odometer}, Litros: ${e.liters}, Precio/L: ${e.pricePerLiter}, Total: ${e.totalCost.toFixed(2)}`
  ).join('\n');

  const prompt = `Analiza mis consumos de gasolina:
${historyStr}

Genera un objeto JSON con:
1. "analysis": Un resumen profesional de mi eficiencia y gasto.
2. "tips": Un array con 3 consejos tácticos para ahorrar.
3. "sheetsFormula": Una fórmula de Google Sheets útil para proyectar gastos anuales basada en el promedio actual.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { type: Type.STRING },
            tips: { type: Type.ARRAY, items: { type: Type.STRING } },
            sheetsFormula: { type: Type.STRING }
          },
          required: ["analysis", "tips", "sheetsFormula"]
        }
      }
    });

    // La propiedad .text devuelve el string generado directamente
    const jsonStr = response.text || "{}";
    return JSON.parse(jsonStr.trim());
  } catch (error) {
    console.error("Error en el análisis de IA:", error);
    return {
      analysis: "El análisis inteligente no está disponible temporalmente. Por favor, verifica tu conexión o configuración de API.",
      tips: [
        "Mantén una velocidad constante en carretera.",
        "Revisa la presión de los neumáticos mensualmente.",
        "Evita cargar peso innecesario en el maletero."
      ],
      sheetsFormula: "=PROMEDIO(E2:E100)*12"
    };
  }
};
