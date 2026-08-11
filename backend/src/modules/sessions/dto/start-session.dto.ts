import { IsNumber, IsOptional, IsString, IsUUID, Min } from "class-validator";

export class StartSessionDto {
  @IsUUID()
  storeId: string;

  /** Cash counted into the drawer at open. Optional — a session is about trading. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  openingCash?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
