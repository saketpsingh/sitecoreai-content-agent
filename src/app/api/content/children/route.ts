import { NextResponse } from 'next/server';
import { getApiToken, getEnvUrl, fetchWithRetry } from '@/lib/sitecore-api';

export async function POST(request: Request) {
  try {
    const { environment, itemId } = await request.json();

    const token = await getApiToken(environment);
    const baseUrl = getEnvUrl(environment);

    const query = `
      query {
        item(where: { path: "${itemId}" }) {
          children {
            nodes {
              itemId
              name
              path
              template {
                templateId
                name
              }
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

    const children = result.data?.item?.children?.nodes || [];

    return NextResponse.json({
      success: true,
      children: children.map((child: { itemId: string; name: string; path: string; template?: { templateId: string; name: string } }) => ({
        id: child.itemId,
        name: child.name,
        path: child.path,
        templateId: child.template?.templateId,
        templateName: child.template?.name,
      })),
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}
