import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateUserDto {
  @IsString()
  fullName: string;

  @IsEmail()
  email: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsString()
  @MinLength(8)
  password: string;

  /** Role names to assign, e.g. ["cashier"]. Must already exist (see prisma/seed.ts). */
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  roleNames: string[];

  /** Scope the assigned roles to one store; omit for cross-store access. */
  @IsOptional()
  @IsString()
  storeId?: string;
}
