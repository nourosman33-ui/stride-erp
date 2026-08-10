import { IsOptional, IsString } from "class-validator";

export class DeleteDailyExpenseDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
