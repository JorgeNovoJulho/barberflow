export const expenseGuides = {
  fixed: "Despesas fixas",
  variable: "Despesas variáveis",
  reinvestment: "Reinvestimentos",
} as const;

export type ExpenseGuide = keyof typeof expenseGuides;
export type FinanceGuide = ExpenseGuide | "receivables" | "unclassified";

export function isExpenseGuide(value: unknown): value is ExpenseGuide {
  return typeof value === "string" && Object.hasOwn(expenseGuides, value);
}

export function financeGuide(value: unknown): FinanceGuide {
  if (isExpenseGuide(value) || value === "receivables" || value === "unclassified") return value;
  return "fixed";
}
