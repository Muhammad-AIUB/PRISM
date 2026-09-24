import { NextResponse } from 'next/server';
import { apiRaw } from '@/lib/api';

/**
 * The blueprint as a Markdown file, streamed from prism-api with its own
 * Content-Disposition so the download keeps the design's name.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const upstream = await apiRaw(`/design/${id}/markdown`);

  if (!upstream.ok) {
    return NextResponse.json({ message: 'Design not found.' }, { status: upstream.status });
  }

  return new NextResponse(await upstream.text(), {
    status: 200,
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Content-Disposition':
        upstream.headers.get('content-disposition') ?? 'attachment; filename="design.md"',
    },
  });
}
