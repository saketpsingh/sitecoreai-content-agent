import { createSession } from './lib/agent';
import { executeAnalyzeDependencies } from './lib/tools/analyze-dependencies';
import { executeValidateContent } from './lib/tools/validate-content';
import { executeExportItems } from './lib/tools/export-items';
import { initializeMemory } from './lib/memory';
import { createApprovalRequest } from './lib/human-gate';
import { AgentState } from './types/agent';
import sampleItems from '../data/sample-items.json';
import failureScenarios from '../data/failure-scenarios.json';

const mockClient = {
  getItem: async (idOrPath: string) => {
    const item = sampleItems.items.find(i => i.id === idOrPath || i.path === idOrPath);
    if (!item) throw new Error(`Item not found: ${idOrPath}`);
    return item;
  },
  getChildren: async (parentId: string) => {
    return sampleItems.items.filter(i => i.parentId === parentId);
  },
  exportItems: async (itemIds: string[]) => {
    console.log(`  Exporting ${itemIds.length} items...`);
    return {
      packageId: `pkg-${Date.now()}`,
      chunks: [new Blob([JSON.stringify(itemIds)])],
    };
  },
  importItems: async (chunks: Blob[]) => {
    console.log(`  Importing ${chunks.length} chunks...`);
    return { success: true, itemsImported: 10, errors: [] };
  },
};

function createMockState(): AgentState {
  return {
    sessionId: `demo-${Date.now()}`,
    messages: [],
    currentOperation: null,
    retryCount: 0,
    maxRetries: 3,
    memory: initializeMemory(),
  };
}

async function runNormalFlow() {
  console.log('\n========================================');
  console.log('DEMO: Normal Transfer Flow');
  console.log('========================================\n');

  const session = createSession('dev', 'staging', ['/sitecore/content/Home']);
  console.log(`Session created: ${session.id}`);
  console.log(`Transfer: ${session.request.sourceEnv} -> ${session.request.targetEnv}`);

  console.log('\n--- Step 1: Analyze Dependencies ---');
  const analysisResult = await executeAnalyzeDependencies(
    { itemPath: '/sitecore/content/Home', includeDescendants: true, maxDepth: 3 },
    createMockState(),
    mockClient as any
  );

  if (analysisResult.success) {
    const analysis = analysisResult.data as any;
    console.log(`Root item: ${analysis.rootItem.path}`);
    console.log(`Dependencies found: ${analysis.dependencies.length}`);
    console.log(`Broken references: ${analysis.brokenReferences.length}`);
    console.log(`Transfer order: ${analysis.transferOrder.length} items`);
    session.analysis = analysis;
  }

  console.log('\n--- Step 2: Validate Content ---');
  const items = [sampleItems.items[0], sampleItems.items[1], sampleItems.items[2]];
  const validationResult = await executeValidateContent(
    { items, targetEnvironment: 'staging', strictMode: false },
    createMockState()
  );

  if (validationResult.success) {
    const validation = validationResult.data as any;
    console.log(`Items validated: ${validation.summary.totalItems}`);
    console.log(`Valid: ${validation.summary.validItems}, Invalid: ${validation.summary.invalidItems}`);
    console.log(`Errors: ${validation.summary.totalErrors}, Warnings: ${validation.summary.totalWarnings}`);
    session.validation = validation.results;
  }

  console.log('\n--- Step 3: Request Human Approval ---');
  const approvalRequest = createApprovalRequest(
    session as any,
    session.analysis!,
    session.validation!
  );
  console.log(`Approval required for: ${approvalRequest.summary}`);
  console.log(`Items to transfer: ${approvalRequest.itemCount}`);
  console.log(`Warnings: ${approvalRequest.warnings.length}`);
  console.log(`Errors: ${approvalRequest.errors.length}`);

  console.log('\n[SIMULATED] Human approves transfer...');
  session.humanApproval = {
    approved: true,
    approvedBy: 'demo-user',
    approvedAt: new Date().toISOString(),
  };

  console.log('\n--- Step 4: Export Items ---');
  const exportResult = await executeExportItems(
    { itemIds: session.analysis!.transferOrder.slice(0, 3) },
    createMockState(),
    mockClient as any
  );

  if (exportResult.success) {
    const exportData = exportResult.data as any;
    console.log(`Package ID: ${exportData.packageId}`);
    console.log(`Chunks: ${exportData.totalChunks}`);
  }

  console.log('\n--- Step 5: Import to Target ---');
  console.log('[SIMULATED] Import successful');
  console.log('Items transferred: 10');

  console.log('\n========================================');
  console.log('DEMO: Normal Flow Complete');
  console.log('========================================\n');
}

