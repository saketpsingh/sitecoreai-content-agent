import { NextResponse } from 'next/server';
import { getApiToken, getEnvUrl, fetchWithRetry } from '@/lib/sitecore-api';

export async function POST(request: Request) {
  try {
    const { environment, path } = await request.json();

    const token = await getApiToken(environment);
    const baseUrl = getEnvUrl(environment);

    // Use GraphQL to fetch item
    const query = `
      query {
        item(where: { path: "${path}" }) {
          itemId
          name
          path
          template {
            templateId
            name
          }
          fields {
            nodes {
              name
              value
            }
          }
          children {
            nodes {
              itemId
              name
              path
            }
          }
        }
      }
    `;

    const response = await fetchWithRetry(
      `${baseUrl}/sitecore/api/authoring/graphql/v1`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query }),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      return NextResponse.json({ success: false, error: `HTTP ${response.status}: ${error.substring(0, 200)}` }, { status: response.status });
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const text = await response.text();
      return NextResponse.json({
        success: false,
        error: `Invalid response from Sitecore API. Expected JSON but got ${contentType}. Response: ${text.substring(0, 200)}`
      });
    }

    const result = await response.json();

    if (result.errors) {
      return NextResponse.json({
        success: false,
        error: result.errors[0]?.message || 'GraphQL error',
      });
    }

    const item = result.data?.item;
    if (!item) {
      return NextResponse.json({ success: false, error: 'Item not found' });
    }

    // Transform fields, excluding Sitecore system fields (prefixed with __)
    const fields: Record<string, unknown> = {};
    if (item.fields?.nodes) {
      for (const field of item.fields.nodes) {
        if (!field.name.startsWith('__')) {
          fields[field.name] = field.value;
        }
      }
    }

    return NextResponse.json({
      success: true,
      item: {
        id: item.itemId,
        name: item.name,
        path: item.path,
        templateId: item.template?.templateId,
        templateName: item.template?.name,
        fields,
      },
      children: item.children?.nodes?.map((child: { itemId: string; name: string; path: string }) => ({
        id: child.itemId,
        name: child.name,
        path: child.path,
      })) || [],
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
