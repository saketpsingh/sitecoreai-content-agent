import { NextResponse } from 'next/server';
import { getApiToken, getEnvUrl, fetchWithRetry } from '@/lib/sitecore-api';

export async function POST(request: Request) {
  try {
    const { sourceEnv, itemPaths, scope, mergeStrategy } = await request.json();

    const token = await getApiToken(sourceEnv);
    const baseUrl = getEnvUrl(sourceEnv);
    const transferId = crypto.randomUUID();

    const requestBody = {
      TransferId: transferId,
      Configuration: {
        Database: 'master',
        ItemIdMode: 'PreserveSourceId',
        DataTrees: itemPaths.map((path: string) => ({
          ItemPath: path,
          Scope: scope,
          MergeStrategy: mergeStrategy,
          IncludeDescendants: scope === 'ItemAndDescendants',
          IncludeRelatedItems: true,
          IncludeMedia: true,
          PreserveItemIds: true,
        })),
      },
    };

    const response = await fetchWithRetry(
      `${baseUrl}/sitecore/api/content/transfer/v1/transfers`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ success: false, error }, { status: response.status });
    }

    return NextResponse.json({ success: true, transferId });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
