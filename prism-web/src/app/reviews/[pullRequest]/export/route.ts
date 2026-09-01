import { NextResponse } from 'next/server';
import { apiRaw } from '@/lib/api';

/**
 * Streams the PDF from prism-api.
 *
 * A route handler rather than a server action: this is a file download the
 * browser navigates to, and it has to arrive with the API's own
 * Content-Type and Content-Disposition intact. Passing the body through as a
 * Blob keeps the bytes untouched — re-serialising it would produce a corrupt
 * file that still looks like a successful download.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ pullRequest: string }> },
): Promise<Response> {
  const { pullRequest } = await params;
  const upstream = await apiRaw(`/reviews/${pullRequest}/export`);

  if (!upstream.ok) {
    // 403 and 404 are both meaningful here (someone else's PR, or a deleted
    // one), so the status is passed through rather than flattened.
    return NextResponse.json(
      { message: 'Could not generate the PDF.' },
      { status: upstream.status },
    );
  }

  return new NextResponse(await upstream.blob(), {
    status: 200,
    headers: {
      'Content-Type': upstream.headers.get('content-type') ?? 'application/pdf',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? 'attachment; filename="review.pdf"',
    },
  });
}