async function runFailureRecovery() {
  console.log('\n========================================');
  console.log('DEMO: Failure Recovery Flow');
  console.log('========================================\n');

  const scenario = failureScenarios.scenarios.find(s => s.id === 'validation_schema_mismatch');
  console.log(`Scenario: ${scenario?.name}`);
  console.log(`Description: ${scenario?.description}\n`);

  console.log('--- Attempt 1: Validation with invalid data ---');
  const invalidItems = [{
    id: 'invalid-1',
    name: 'InvalidItem',
    path: '/sitecore/content/Invalid',
    templateId: '00000000-0000-0000-0000-000000000000',
    templateName: 'Invalid',
    parentId: 'missing-parent',
    language: 'en',
    version: 1,
    fields: { Title: '', price: 'not-a-number' },
  }];

  const result1 = await executeValidateContent(
    { items: invalidItems, targetEnvironment: 'staging', strictMode: true },
    createMockState()
  );

  const validation1 = result1.data as any;
  console.log(`Validation passed: ${validation1.results[0].isValid}`);
  console.log('Errors found:');
  validation1.results[0].errors.forEach((e: any) => {
    console.log(`  - [${e.severity}] ${e.message}`);
  });
  console.log('Suggestions:');
  validation1.results[0].suggestions.forEach((s: string) => {
    console.log(`  - ${s}`);
  });

  console.log('\n--- Attempt 2: Fix and retry ---');
  const fixedItems = [{
    ...invalidItems[0],
    templateId: 'valid-template-id-1234-5678-901234567890',
    parentId: null,
    fields: { Title: 'Fixed Title', price: 123.45 },
  }];

  const result2 = await executeValidateContent(
    { items: fixedItems, targetEnvironment: 'staging', strictMode: true },
    createMockState()
  );

  const validation2 = result2.data as any;
  console.log(`Validation passed: ${validation2.results[0].isValid}`);
  console.log(`Errors: ${validation2.results[0].errors.length}`);

  console.log('\n========================================');
  console.log('DEMO: Failure Recovery Complete');
  console.log('========================================\n');
}

async function runEscalationDemo() {
  console.log('\n========================================');
  console.log('DEMO: Escalation After Repeated Failures');
  console.log('========================================\n');

  const state = createMockState();

  const failingClient = {
    ...mockClient,
    exportItems: async () => {
      throw new Error('Connection timeout after 30000ms');
    },
  };

  for (let attempt = 1; attempt <= 3; attempt++) {
    console.log(`--- Attempt ${attempt}/3 ---`);
    const result = await executeExportItems(
      { itemIds: ['item-1', 'item-2'] },
      state,
      failingClient as any
    );
    console.log(`Success: ${result.success}`);
    console.log(`Error: ${result.error}`);
    state.retryCount++;
    console.log('');
  }

  console.log('--- ESCALATION TRIGGERED ---');
  console.log('Escalation context:');
  console.log(JSON.stringify({
    sessionId: state.sessionId,
    attemptedOperations: ['export_items x3'],
    errors: [
      { operation: 'export_items', error: 'Connection timeout', timestamp: new Date().toISOString() },
    ],
    partialProgress: { itemsAnalyzed: 2, itemsValidated: 2, itemsTransferred: 0 },
    recommendation: 'Check network connectivity to source environment. Consider reducing batch size.',
  }, null, 2));

  console.log('\n========================================');
  console.log('DEMO: Escalation Complete');
  console.log('========================================\n');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║     Sitecore AI Content Transfer Agent - Demo Suite        ║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  await runNormalFlow();
  await runFailureRecovery();
  await runEscalationDemo();

  console.log('All demos completed successfully!');
}

main().catch(console.error);
