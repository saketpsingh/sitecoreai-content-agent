import { NextResponse } from 'next/server';
import { getApiToken, getEnvUrl } from '@/lib/sitecore-api';

interface SitecoreItem {
  ItemID: string;
  ItemName: string;
  ItemPath: string;
  TemplateID: string;
  TemplateName: string;
  ItemLanguage: string;
  ItemVersion: string;
  ParentID: string;
  [key: string]: unknown;
}

async function fetchItem(baseUrl: string, token: string, pathOrId: string, database: string = 'master'): Promise<SitecoreItem | null> {
  try {
    const isPath = pathOrId.startsWith('/');
    const url = isPath
      ? `${baseUrl}/sitecore/api/ssc/item?path=${encodeURIComponent(pathOrId)}&database=${database}`
      : `${baseUrl}/sitecore/api/ssc/item/${pathOrId}?database=${database}`;

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) return null;
    return response.json();
  } catch {
    return null;
  }
}

async function fetchChildren(baseUrl: string, token: string, itemId: string, database: string = 'master'): Promise<SitecoreItem[]> {
  const response = await fetch(
    `${baseUrl}/sitecore/api/ssc/item/${itemId}/children?database=${database}`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!response.ok) return [];
  return response.json();
}

async function getAllDescendants(
  baseUrl: string,
  token: string,
  itemId: string,
  database: string = 'master',
  items: SitecoreItem[] = []
): Promise<SitecoreItem[]> {
  const children = await fetchChildren(baseUrl, token, itemId, database);
  for (const child of children) {
    items.push(child);
    await getAllDescendants(baseUrl, token, child.ItemID, database, items);
  }
  return items;
}

function getFieldData(item: SitecoreItem): Record<string, unknown> {
  // Only exclude API-computed properties that are NOT actual Sitecore fields
  const excludeKeys = [
    // Core item properties (API metadata, not actual fields)
    'ItemID', 'ItemName', 'ItemPath', 'TemplateID', 'TemplateName',
    'ItemLanguage', 'ItemVersion', 'ParentID', 'HasChildren', 'DisplayName',
    // Computed/derived fields from SSC API (not real Sitecore fields)
    'ItemMedialUrl', 'ItemMediaUrl', 'ItemUrl', 'ItemIcon',
    'TemplateFullName', 'TemplatePath', 'CloneSource', 'ItemCloneSource',
    'Language', 'Version', 'Database', 'FullPath', 'Key', 'MediaUrl',
    'Url', 'Uri', 'Id', 'Name', 'Path', 'Fields', 'Children', 'Parent',
  ];

  const fieldData: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item)) {
    // Skip null/undefined/empty values
    if (value === null || value === undefined || value === '') {
      continue;
    }

    // Skip API metadata properties
    if (excludeKeys.includes(key)) {
      continue;
    }

    // Skip computed Item* properties (e.g., ItemUrl, ItemIcon) but keep regular fields
    if (key.startsWith('Item') && key !== 'Item') {
      continue;
    }

    // Include ALL other fields, including:
    // - Standard Sitecore fields (__Sortorder, __Display name, __Hidden, etc.)
    // - Custom template fields
    // - Any other field data
    fieldData[key] = value;
  }
  return fieldData;
}

async function deleteItem(
  baseUrl: string,
  token: string,
  itemId: string
): Promise<boolean> {
  try {
    const response = await fetch(
      `${baseUrl}/sitecore/api/ssc/item/${itemId}?database=master`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return response.ok;
  } catch {
    return false;
  }
}

async function createItemViaGraphQL(
  baseUrl: string,
  token: string,
  item: SitecoreItem,
  targetParentId: string
): Promise<{ success: boolean; error?: string; newId?: string }> {
  const fieldData = getFieldData(item);

  // Build field values for GraphQL, excluding SSC-only properties that aren't real template fields
  const graphqlExcludeFields = ['DisplayName', 'displayName'];
  const fieldValues = Object.entries(fieldData)
    .filter(([name]) => !graphqlExcludeFields.includes(name))
    .map(([name, value]) => ({
      name,
      value: String(typeof value === 'string' ? value : JSON.stringify(value)),
    }));

  const mutation = `
    mutation CreateItem($input: CreateItemInput!) {
      createItem(input: $input) {
        item {
          itemId
          name
          path
        }
      }
    }
  `;

  const variables = {
    input: {
      name: item.ItemName,
      templateId: item.TemplateID,
      parent: targetParentId,
      language: item.ItemLanguage || 'en',
      fields: fieldValues,
    },
  };

  const response = await fetch(`${baseUrl}/sitecore/api/authoring/graphql/v1`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `GraphQL create failed: ${response.status} - ${error}` };
  }

  const result = await response.json();

  if (result.errors && result.errors.length > 0) {
    const fieldNames = fieldValues.map(f => f.name).join(', ');
    return { success: false, error: `GraphQL error: ${result.errors[0].message} [fields: ${fieldNames}]` };
  }

  if (result.data?.createItem?.item) {
    return { success: true, newId: result.data.createItem.item.itemId };
  }

  return { success: false, error: 'GraphQL returned no item' };
}

