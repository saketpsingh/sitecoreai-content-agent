import { NextRequest, NextResponse } from 'next/server';
import { getTraces, clearTraces, exportTracesForPortkey } from '@/lib/observability';

export async function GET(request: NextRequest) {
  const sessionId = request.nextUrl.searchParams.get('sessionId');
  const format = request.nextUrl.searchParams.get('format');

  if (format === 'portkey' && sessionId) {
    const exportData = exportTracesForPortkey(sessionId);
    return NextResponse.json(exportData);
  }

  const traces = getTraces(sessionId || undefined);
  return NextResponse.json({ traces, count: traces.length });
}

export async function DELETE() {
  clearTraces();
  return NextResponse.json({ cleared: true });
}
