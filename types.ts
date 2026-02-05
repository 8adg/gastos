
export interface ExpenseItem {
  id: string;
  amount: number;
  label: string; // Ahora es obligatorio para el reporte
}

export interface DailyRecord {
  day: number;
  expenses: ExpenseItem[];
  date: Date;
  isLocked: boolean;
  adjustedBudget: number;
}

export interface MonthlySummary {
  totalBudget: number;
  totalSpent: number;
  totalBalance: number;
  projectedSpending: number;
  isOverBudget: boolean;
  currentDailyAllowance: number;
}

export interface AIAnalysisResponse {
  insight: string;
  recommendations: string[];
  googleSheetsFormulas: {
    label: string;
    formula: string;
  }[];
}
