import { NextResponse } from 'next/server';
import { getApiToken, getEnvUrl, fetchWithRetry } from '@/lib/sitecore-api';

export async function POST(request: Request) {
  try {
    const { sourceEnv, targetEnv, transferId, humanApproved } = await request.json();

    if (targetEnv === 'prod' && !humanApproved) {
      return NextResponse.json({
        success: false,
        error: 'Production transfer requires human approval',
      }, { status: 403 });
    }

    const sourceToken = await getApiToken(sourceEnv);
    const targetToken = await getApiToken(targetEnv);
    const sourceUrl = getEnvUrl(sourceEnv);
    const targetUrl = getEnvUrl(targetEnv);

    // Get transfer status
    const statusResponse = await fetchWithRetry(
      `${sourceUrl}/sitecore/api/content/transfer/v1/transfers/${transferId}/status`,
      { headers: { 'Authorization': `Bearer ${sourceToken}` } }
    );

    if (!statusResponse.ok) {
      return NextResponse.json({ success: false, error: 'Failed to get transfer status' });
    }

    const status = await statusResponse.json();

    if (status.State !== 'Completed') {
      return NextResponse.json({ success: false, error: `Transfer not ready: ${status.State}` });
    }

    let totalChunks = 0;
    let relayedChunks = 0;
    let raifFileName = '';

    for (const chunkSet of status.ChunkSetsMetadata || []) {
      const { ChunkSetId, ChunkCount } = chunkSet;
      totalChunks += ChunkCount;

      for (let chunkIdx = 0; chunkIdx < ChunkCount; chunkIdx++) {
        // Get chunk from source
        const chunkResponse = await fetchWithRetry(
          `${sourceUrl}/sitecore/api/content/transfer/v1/transfers/${transferId}/chunksets/${ChunkSetId}/chunks/${chunkIdx}`,
          { headers: { 'Authorization': `Bearer ${sourceToken}` } }
        );

        if (!chunkResponse.ok) {
          return NextResponse.json({ success: false, error: `Failed to get chunk ${chunkIdx}` });
        }

        const chunkData = await chunkResponse.arrayBuffer();
        const isMedia = chunkResponse.headers.get('IsMedia') === 'true';

        // Send to target
        const putResponse = await fetchWithRetry(
          `${targetUrl}/sitecore/api/content/transfer/v1/transfers/${transferId}/chunksets/${ChunkSetId}/chunks/${chunkIdx}?isMedia=${isMedia}`,
          {
            method: 'PUT',
            headers: {
              'Authorization': `Bearer ${targetToken}`,
              'Content-Type': 'application/octet-stream',
            },
            body: chunkData,
          }
        );

        if (!putResponse.ok) {
          const errorText = await putResponse.text().catch(() => 'No response body');
          return NextResponse.json({
            success: false,
            error: `Failed to send chunk ${chunkIdx}: ${putResponse.status} - ${errorText}`
          });
        }

        relayedChunks++;
      }

      // Complete chunk set
      const completeResponse = await fetchWithRetry(
        `${targetUrl}/sitecore/api/content/transfer/v1/transfers/${transferId}/chunksets/${ChunkSetId}/complete`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${targetToken}` },
        }
      );

      if (!completeResponse.ok) {
        return NextResponse.json({ success: false, error: 'Failed to complete chunk set' });
      }

      const completeData = await completeResponse.json();
      raifFileName = completeData.ContentTransferFileName || raifFileName;
    }

    return NextResponse.json({
      success: true,
      totalChunks,
      relayedChunks,
      raifFileName,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
