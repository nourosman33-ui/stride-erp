import { IsNumber, IsUUID, Min } from "class-validator";

export class SetCashAmountDto {
  @IsUUID()
  storeId: string;

  @IsNumber()
  @Min(0)
  amount: number;
}
