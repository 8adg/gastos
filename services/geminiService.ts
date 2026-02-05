
import { GoogleGenAI, Type } from "@google/genai";
import { Expense, SpendingAnalysis, ReceiptData } from "../types";

const MODEL_NAME = "gemini-3-flash-preview";

export const scanReceipt = async (base64Image: string): Promise<ReceiptData> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const prompt = "Analiza esta imagen de un ticket de compra. Extrae el nombre del comercio, la fecha, el total pagado y los artículos individuales. Clasifica el gasto en una de estas categorías: Alimentación, Transporte, Ocio, Facturas, Salud, Hogar, Otros.";

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          parts: [
            { text: prompt },
            { inlineData: { mimeType: "image/jpeg", data: base64Image } }
          ]
        }
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchant: { type: Type.STRING },
            date: { type: Type.STRING },
            total: { type: Type.NUMBER },
            category: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  price: { type: Type.NUMBER }
                }
              }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("OCR Error:", error);
    throw error;
  }
};

export const analyzeSpending = async (expenses: Expense[]): Promise<SpendingAnalysis> => {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const history = expenses.slice(0, 30).map(e => `${e.date} | ${e.title} | ${e.category} | $${e.amount}`).join('\n');
  
  const prompt = `Analiza mi historial de gastos recientes y proporciona un informe de salud financiera:\n${history}`;

  try {
    const response = await ai.models.generateContent({
      model: MODEL_NAME,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            summary: { type: Type.STRING },
            warnings: { type: Type.ARRAY, items: { type: Type.STRING } },
            savingTips: { type: Type.ARRAY, items: { type: Type.STRING } },
            balanceStatus: { type: Type.STRING, enum: ["Excelente", "Estable", "Crítico"] }
          },
          required: ["summary", "warnings", "savingTips", "balanceStatus"]
        }
      }
    });

    return JSON.parse(response.text || "{}");
  } catch (error) {
    console.error("Analysis Error:", error);
    return {
      summary: "No se pudo generar el análisis.",
      warnings: [],
      savingTips: ["Revisa tus gastos hormiga."],
      balanceStatus: "Estable"
    };
  }
};
