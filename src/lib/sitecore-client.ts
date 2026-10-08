import { EnvironmentConfig, SitecoreItem, SitecoreItemSchema } from '@/types/sitecore';
import { z } from 'zod';

interface AuthToken {
  accessToken: string;
  expiresAt: number;
}

const tokenCache = new Map<string, AuthToken>();

export class SitecoreClient {
  private config: EnvironmentConfig;

  constructor(config: EnvironmentConfig) {
    this.config = config;
  }

  private async getAccessToken(): Promise<string> {
    const cacheKey = `${this.config.name}-${this.config.clientId}`;
    const cached = tokenCache.get(cacheKey);

    if (cached && cached.expiresAt > Date.now() + 60000) {
      return cached.accessToken;
    }

    const response = await fetch(`${this.config.url}/identity/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      }),
    });

    if (!response.ok) {
      throw new Error(`Auth failed: ${response.status} ${await response.text()}`);
    }

    const data = await response.json();
    const token: AuthToken = {
      accessToken: data.access_token,
      expiresAt: Date.now() + (data.expires_in * 1000),
    };
    tokenCache.set(cacheKey, token);
    return token.accessToken;
  }

  async getItem(itemIdOrPath: string): Promise<SitecoreItem> {
    const token = await this.getAccessToken();
    const isPath = itemIdOrPath.startsWith('/');
    const endpoint = isPath
      ? `${this.config.url}/sitecore/api/ssc/item?path=${encodeURIComponent(itemIdOrPath)}`
      : `${this.config.url}/sitecore/api/ssc/item/${itemIdOrPath}`;

    const response = await fetch(endpoint, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      throw new Error(`Failed to get item: ${response.status}`);
    }

    const data = await response.json();
    return SitecoreItemSchema.parse(data);
  }

  async getChildren(itemId: string): Promise<SitecoreItem[]> {
    const token = await this.getAccessToken();
    const response = await fetch(
      `${this.config.url}/sitecore/api/ssc/item/${itemId}/children`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (!response.ok) {
      throw new Error(`Failed to get children: ${response.status}`);
    }

    const data = await response.json();
    return z.array(SitecoreItemSchema).parse(data);
  }

  async exportItems(itemIds: string[]): Promise<{ packageId: string; chunks: Blob[] }> {
    const token = await this.getAccessToken();

    const response = await fetch(`${this.config.url}/api/content/transfer/export`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ itemIds, includeDescendants: true }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Export failed: ${response.status} - ${error}`);
    }

    const result = await response.json();
    const chunks: Blob[] = [];

    for (let i = 0; i < result.totalChunks; i++) {
      const chunkResponse = await fetch(
        `${this.config.url}/api/content/transfer/export/${result.packageId}/chunk/${i}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (!chunkResponse.ok) {
        throw new Error(`Failed to download chunk ${i}: ${chunkResponse.status}`);
      }

      chunks.push(await chunkResponse.blob());
    }

    return { packageId: result.packageId, chunks };
  }

  async importItems(chunks: Blob[]): Promise<{ success: boolean; itemsImported: number; errors: string[] }> {
    const token = await this.getAccessToken();
    const errors: string[] = [];
    let itemsImported = 0;

    const initResponse = await fetch(`${this.config.url}/api/content/transfer/import/init`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ totalChunks: chunks.length }),
    });

    if (!initResponse.ok) {
      throw new Error(`Import init failed: ${initResponse.status}`);
    }

    const { importId } = await initResponse.json();

    for (let i = 0; i < chunks.length; i++) {
      const formData = new FormData();
      formData.append('chunk', chunks[i], `chunk_${i}.dat`);

      const chunkResponse = await fetch(
        `${this.config.url}/api/content/transfer/import/${importId}/chunk/${i}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        }
      );

      if (!chunkResponse.ok) {
        errors.push(`Chunk ${i} failed: ${chunkResponse.status}`);
      }
    }

    const finalizeResponse = await fetch(
      `${this.config.url}/api/content/transfer/import/${importId}/finalize`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (finalizeResponse.ok) {
      const result = await finalizeResponse.json();
      itemsImported = result.itemsImported;
    } else {
      errors.push(`Finalize failed: ${finalizeResponse.status}`);
    }

    return {
      success: errors.length === 0,
      itemsImported,
      errors,
    };
  }

  async itemExists(itemId: string): Promise<boolean> {
    try {
      await this.getItem(itemId);
      return true;
    } catch {
      return false;
    }
  }
}

export function createClient(config: EnvironmentConfig): SitecoreClient {
  return new SitecoreClient(config);
}
