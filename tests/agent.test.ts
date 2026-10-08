import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createSession } from '@/lib/agent';
import { executeAnalyzeDependencies } from '@/lib/tools/analyze-dependencies';
import { executeValidateContent } from '@/lib/tools/validate-content';
import { executeExportItems } from '@/lib/tools/export-items';
import { executeImportItems } from '@/lib/tools/import-items';
import { initializeMemory } from '@/lib/memory';
import { AgentState } from '@/types/agent';

const mockSitecoreClient = {
  getItem: vi.fn(),
  getChildren: vi.fn(),
  exportItems: vi.fn(),
  importItems: vi.fn(),
  itemExists: vi.fn(),
};

function createMockState(): AgentState {
  return {
    sessionId: 'test-session-123',
    messages: [],
    currentOperation: null,
    retryCount: 0,
    maxRetries: 3,
    memory: initializeMemory(),
  };
}

describe('Agent Session', () => {
  it('creates a session with correct defaults', () => {
    const session = createSession('dev', 'staging', ['/sitecore/content/Home']);

    expect(session.id).toBeDefined();
    expect(session.request.sourceEnv).toBe('dev');
    expect(session.request.targetEnv).toBe('staging');
    expect(session.request.itemPaths).toEqual(['/sitecore/content/Home']);
    expect(session.request.includeDescendants).toBe(true);
    expect(session.request.conflictResolution).toBe('overwrite');
    expect(session.status).toBe('analyzing');
    expect(session.errors).toEqual([]);
  });

  it('allows custom options', () => {
    const session = createSession('prod', 'dev', ['/path'], {
      includeDescendants: false,
      conflictResolution: 'skip',
    });

    expect(session.request.includeDescendants).toBe(false);
    expect(session.request.conflictResolution).toBe('skip');
  });
});

describe('Analyze Dependencies Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('analyzes a single item with no dependencies', async () => {
    const mockItem = {
      id: 'item-123',
      name: 'TestItem',
      path: '/sitecore/content/TestItem',
      templateId: 'template-456',
      templateName: 'Page',
      parentId: 'parent-789',
      language: 'en',
      version: 1,
      fields: { Title: 'Test' },
    };

    mockSitecoreClient.getItem.mockResolvedValue(mockItem);
    mockSitecoreClient.getChildren.mockResolvedValue([]);

    const result = await executeAnalyzeDependencies(
      { itemPath: '/sitecore/content/TestItem', includeDescendants: false },
      createMockState(),
      mockSitecoreClient as any
    );

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect((result.data as any).rootItem.id).toBe('item-123');
    expect((result.data as any).dependencies).toHaveLength(0);
  });

  it('detects broken references', async () => {
    const mockItem = {
      id: 'item-123',
      name: 'TestItem',
      path: '/sitecore/content/TestItem',
      templateId: 'template-456',
      templateName: 'Page',
      parentId: 'parent-789',
      language: 'en',
      version: 1,
      fields: { RelatedItem: '{00000000-0000-0000-0000-000000000000}' },
    };

    mockSitecoreClient.getItem
      .mockResolvedValueOnce(mockItem)
      .mockRejectedValueOnce(new Error('Not found'));
    mockSitecoreClient.getChildren.mockResolvedValue([]);

    const result = await executeAnalyzeDependencies(
      { itemPath: '/sitecore/content/TestItem', includeDescendants: false },
      createMockState(),
      mockSitecoreClient as any
    );

    expect(result.success).toBe(true);
    expect((result.data as any).brokenReferences).toHaveLength(1);
    expect((result.data as any).brokenReferences[0].reason).toBe('Item not found');
  });
});

