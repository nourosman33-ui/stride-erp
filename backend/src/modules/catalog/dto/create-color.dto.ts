import { IsOptional, IsString, MinLength } from "class-validator";

export class CreateColorDto {
  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  hexCode?: string;
}
