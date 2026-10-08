import { NextResponse } from 'next/server';
import { getApiToken, getEnvUrl, fetchWithRetry } from '@/lib/sitecore-api';

export async function POST(request: Request) {
  try {
    const { sourceEnv, transferId, maxWaitSeconds = 120 } = await request.json();

    const token = await getApiToken(sourceEnv);
    const baseUrl = getEnvUrl(sourceEnv);
    const startTime = Date.now();
    const maxWaitMs = maxWaitSeconds * 1000;

    while (Date.now() - startTime < maxWaitMs) {
      const response = await fetchWithRetry(
        `${baseUrl}/sitecore/api/content/transfer/v1/transfers/${transferId}/status`,
        { headers: { 'Authorization': `Bearer ${token}` } }
      );

      if (!response.ok) {
        const error = await response.text();
        return NextResponse.json({ success: false, error }, { status: response.status });
      }

      const status = await response.json();

      if (status.State === 'Completed') {
        const totalItems = status.ChunkSetsMetadata?.reduce(
          (sum: number, cs: { TotalItemCount: number }) => sum + cs.TotalItemCount, 0
        ) || status.TotalItemCount || 0;

        return NextResponse.json({
          success: true,
          state: 'Completed',
          totalItems,
          chunkSets: status.ChunkSetsMetadata?.length || 0,
          details: status,
        });
      }

      if (status.State === 'Failed') {
        return NextResponse.json({ success: false, error: 'Transfer packaging failed' });
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }

    return NextResponse.json({ success: false, error: 'Timeout waiting for packaging' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
