import { IsInt, IsOptional, IsString, MinLength } from "class-validator";

export class CreateSizeDto {
  @IsString()
  @MinLength(1)
  standard: string; // EU | UK | US

  @IsString()
  @MinLength(1)
  value: string; // "42"

  @IsOptional()
  @IsInt()
  sortOrder?: number;
}
