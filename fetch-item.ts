import 'dotenv/config';
import { config } from 'dotenv';

config({ path: '.env.local' });

const devConfig = {
  name: 'dev',
  url: process.env.SITECORE_DEV_URL!,
  clientId: process.env.SITECORE_DEV_CLIENT_ID!,
  clientSecret: process.env.SITECORE_DEV_CLIENT_SECRET!,
};

async function getAccessToken(): Promise<string> {
  // XM Cloud uses auth.sitecorecloud.io for authentication
  const response = await fetch('https://auth.sitecorecloud.io/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: devConfig.clientId,
      client_secret: devConfig.clientSecret,
      audience: 'https://api.sitecorecloud.io',
    }),
  });

  if (!response.ok) {
    throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
  }

  const data = await response.json();
  return data.access_token;
}

async function getItem(itemPath: string) {
  const token = await getAccessToken();

  // Try the SSC API
  const endpoint = `${devConfig.url}/sitecore/api/ssc/item?path=${encodeURIComponent(itemPath)}`;

  console.log(`Calling: ${endpoint}\n`);

  const response = await fetch(endpoint, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to get item: ${response.status} - ${text}`);
  }

  return await response.json();
}

async function main() {
  const itemPath = '/sitecore/content/HAP/HAP/Home/Plan Detail Page';

  console.log(`Fetching item: ${itemPath}`);
  console.log(`From: ${devConfig.url}\n`);

  try {
    const item = await getItem(itemPath);
    console.log(JSON.stringify(item, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

main();
