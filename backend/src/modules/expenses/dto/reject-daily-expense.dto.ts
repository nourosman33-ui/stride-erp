import { IsString, MinLength } from "class-validator";

export class RejectDailyExpenseDto {
  @IsString()
  @MinLength(1)
  reason: string;
}
