import { IsOptional, IsString, IsUUID, MinLength } from "class-validator";

export class SendMessageDto {
  @IsUUID()
  storeId: string;

  @IsOptional()
  @IsUUID()
  conversationId?: string;

  @IsString()
  @MinLength(1)
  message: string;
}
