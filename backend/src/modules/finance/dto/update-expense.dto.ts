import { IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Min } from "class-validator";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_FREQUENCIES,
  type ExpenseCategoryInput,
  type ExpenseFrequencyInput,
} from "./create-expense.dto";

export class UpdateExpenseDto {
  @IsOptional()
  @IsIn(EXPENSE_CATEGORIES)
  category?: ExpenseCategoryInput;

  @IsOptional()
  @IsString()
  label?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  amount?: number;

  @IsOptional()
  @IsIn(EXPENSE_FREQUENCIES)
  frequency?: ExpenseFrequencyInput;

  @IsOptional()
  @IsDateString()
  startDate?: string;

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
