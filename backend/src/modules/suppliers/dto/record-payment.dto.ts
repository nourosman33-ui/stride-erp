import { IsIn, IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class RecordSupplierPaymentDto {
  @IsIn(["deposit", "payment", "credit_note"])
  type: "deposit" | "payment" | "credit_note";

  @IsNumber()
  @Min(0.01)
  amount: number;

  @IsOptional()
  @IsUUID()
  purchaseOrderId?: string;

  @IsOptional()
  @IsString()
  note?: string;
}
