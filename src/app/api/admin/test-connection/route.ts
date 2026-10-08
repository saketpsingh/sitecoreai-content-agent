import { NextResponse } from 'next/server';

interface ConnectionTestResult {
  success: boolean;
  environment: string;
  url: string;
  authMethod: string;
  error?: string;
  responseTime?: number;
  details?: {
    authenticated: boolean;
    apiVersion?: string;
    sitecoreVersion?: string;
  };
}

async function testEnvironmentConnection(env: string): Promise<ConnectionTestResult> {
  const startTime = Date.now();

  const envKey = env.toUpperCase();
  const url = process.env[`SITECORE_${envKey}_URL`];
  const clientId = process.env[`SITECORE_${envKey}_CLIENT_ID`];
  const clientSecret = process.env[`SITECORE_${envKey}_CLIENT_SECRET`];

  if (!url) {
    return {
      success: false,
      environment: env,
      url: 'Not configured',
      authMethod: 'N/A',
      error: `SITECORE_${envKey}_URL not configured`,
    };
  }

  const isLocal = env.toLowerCase() === 'local';
  const authMethod = isLocal ? 'Password Grant' : 'Client Credentials';

  try {
    let token: string;

    if (isLocal) {
      // Local uses password grant
      const username = process.env.SITECORE_LOCAL_USERNAME || 'admin';
      const password = process.env.SITECORE_LOCAL_PASSWORD || 'b';
      const identityUrl = process.env.SITECORE_LOCAL_IDENTITY_URL || 'https://id.localhost';

      const tokenResponse = await fetch(`${identityUrl}/connect/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'password',
          client_id: clientId || 'SitecorePassword',
          client_secret: clientSecret || 'SitecorePassword',
          username: `sitecore\\${username}`,
          password,
          scope: 'openid sitecore.profile sitecore.profile.api',
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        return {
          success: false,
          environment: env,
          url,
          authMethod,
          error: `Auth failed: ${tokenResponse.status} - ${error}`,
          responseTime: Date.now() - startTime,
        };
      }

      const tokenData = await tokenResponse.json();
      token = tokenData.access_token;
    } else {
      // Cloud environments use client credentials
      const tokenResponse = await fetch('https://auth.sitecorecloud.io/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
          audience: 'https://api.sitecorecloud.io',
        }),
      });

      if (!tokenResponse.ok) {
        const error = await tokenResponse.text();
        return {
          success: false,
          environment: env,
          url,
          authMethod,
          error: `Auth failed: ${tokenResponse.status} - ${error}`,
          responseTime: Date.now() - startTime,
        };
      }

      const tokenData = await tokenResponse.json();
      token = tokenData.access_token;
    }

    // Test API access by fetching root item
    const apiResponse = await fetch(
      `${url}/sitecore/api/ssc/item?path=/sitecore&database=master`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    const responseTime = Date.now() - startTime;

    if (!apiResponse.ok) {
      return {
        success: false,
        environment: env,
        url,
        authMethod,
        error: `API access failed: ${apiResponse.status}`,
        responseTime,
        details: { authenticated: true },
      };
    }

    const itemData = await apiResponse.json();

    return {
      success: true,
      environment: env,
      url,
      authMethod,
      responseTime,
      details: {
        authenticated: true,
        apiVersion: 'SSC API',
        sitecoreVersion: itemData.ItemName ? 'Connected' : 'Unknown',
      },
    };
  } catch (error) {
    return {
      success: false,
      environment: env,
      url,
      authMethod,
      error: error instanceof Error ? error.message : 'Unknown error',
      responseTime: Date.now() - startTime,
    };
  }
}

export async function POST(request: Request) {
  try {
    const { environment } = await request.json();

    if (environment === 'all') {
      const environments = ['dev', 'qa', 'prod', 'local'];
      const results = await Promise.all(
        environments.map(env => testEnvironmentConnection(env))
      );
      return NextResponse.json({ success: true, results });
    }

    const result = await testEnvironmentConnection(environment);
    return NextResponse.json(result);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: msg }, { status: 500 });
  }
}

export async function GET() {
  // Return current configuration (without secrets)
  const config = {
    dev: {
      url: process.env.SITECORE_DEV_URL || '',
      clientId: process.env.SITECORE_DEV_CLIENT_ID || '',
      hasSecret: !!process.env.SITECORE_DEV_CLIENT_SECRET,
    },
    qa: {
      url: process.env.SITECORE_QA_URL || '',
      clientId: process.env.SITECORE_QA_CLIENT_ID || '',
      hasSecret: !!process.env.SITECORE_QA_CLIENT_SECRET,
    },
    prod: {
      url: process.env.SITECORE_PROD_URL || '',
      clientId: process.env.SITECORE_PROD_CLIENT_ID || '',
      hasSecret: !!process.env.SITECORE_PROD_CLIENT_SECRET,
    },
    local: {
      url: process.env.SITECORE_LOCAL_URL || '',
      identityUrl: process.env.SITECORE_LOCAL_IDENTITY_URL || '',
      clientId: process.env.SITECORE_LOCAL_CLIENT_ID || '',
      username: process.env.SITECORE_LOCAL_USERNAME || '',
      hasSecret: !!process.env.SITECORE_LOCAL_CLIENT_SECRET,
      hasPassword: !!process.env.SITECORE_LOCAL_PASSWORD,
    },
  };

  return NextResponse.json({ success: true, config });
}
