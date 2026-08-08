import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export const EXPENSE_CATEGORIES = [
  "rent",
  "utilities",
  "salaries",
  "marketing",
  "logistics",
  "maintenance",
  "software",
  "other",
] as const;

export const EXPENSE_FREQUENCIES = [
  "one_time",
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "yearly",
] as const;

export type ExpenseCategoryInput = (typeof EXPENSE_CATEGORIES)[number];
export type ExpenseFrequencyInput = (typeof EXPENSE_FREQUENCIES)[number];

export class CreateExpenseDto {
  @IsUUID()
  storeId: string;

  @IsIn(EXPENSE_CATEGORIES)
  category: ExpenseCategoryInput;

  @IsString()
  label: string;

  @IsNumber()
  @Min(0)
  amount: number;

  @IsIn(EXPENSE_FREQUENCIES)
  frequency: ExpenseFrequencyInput;

  @IsDateString()
  startDate: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsString()
  notes?: string;
}
