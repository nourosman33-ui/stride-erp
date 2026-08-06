import { IsString, MinLength } from "class-validator";

/** Shared shape for Category / Gender / ProductType lookups (FR-CAT-3). */
export class CreateNamedLookupDto {
  @IsString()
  @MinLength(1)
  name: string;
}
