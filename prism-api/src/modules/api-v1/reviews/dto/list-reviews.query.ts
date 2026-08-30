import { Transform } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

/**
 * Laravel read these straight off the query string with `min((int) $limit, 50)`.
 * Same ceiling of 50 and same default of 10; the lower bound of 1 is added
 * deliberately — Laravel's version would emit `LIMIT -1` for `?limit=-1` and
 * error at the driver. Documented as an intentional divergence.
 */
export class ListReviewsQuery {
  @IsOptional()
  @Transform(({ value }) => (value === undefined ? undefined : Number.parseInt(String(value), 10)))
  @IsInt()
  @Min(1)
  @Max(50)
  limit = 10;

  @IsOptional()
  @IsString()
  repo?: string;
}
