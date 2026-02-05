
import { GoogleGenAI, Type } from "@google/genai";
import { FuelEntry, AIInsight } from "../types";

export const analyzeFuelConsumption = async (entries: FuelEntry[]): Promise<AIInsight> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const historyStr = entries.slice(-10).map(e => 
    `Fecha: ${e.date}, KM: ${e.odometer}, Litros: ${e.liters}, Precio/L: ${e.pricePerLiter}, Total: ${e.totalCost}`
  ).join('\n');

  const prompt = `
    Eres un experto en eficiencia energética y mecánica automotriz. 
    Analiza los siguientes registros de combustible de mi vehículo:
    ${historyStr}

    Proporciona un análisis breve de mi gasto, 3 consejos específicos para mejorar el rendimiento 
    y una fórmula de Google Sheets para calcular la proyección de gasto mensual basada en estos datos.
    Responde estrictamente en formato JSON.
  `;

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

    return JSON.parse(response.text);
  } catch (error) {
    console.error("Gemini Error:", error);
    return {
      analysis: "No se pudo realizar el análisis en este momento.",
      tips: ["Mantén la presión de neumáticos adecuada.", "Evita aceleraciones bruscas."],
      sheetsFormula: "=SUMA(A:A)*1.1"
    };
  }
};
