import { IsNumber, IsOptional, IsString, Min } from "class-validator";

export class EndSessionDto {
  /** Cash counted out of the drawer at close. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  closingCash?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}
