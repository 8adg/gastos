
import { GoogleGenAI, Type } from "@google/genai";
import { DailyRecord, AIAnalysisResponse } from "../types";

export const extractAmountFromImage = async (apiKey: string, base64Image: string, mimeType: string): Promise<number | null> => {
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  
  const prompt = "Eres un experto contable. Analiza esta imagen de un ticket o recibo y extrae el MONTO TOTAL. Responde ÚNICAMENTE con el número decimal, sin símbolos de moneda ni texto adicional. Si no encuentras un total claro, devuelve 0.";

  try {
    const response = await ai.models.generateContent({
      model,
      contents: {
        parts: [
          { inlineData: { data: base64Image, mimeType } },
          { text: prompt }
        ]
      }
    });

    const text = response.text?.trim() || "0";
    const amount = parseFloat(text.replace(/[^0-9.]/g, ''));
    return isNaN(amount) ? null : amount;
  } catch (error) {
    console.error("Error extracting amount:", error);
    return null;
  }
};

export const analyzeExpenses = async (
  apiKey: string,
  records: DailyRecord[],
  dailyBudget: number,
  monthName: string
): Promise<AIAnalysisResponse> => {
  const ai = new GoogleGenAI({ apiKey });
  const model = "gemini-3-flash-preview";
  
  const dataSummary = records.map(r => {
    const totalDay = r.expenses.reduce((sum, e) => sum + e.amount, 0);
    return `Día ${r.day}: ${totalDay} (${r.expenses.length} gastos)`;
  }).join(', ');

  const totalSpent = records.reduce((acc, r) => acc + r.expenses.reduce((s, e) => s + e.amount, 0), 0);

  const prompt = `
    Eres un experto en finanzas personales.
    Mes: ${monthName}
    Presupuesto diario base: ${dailyBudget}
    Gastos: [${dataSummary}]
    Total actual: ${totalSpent}

    Analiza el comportamiento y da consejos. Devuelve también fórmulas de Google Sheets para un control dinámico.
    Responde en JSON.
  `;

  const response = await ai.models.generateContent({
    model,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          insight: { type: Type.STRING },
          recommendations: { type: Type.ARRAY, items: { type: Type.STRING } },
          googleSheetsFormulas: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING },
                formula: { type: Type.STRING }
              },
              required: ["label", "formula"]
            }
          }
        },
        required: ["insight", "recommendations", "googleSheetsFormulas"]
      }
    }
  });

  return JSON.parse(response.text);
};
