import { IsEmail, IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class UpdateProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  /**
   * Laravel's `lowercase` rule VALIDATES that the value is already lowercase,
   * it does not transform it. Reproduced rather than silently normalising, so
   * the same input is rejected in both runtimes.
   */
  @IsString()
  @IsEmail()
  @MaxLength(255)
  @Matches(/^[^A-Z]*$/, { message: 'email must be lowercase' })
  email!: string;
}

export class DeleteAccountDto {
  @IsString()
  @IsNotEmpty()
  password!: string;
}
