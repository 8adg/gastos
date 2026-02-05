
export type Category = 'Alimentación' | 'Transporte' | 'Ocio' | 'Facturas' | 'Salud' | 'Hogar' | 'Otros';

export interface Expense {
  id: string;
  date: string;
  title: string;
  amount: number;
  category: Category;
  description?: string;
}

export interface SpendingAnalysis {
  summary: string;
  warnings: string[];
  savingTips: string[];
  balanceStatus: 'Excelente' | 'Estable' | 'Crítico';
}

export interface ReceiptData {
  merchant?: string;
  date?: string;
  total?: number;
  items?: { name: string; price: number }[];
  category?: Category;
}
