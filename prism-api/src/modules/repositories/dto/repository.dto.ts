import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { REVIEW_MODES } from '../../../database/repository.helpers';

/**
 * Mirrors RepositoryController's $request->validate() rules. The global
 * ValidationPipe runs with whitelist + forbidNonWhitelisted, so unexpected
 * keys are rejected rather than silently dropped.
 */
export class ConnectRepositoryDto {
  @Type(() => Number)
  @IsInt()
  github_repo_id!: number;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsNotEmpty()
  full_name!: string;

  @IsOptional()
  @IsIn(REVIEW_MODES as unknown as string[])
  review_mode?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  // Not in the Laravel rules, but an unbounded array here would be written
  // straight into a json column; 200 is far above any real branch count.
  @ArrayMaxSize(200)
  review_branches?: string[];
}

export class UpdateRepositorySettingsDto {
  @IsIn(REVIEW_MODES as unknown as string[])
  review_mode!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(255, { each: true })
  @ArrayMaxSize(200)
  review_branches?: string[];
}

export class BranchesQueryDto {
  /** Laravel: regex:#^[\w.-]+/[\w.-]+$# — owner/repo, nothing path-like. */
  @IsString()
  @Matches(/^[\w.-]+\/[\w.-]+$/)
  full_name!: string;
}
