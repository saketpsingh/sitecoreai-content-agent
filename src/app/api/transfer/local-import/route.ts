import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { sourceEnv, database = 'master', itemPaths } = await request.json();

    const logs: string[] = [];
    const log = (msg: string) => logs.push(`[${new Date().toLocaleTimeString()}] ${msg}`);

    log(`Starting Local Sync from ${sourceEnv.toUpperCase()} (database: ${database})`);
    log(`Items to sync: ${itemPaths.length}`);

    // Use Direct API transfer - this is the only method that works on local Docker
    // Note: IDs will NOT be preserved. For ID preservation, use Sitecore CLI.
    const url = new URL(request.url);
    const baseUrl = `${url.protocol}//${url.host}`;

    let totalTransferred = 0;
    let totalCreated = 0;
    let totalUpdated = 0;
    let totalFailed = 0;
    const allErrors: string[] = [];

    for (const itemPath of itemPaths) {
      log(`Syncing: ${itemPath}`);

      const directResponse = await fetch(`${baseUrl}/api/transfer/direct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEnv,
          targetEnv: 'local',
          database,
          itemPath,
          includeDescendants: true,
          forceSourceIds: false,
        }),
      });

      const directData = await directResponse.json();

      if (directData.success || directData.transferred > 0) {
        totalTransferred += directData.transferred || 0;
        totalCreated += directData.created || 0;
        totalUpdated += directData.updated || 0;
        log(`  Transferred: ${directData.transferred}, Created: ${directData.created}, Updated: ${directData.updated}`);
      } else {
        totalFailed++;
        const error = directData.error || 'Unknown error';
        allErrors.push(`${itemPath}: ${error}`);
        log(`  Failed: ${error}`);
      }
    }

    log('');
    log(`Sync complete: ${totalTransferred} items transferred`);

    if (totalTransferred > 0) {
      log('');
      log('NOTE: Item IDs do NOT match source environment.');
      log('For ID preservation, use Sitecore CLI:');
      log('  dotnet sitecore ser pull -n prod -i Demosite');
      log('  dotnet sitecore ser push -n default -i Demosite');
    }

    return NextResponse.json({
      success: totalFailed === 0,
      totalItems: totalTransferred,
      created: totalCreated,
      updated: totalUpdated,
      failed: totalFailed,
      logs,
      errors: allErrors.slice(0, 10),
      warning: totalTransferred > 0
        ? 'Content synced via Direct API - IDs do not match source. Use Sitecore CLI for ID preservation.'
        : undefined,
    });

  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
