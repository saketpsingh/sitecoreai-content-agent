const CLOUD_AUTH_HOST = 'auth.sitecorecloud.io';
const CLOUD_API_AUDIENCE = 'https://api.sitecorecloud.io';
const TRANSIENT_ERRORS = [404, 502, 503, 504];
const MAX_RETRIES = 5;

interface TokenEntry {
  accessToken: string;
  expiresAt: number;
}

const tokenStore = new Map<string, TokenEntry>();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getLocalToken(): Promise<string> {
  const identityUrl = process.env.SITECORE_LOCAL_IDENTITY_URL || 'https://id.localhost';
  const username = process.env.SITECORE_LOCAL_USERNAME;
  const password = process.env.SITECORE_LOCAL_PASSWORD;

  if (!username || !password) {
    throw new Error('Local credentials not configured (SITECORE_LOCAL_USERNAME/PASSWORD)');
  }

  const cacheKey = 'token-local';
  const cached = tokenStore.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.accessToken;
  }

  try {
    const response = await fetch(`${identityUrl}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'SitecorePassword',
        username,
        password,
        scope: 'openid sitecore.profile sitecore.profile.api',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Local auth failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();

    tokenStore.set(cacheKey, {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    });

    return data.access_token;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED')) {
        throw new Error(`Cannot connect to local Identity Server at ${identityUrl}. Make sure Docker containers are running.`);
      }
      if (error.message.includes('certificate') || error.message.includes('SSL') || error.message.includes('CERT')) {
        throw new Error(`SSL certificate error connecting to ${identityUrl}. Check NODE_TLS_REJECT_UNAUTHORIZED or trust the local cert.`);
      }
    }
    throw error;
  }
}

async function getCloudToken(env: string): Promise<string> {
  const clientId = process.env[`SITECORE_${env.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`SITECORE_${env.toUpperCase()}_CLIENT_SECRET`];

  if (!clientId || !clientSecret) {
    throw new Error(`Credentials not configured for ${env}`);
  }

  const cacheKey = `token-${env}`;
  const cached = tokenStore.get(cacheKey);

  if (cached && cached.expiresAt > Date.now() + 60000) {
    return cached.accessToken;
  }

  const response = await fetch(`https://${CLOUD_AUTH_HOST}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
      audience: CLOUD_API_AUDIENCE,
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth failed for ${env}: ${response.status}`);
  }

  const data = await response.json();

  tokenStore.set(cacheKey, {
    accessToken: data.access_token,
    expiresAt: Date.now() + (data.expires_in * 1000),
  });

  return data.access_token;
}

export async function getApiToken(env: string): Promise<string> {
  if (env === 'local') {
    // Local XM Cloud uses Sitecore Cloud auth - use DEV credentials
    return getCloudToken('dev');
  }
  return getCloudToken(env);
}

export function getEnvUrl(env: string): string {
  const url = process.env[`SITECORE_${env.toUpperCase()}_URL`];
  if (!url) {
    throw new Error(`URL not configured for ${env}`);
  }
  return url.replace(/\/$/, '');
}

export async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);

      if (response.ok || !TRANSIENT_ERRORS.includes(response.status)) {
        return response;
      }

      lastError = new Error(`HTTP ${response.status}`);

      if (attempt < retries) {
        await sleep(2000 * attempt);
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < retries) {
        await sleep(2000 * attempt);
      }
    }
  }

  throw lastError || new Error('Request failed after retries');
}