describe('Validate Content Tool', () => {
  it('passes valid items', async () => {
    const items = [
      {
        id: 'item-1',
        name: 'ValidItem',
        path: '/sitecore/content/Valid',
        templateId: 'template-123',
        templateName: 'Page',
        parentId: null,
        language: 'en',
        version: 1,
        fields: { Title: 'Valid Title' },
      },
    ];

    const result = await executeValidateContent(
      { items, targetEnvironment: 'staging', strictMode: false },
      createMockState()
    );

    expect(result.success).toBe(true);
    expect((result.data as any).results[0].isValid).toBe(true);
    expect((result.data as any).summary.validItems).toBe(1);
  });

  it('fails items with missing required title', async () => {
    const items = [
      {
        id: 'item-1',
        name: 'InvalidItem',
        path: '/sitecore/content/Invalid',
        templateId: 'template-123',
        templateName: 'Page',
        parentId: null,
        language: 'en',
        version: 1,
        fields: { Title: '' },
      },
    ];

    const result = await executeValidateContent(
      { items, targetEnvironment: 'staging', strictMode: false },
      createMockState()
    );

    expect(result.success).toBe(true);
    expect((result.data as any).results[0].isValid).toBe(false);
    expect((result.data as any).results[0].errors).toContainEqual(
      expect.objectContaining({ severity: 'error', message: expect.stringContaining('Title') })
    );
  });

  it('warns about script tags', async () => {
    const items = [
      {
        id: 'item-1',
        name: 'ScriptItem',
        path: '/sitecore/content/Script',
        templateId: 'template-123',
        templateName: 'Page',
        parentId: null,
        language: 'en',
        version: 1,
        fields: { Title: 'Valid', Content: '<script>alert("xss")</script>' },
      },
    ];

    const result = await executeValidateContent(
      { items, targetEnvironment: 'staging', strictMode: false },
      createMockState()
    );

    expect(result.success).toBe(true);
    expect((result.data as any).results[0].errors).toContainEqual(
      expect.objectContaining({ severity: 'warning', message: expect.stringContaining('script') })
    );
  });

  it('detects orphan items', async () => {
    const items = [
      {
        id: 'child-item',
        name: 'Orphan',
        path: '/sitecore/content/Orphan',
        templateId: 'template-123',
        templateName: 'Page',
        parentId: 'missing-parent-id',
        language: 'en',
        version: 1,
        fields: { Title: 'Orphan' },
      },
    ];

    const result = await executeValidateContent(
      { items, targetEnvironment: 'staging', strictMode: false },
      createMockState()
    );

    expect(result.success).toBe(true);
    expect((result.data as any).results[0].isValid).toBe(false);
    expect((result.data as any).results[0].errors).toContainEqual(
      expect.objectContaining({ severity: 'error', message: expect.stringContaining('Parent') })
    );
  });
});

describe('Export Items Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exports items successfully', async () => {
    mockSitecoreClient.exportItems.mockResolvedValue({
      packageId: 'pkg-123',
      chunks: [new Blob(['chunk1']), new Blob(['chunk2'])],
    });

    const state = createMockState();
    const result = await executeExportItems(
      { itemIds: ['item-1', 'item-2'], includeDescendants: true },
      state,
      mockSitecoreClient as any
    );

    expect(result.success).toBe(true);
    expect((result.data as any).packageId).toBe('pkg-123');
    expect((result.data as any).totalChunks).toBe(2);
    expect(state.memory.successfulTransfers).toContain('item-1');
  });

  it('handles empty item list', async () => {
    const result = await executeExportItems(
      { itemIds: [] },
      createMockState(),
      mockSitecoreClient as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('No items');
  });

  it('provides helpful error on timeout', async () => {
    mockSitecoreClient.exportItems.mockRejectedValue(new Error('Request timeout'));

    const result = await executeExportItems(
      { itemIds: ['item-1'] },
      createMockState(),
      mockSitecoreClient as any
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
    expect(result.error).toContain('batch size');
  });
});

describe('Import Items Tool', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('performs dry run without actual import', async () => {
    const result = await executeImportItems(
      { packageId: 'pkg-123', chunks: [{ index: 0, sizeBytes: 1000, checksum: 'abc' }], dryRun: true },
      createMockState(),
      mockSitecoreClient as any,
      []
    );

    expect(result.success).toBe(true);
    expect((result.data as any).dryRun).toBe(true);
    expect(mockSitecoreClient.importItems).not.toHaveBeenCalled();
  });

  it('imports items successfully', async () => {
    mockSitecoreClient.importItems.mockResolvedValue({
      success: true,
      itemsImported: 5,
      errors: [],
    });

    const result = await executeImportItems(
      { packageId: 'pkg-123', chunks: [{ index: 0, sizeBytes: 1000, checksum: 'abc' }], dryRun: false },
      createMockState(),
      mockSitecoreClient as any,
      [new Blob(['data'])]
    );

    expect(result.success).toBe(true);
    expect((result.data as any).itemsTransferred).toBe(5);
  });

  it('reports partial failures', async () => {
    mockSitecoreClient.importItems.mockResolvedValue({
      success: false,
      itemsImported: 3,
      errors: ['Item conflict on item-2', 'Permission denied on item-3'],
    });

    const result = await executeImportItems(
      { packageId: 'pkg-123', chunks: [{ index: 0, sizeBytes: 1000, checksum: 'abc' }], dryRun: false },
      createMockState(),
      mockSitecoreClient as any,
      [new Blob(['data'])]
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain('errors');
    expect((result.data as any).itemsFailed).toBe(2);
  });
});

describe('Recovery Path', () => {
  it('retries with adjusted batch size after timeout', async () => {
    const state = createMockState();

    mockSitecoreClient.exportItems
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce({ packageId: 'pkg-123', chunks: [new Blob(['data'])] });

    const result1 = await executeExportItems({ itemIds: ['1', '2', '3'] }, state, mockSitecoreClient as any);
    expect(result1.success).toBe(false);
    expect(result1.error).toContain('batch size');

    const result2 = await executeExportItems({ itemIds: ['1'] }, state, mockSitecoreClient as any);
    expect(result2.success).toBe(true);
  });
});
