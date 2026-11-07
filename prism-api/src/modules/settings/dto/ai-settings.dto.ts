import { IsIn, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

const PROVIDERS = ['openai', 'google', 'openrouter', 'anthropic'];

export class ListAiModelsDto {
  @IsIn(PROVIDERS) provider!: string;
  @IsOptional() @IsString() @MaxLength(512) api_key?: string;
}

export class SaveAiSettingsDto extends ListAiModelsDto {
  @IsString() @IsNotEmpty() @MaxLength(191) model!: string;
}
