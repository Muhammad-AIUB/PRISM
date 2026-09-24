import {
  type ArgumentMetadata,
  Injectable,
  NotFoundException,
  ParseIntPipe,
  type PipeTransform,
} from '@nestjs/common';

/**
 * A route id: ParseIntPipe's contract, plus a ceiling.
 *
 * ParseIntPipe accepts any string of digits, so "99999999999999999999" came
 * through as 1e20, Postgres rejected it as out of range for `bigint`, and the
 * route answered 500. A number that cannot be any row's id is a request for a
 * row that does not exist, so it gets the same 404 a missing row does.
 *
 * Non-numeric input keeps ParseIntPipe's 400 and message unchanged: that is an
 * existing, observable contract.
 */
@Injectable()
export class ParseIdPipe implements PipeTransform<string, Promise<number>> {
  private readonly inner = new ParseIntPipe();

  async transform(value: string, metadata: ArgumentMetadata): Promise<number> {
    const id = await this.inner.transform(value, metadata);

    // Every id column here is bigint, and every safe integer fits in one.
    if (!Number.isSafeInteger(id)) {
      throw new NotFoundException('No query results.');
    }

    return id;
  }
}
