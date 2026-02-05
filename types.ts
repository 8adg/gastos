
export interface DailyExpense {
  id: string;
  amount: number;
  description: string;
}

export interface DayData {
  day: number;
  expenses: DailyExpense[];
}

export interface AppState {
  monthlyTarget: number;
  dailyExpenses: DayData[];
  month: number;
  year: number;
}
