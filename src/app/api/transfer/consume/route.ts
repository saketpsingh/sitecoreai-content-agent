import { NextResponse } from 'next/server';
import { getApiToken, getEnvUrl, fetchWithRetry } from '@/lib/sitecore-api';

async function deleteItemByPath(baseUrl: string, token: string, itemPath: string, database: string): Promise<{ success: boolean; itemId?: string; error?: string }> {
  try {
    // First, get the item to find its ID
    const getResponse = await fetch(
      `${baseUrl}/sitecore/api/ssc/item?path=${encodeURIComponent(itemPath)}&database=${database}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!getResponse.ok) {
      if (getResponse.status === 404) {
        return { success: true }; // Item doesn't exist, nothing to delete
      }
      return { success: false, error: `Failed to find item: ${getResponse.status}` };
    }

    const item = await getResponse.json();
    const itemId = item.ItemID;

    if (!itemId) {
      return { success: false, error: 'Item found but no ItemID' };
    }

    // Delete the item
    const deleteResponse = await fetch(
      `${baseUrl}/sitecore/api/ssc/item/${itemId}?database=${database}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!deleteResponse.ok && deleteResponse.status !== 404) {
      const error = await deleteResponse.text();
      return { success: false, itemId, error: `Delete failed: ${deleteResponse.status} - ${error}` };
    }

    return { success: true, itemId };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
}

export async function POST(request: Request) {
  try {
    const { targetEnv, blobName, database = 'master', mergeStrategy = 'OverrideExistingItem', deleteBeforeImport = false, itemPaths = [] } = await request.json();

    const token = await getApiToken(targetEnv);
    const baseUrl = getEnvUrl(targetEnv);

    // If deleteBeforeImport is enabled, delete existing items first
    const deleteResults: { path: string; success: boolean; itemId?: string; error?: string }[] = [];
    if (deleteBeforeImport && itemPaths.length > 0) {
      for (const path of itemPaths) {
        const result = await deleteItemByPath(baseUrl, token, path, database);
        deleteResults.push({ path, success: result.success, itemId: result.itemId, error: result.error });
      }

      // Wait for Sitecore to process the deletes before importing
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Verify items were actually deleted
      for (const result of deleteResults) {
        if (result.success && result.itemId) {
          const verifyResponse = await fetch(
            `${baseUrl}/sitecore/api/ssc/item/${result.itemId}?database=${database}`,
            { headers: { Authorization: `Bearer ${token}` } }
          );
          if (verifyResponse.ok) {
            result.success = false;
            result.error = 'Item still exists after delete attempt';
          }
        }
      }
    }

    const response = await fetchWithRetry(
      `${baseUrl}/sitecore/shell/api/v3/ItemsTransfer/transfers/databases/${database}/sources?blobName=${encodeURIComponent(blobName)}&mergeStrategy=${encodeURIComponent(mergeStrategy)}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          MergeStrategy: mergeStrategy,
          PreserveItemIds: true,
        }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ success: false, error }, { status: response.status });
    }

    // Try to get transfer ID from Location header
    const locationHeader = response.headers.get('Location') || '';
    let importTransferId = '';

    if (locationHeader) {
      // Extract the last segment which should be the transfer ID
      const segments = locationHeader.split('/').filter(Boolean);
      importTransferId = segments[segments.length - 1] || '';
    }

    // If no Location header, try to get from response body
    if (!importTransferId) {
      try {
        const responseData = await response.json();
        importTransferId = responseData.TransferId || responseData.Id || responseData.transferId || '';
      } catch {
        // Response might not be JSON, use blobName as reference
        importTransferId = blobName.replace('.raif', '');
      }
    }

    return NextResponse.json({
      success: true,
      importTransferId,
      database,
      deleteBeforeImport,
      deleteResults: deleteResults.length > 0 ? deleteResults : undefined,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
