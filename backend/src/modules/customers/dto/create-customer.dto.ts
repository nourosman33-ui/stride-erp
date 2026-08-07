import { IsDateString, IsEmail, IsIn, IsOptional, IsString, MinLength } from "class-validator";

export class CreateCustomerDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;

  @IsOptional()
  @IsIn(["male", "female", "other"])
  gender?: string;

  @IsOptional()
  @IsDateString()
  birthDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