async function createItem(
  baseUrl: string,
  token: string,
  item: SitecoreItem,
  targetParentId: string
): Promise<{ success: boolean; error?: string; newId?: string }> {
  const fieldData = getFieldData(item);

  const createPayload = {
    ItemName: item.ItemName,
    TemplateID: item.TemplateID,
    ...(typeof item.DisplayName === 'string' ? { DisplayName: item.DisplayName } : {}),
    ...fieldData,
  };

  // Method 1: Try SSC create endpoint
  let response = await fetch(
    `${baseUrl}/sitecore/api/ssc/item?parent=${targetParentId}&database=master`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    }
  );

  if (response.ok) {
    const created = await response.json();
    return { success: true, newId: created.ItemID };
  }

  // Method 2: Try GraphQL Authoring API
  const graphqlResult = await createItemViaGraphQL(baseUrl, token, item, targetParentId);
  if (graphqlResult.success) {
    return graphqlResult;
  }

  // Method 3: Try alternative SSC endpoint format
  response = await fetch(
    `${baseUrl}/sitecore/api/ssc/item/${targetParentId}?database=master`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createPayload),
    }
  );

  if (response.ok) {
    const created = await response.json();
    return { success: true, newId: created.ItemID };
  }

  const error = await response.text();
  return { success: false, error: `Create failed (SSC: 405, GraphQL: ${graphqlResult.error})` };
}

async function updateItem(
  baseUrl: string,
  token: string,
  itemId: string,
  item: SitecoreItem
): Promise<{ success: boolean; error?: string }> {
  const fieldData = getFieldData(item);

  const response = await fetch(
    `${baseUrl}/sitecore/api/ssc/item/${itemId}?database=master`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(fieldData),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    return { success: false, error: `Update failed: ${response.status} - ${error}` };
  }
  return { success: true };
}

export async function POST(request: Request) {
  try {
    const { sourceEnv, targetEnv, database = 'master', itemPath, includeDescendants, forceSourceIds = false } = await request.json();

    const sourceToken = await getApiToken(sourceEnv);
    const targetToken = await getApiToken(targetEnv);
    const sourceUrl = getEnvUrl(sourceEnv);
    const targetUrl = getEnvUrl(targetEnv);

    // Fetch root item from source (use specified database for source, always master for target)
    const rootItem = await fetchItem(sourceUrl, sourceToken, itemPath, database);
    if (!rootItem) {
      return NextResponse.json({ success: false, error: `Item not found on source: ${itemPath} (database: ${database})` });
    }

    // Collect all items to transfer
    const items: SitecoreItem[] = [rootItem];
    if (includeDescendants) {
      const descendants = await getAllDescendants(sourceUrl, sourceToken, rootItem.ItemID, database);
      items.push(...descendants);
    }

    let transferred = 0;
    let created = 0;
    let updated = 0;
    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    // Map to track source ID -> target ID for parent lookups
    const idMap = new Map<string, string>();

    for (const item of items) {
      // Check if item exists on target by path
      let existingItem = await fetchItem(targetUrl, targetToken, item.ItemPath);

      if (existingItem) {
        // Check if IDs match
        const idsMatch = existingItem.ItemID.toLowerCase() === item.ItemID.toLowerCase();

        if (forceSourceIds && !idsMatch) {
          // Delete existing item with different ID so we can recreate with source ID
          const deleteResult = await deleteItem(targetUrl, targetToken, existingItem.ItemID);
          if (deleteResult) {
            deleted++;
            existingItem = null; // Mark as not existing so it gets created
          } else {
            // If delete failed, fall back to update
            const result = await updateItem(targetUrl, targetToken, existingItem.ItemID, item);
            if (result.success) {
              transferred++;
              updated++;
              idMap.set(item.ItemID, existingItem.ItemID);
            } else {
              failed++;
              errors.push(`${item.ItemPath}: ${result.error}`);
            }
            continue;
          }
        } else {
          // Update existing item (IDs match or forceSourceIds is false)
          const result = await updateItem(targetUrl, targetToken, existingItem.ItemID, item);
          if (result.success) {
            transferred++;
            updated++;
            idMap.set(item.ItemID, existingItem.ItemID);
          } else {
            failed++;
            errors.push(`${item.ItemPath}: ${result.error}`);
          }
          continue;
        }
      }

      if (!existingItem) {
        // Item doesn't exist - need to create it
        // Find parent on target
        let targetParentId: string | null = null;

        // Check if we already mapped the parent
        if (idMap.has(item.ParentID)) {
          targetParentId = idMap.get(item.ParentID)!;
        } else {
          // Try to find parent by path
          const parentPath = item.ItemPath.substring(0, item.ItemPath.lastIndexOf('/'));
          const targetParent = await fetchItem(targetUrl, targetToken, parentPath);
          if (targetParent) {
            targetParentId = targetParent.ItemID;
            idMap.set(item.ParentID, targetParentId);
          }
        }

        if (!targetParentId) {
          failed++;
          errors.push(`${item.ItemPath}: Parent not found on target`);
          continue;
        }

        const result = await createItem(targetUrl, targetToken, item, targetParentId);
        if (result.success) {
          transferred++;
          created++;
          if (result.newId) {
            idMap.set(item.ItemID, result.newId);
          }
        } else {
          failed++;
          errors.push(`${item.ItemPath}: ${result.error}`);
        }
      }
    }

    return NextResponse.json({
      success: failed === 0,
      totalItems: items.length,
      transferred,
      created,
      updated,
      deleted,
      failed,
      forceSourceIds,
      errors: errors.slice(0, 10),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
