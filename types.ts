
export interface FuelEntry {
  id: string;
  date: string;
  odometer: number; // Kilómetros totales
  liters: number;
  pricePerLiter: number;
  totalCost: number;
  fullTank: boolean;
}

export interface FuelStats {
  totalSpent: number;
  totalLiters: number;
  avgConsumption: number; // l/100km
  avgPrice: number;
  totalKm: number;
}

export interface AIInsight {
  analysis: string;
  tips: string[];
  sheetsFormula: string;
}
