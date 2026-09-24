import { Transform } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  DESIGN_PRIORITIES,
  DESIGN_SCALES,
  type DesignBrief,
  type DesignPriority,
  type DesignScale,
} from '../../../design/blueprint';

/**
 * What a developer tells Design Studio. Field names match the JSON the web
 * form and the MCP tool send.
 *
 * The minimum length is not pedantry: "a chat app" produces a generic design,
 * and a generic design is the thing this feature exists to replace. Twenty
 * characters is enough to force one real sentence.
 */
/**
 * Trim before validating, so the length rules measure what the model will
 * actually see: twenty spaces is not a description. The ValidationPipe runs
 * class-transformer before class-validator, so this applies first.
 */
const trimmed = () =>
  Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value));

export class DesignBriefDto {
  @trimmed()
  @IsString()
  @MinLength(20, { message: 'product must describe what you are building in at least 20 characters' })
  @MaxLength(4000)
  product!: string;

  @IsOptional()
  @IsIn(DESIGN_SCALES)
  scale?: DesignScale;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(4)
  @ArrayUnique()
  @IsIn(DESIGN_PRIORITIES, { each: true })
  priorities?: DesignPriority[];

  @IsOptional()
  @trimmed()
  @IsString()
  @MaxLength(1500)
  constraints?: string;
}

export function toBrief(dto: DesignBriefDto): DesignBrief {
  return {
    product: dto.product.trim(),
    scale: dto.scale ?? 'startup',
    priorities: dto.priorities ?? [],
    constraints: (dto.constraints ?? '').trim(),
  };
}
