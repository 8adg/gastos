
export interface DailyExpense {
  id: string;
  amount: number;
  description: string;
}

export interface DayData {
  day: number;
  expenses: DailyExpense[];
}

// Added AIInsight interface to match the expected AI response structure
export interface AIInsight {
  analysis: string;
  forecast: string;
  recommendations: string[];
}

export interface AppState {
  monthlyTarget: number;
  dailyExpenses: DayData[];
  month: number;
  year: number;
}
