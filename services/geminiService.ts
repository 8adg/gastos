
import { GoogleGenAI, Type } from "@google/genai";
// Fixed imports: replaced Expense with DailyExpense and imported AIInsight
import { DailyExpense, AIInsight } from "../types";

export const getFinancialAdvice = async (expenses: DailyExpense[], monthlyBudget: number): Promise<AIInsight> => {
  // Always initialize GoogleGenAI with a named parameter object.
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
  
  const totalSpent = expenses.reduce((sum, e) => sum + e.amount, 0);
  // Fixed: DailyExpense uses 'description' instead of 'title' and does not have a 'date' field.
  const history = expenses.slice(0, 30).map(e => `- ${e.description}: $${e.amount}`).join('\n');

  const prompt = `Actúa como un experto en finanzas personales.
Presupuesto mensual: $${monthlyBudget}
Total gastado: $${totalSpent}
Historial reciente:
${history}

Analiza si el usuario llegará a fin de mes con su ritmo actual. Devuelve un JSON con:
1. "analysis": Resumen corto de la situación.
2. "forecast": Una predicción de cuánto le sobrará o faltará.
3. "recommendations": Un array con 3 consejos prácticos.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            analysis: { 
              type: Type.STRING,
              description: "Resumen corto y directo de la salud financiera actual."
            },
            forecast: { 
              type: Type.STRING,
              description: "Predicción numérica o descriptiva del balance al final del mes."
            },
            recommendations: { 
              type: Type.ARRAY, 
              items: { type: Type.STRING },
              description: "Array de exactamente 3 consejos financieros prácticos."
            }
          },
          required: ["analysis", "forecast", "recommendations"],
          propertyOrdering: ["analysis", "forecast", "recommendations"]
        }
      }
    });

    // Directly access the .text property from the response object as per SDK guidelines.
    const jsonStr = response.text;
    if (!jsonStr) {
      throw new Error("Empty response from Gemini API");
    }

    return JSON.parse(jsonStr.trim());
  } catch (error) {
    console.error("AI Error:", error);
    return {
      analysis: "No se pudo completar el análisis automático.",
      forecast: "Balance incierto",
      recommendations: ["Mantén la disciplina en tus registros diarios.", "Evita gastos hormiga mientras se restablece el servicio."]
    };
  }
};
