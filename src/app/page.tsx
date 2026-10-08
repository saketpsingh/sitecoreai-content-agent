'use client';

import { useState, useEffect } from 'react';

type TransferStep = 'config' | 'initiating' | 'polling' | 'relaying' | 'consuming' | 'verifying' | 'completed' | 'failed';
type ActiveTab = 'transfer' | 'browse' | 'local' | 'admin';

interface EnvConfig {
  url: string;
  clientId: string;
  hasSecret: boolean;
  identityUrl?: string;
  username?: string;
  hasPassword?: boolean;
}

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

interface TransferState {
  step: TransferStep;
  transferId?: string;
  sourceEnv: string;
  targetEnv: string;
  itemPaths: string[];
  scope: 'SingleItem' | 'ItemAndDescendants';
  mergeStrategy: 'OverrideExistingItem' | 'KeepExistingItem' | 'OverrideExistingTree' | 'MergeItem' | 'Skip';
  raifFileName?: string;
  importTransferId?: string;
  totalItems?: number;
  transferredItems?: number;
  errors: string[];
  logs: string[];
}

interface SitecoreItem {
  id: string;
  name: string;
  path: string;
  templateId?: string;
  templateName?: string;
  fields?: Record<string, unknown>;
  children?: SitecoreItem[];
}

//Main Project
const ENVIRONMENTS = ['local', 'dev', 'qa', 'prod'];
const ENV_TO_KEY: Record<string, string> = { local: 'local', dev: 'dev', qa: 'qa', prod: 'prod' };

//Perficient Project
// const ENVIRONMENTS = ['starterkit - upgrade', 'starterkit - latest'];
// const ENV_TO_KEY: Record<string, string> = {
//   'starterkit - upgrade': 'dev',
//   'starterkit - latest': 'qa',
// };
const STEP_NAMES = ['Initiate', 'Package', 'Relay', 'Import', 'Verify'];
const STEP_KEYS: TransferStep[] = ['initiating', 'polling', 'relaying', 'consuming', 'verifying'];

export default function Home() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('browse');

  // Transfer state
  const [state, setState] = useState<TransferState>({
    step: 'config',
    sourceEnv: '',
    targetEnv: '',
    itemPaths: [],
    scope: 'ItemAndDescendants',
    mergeStrategy: 'OverrideExistingItem',
    errors: [],
    logs: [],
  });

  const [humanApproved, setHumanApproved] = useState(false);
  const [pathInput, setPathInput] = useState('');

  // Browse state
  const [browseEnv, setBrowseEnv] = useState(ENVIRONMENTS[0]);
  const [browsePath, setBrowsePath] = useState('');
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseError, setBrowseError] = useState<string | null>(null);
  const [currentItem, setCurrentItem] = useState<SitecoreItem | null>(null);
  const [itemChildren, setItemChildren] = useState<SitecoreItem[]>([]);

  // Local sync state
  const [localSourceEnv, setLocalSourceEnv] = useState('dev');
  const [localDatabase, setLocalDatabase] = useState<'master' | 'web'>('master');
  const [localItemPath, setLocalItemPath] = useState('');
  const [localIncludeDescendants, setLocalIncludeDescendants] = useState(true);
  const [localSyncStatus, setLocalSyncStatus] = useState<'idle' | 'syncing' | 'completed' | 'failed'>('idle');
  const [localSyncLogs, setLocalSyncLogs] = useState<string[]>([]);
  const [localSyncResult, setLocalSyncResult] = useState<{ transferred: number; failed: number } | null>(null);

  // Admin state
  const [envConfigs, setEnvConfigs] = useState<Record<string, EnvConfig>>({});
  const [connectionTests, setConnectionTests] = useState<Record<string, ConnectionTestResult>>({});
  const [testingEnv, setTestingEnv] = useState<string | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  // Sidebar state
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Handle responsive sidebar - close on mobile by default
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth <= 768) {
        setSidebarOpen(false);
      }
    };

    // Check on mount
    handleResize();

    // Listen for resize
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Scroll to top when changing tabs
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [activeTab]);

  const addLocalLog = (message: string) => {
    setLocalSyncLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  const startLocalSync = async () => {
    if (!localItemPath) {
      alert('Please enter an item path');
      return;
    }

    setLocalSyncStatus('syncing');
    setLocalSyncLogs([]);
    setLocalSyncResult(null);
    addLocalLog(`Starting sync: ${localSourceEnv.toUpperCase()} → LOCAL`);
    addLocalLog(`Database: ${localDatabase.toUpperCase()}${localDatabase === 'web' ? ' (Published content only)' : ''}`);
    addLocalLog(`Item: ${localItemPath}`);
    addLocalLog(`Include descendants: ${localIncludeDescendants}`);

    try {
      const res = await fetch('/api/transfer/direct', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEnv: localSourceEnv,
          targetEnv: 'local',
          database: localDatabase,
          itemPath: localItemPath,
          includeDescendants: localIncludeDescendants,
          forceSourceIds: false,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setLocalSyncStatus('completed');
        setLocalSyncResult({ transferred: data.transferred, failed: 0 });
        addLocalLog(`✅ Success: ${data.transferred} items synced to local`);
        if (data.created > 0) addLocalLog(`   Created: ${data.created} new items`);
        if (data.updated > 0) addLocalLog(`   Updated: ${data.updated} existing items`);
        addLocalLog('');
        addLocalLog('Note: IDs may differ from source. For ID preservation, use Sitecore CLI:');
        addLocalLog('  dotnet sitecore ser pull -n prod -i Demosite');
        addLocalLog('  dotnet sitecore ser push -n default -i Demosite');
      } else {
        setLocalSyncStatus('failed');
        setLocalSyncResult({ transferred: data.transferred || 0, failed: data.failed || 1 });
        if (data.transferred > 0) {
          addLocalLog(`⚠️ Partial success: ${data.transferred} synced, ${data.failed} failed`);
          if (data.created > 0) addLocalLog(`   Created: ${data.created} new items`);
          if (data.updated > 0) addLocalLog(`   Updated: ${data.updated} existing items`);
        } else {
          addLocalLog(`❌ Error: ${data.error || 'Transfer failed'}`);
        }
        if (data.errors) {
          addLocalLog(`Errors:`);
          data.errors.slice(0, 5).forEach((err: string) => addLocalLog(`  - ${err}`));
        }
      }
    } catch (error) {
      setLocalSyncStatus('failed');
      const msg = error instanceof Error ? error.message : String(error);
      addLocalLog(`❌ Error: ${msg}`);
    }
  };

  const resetLocalSync = () => {
    setLocalSyncStatus('idle');
    setLocalSyncLogs([]);
    setLocalSyncResult(null);
  };

  // Admin functions
  const loadEnvConfig = async () => {
    setConfigLoading(true);
    try {
      const res = await fetch('/api/admin/test-connection');
      const data = await res.json();
      if (data.success) {
        setEnvConfigs(data.config);
      }
    } catch (error) {
      console.error('Failed to load config:', error);
    } finally {
      setConfigLoading(false);
    }
  };

  const testConnection = async (env: string) => {
    setTestingEnv(env);
    try {
      const res = await fetch('/api/admin/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: env }),
      });
      const result = await res.json();
      setConnectionTests(prev => ({ ...prev, [env]: result }));
    } catch (error) {
      setConnectionTests(prev => ({
        ...prev,
        [env]: {
          success: false,
          environment: env,
          url: '',
          authMethod: '',
          error: error instanceof Error ? error.message : 'Unknown error',
        },
      }));
    } finally {
      setTestingEnv(null);
    }
  };

  const testAllConnections = async () => {
    setTestingEnv('all');
    try {
      const res = await fetch('/api/admin/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: 'all' }),
      });
      const data = await res.json();
      if (data.success && data.results) {
        const tests: Record<string, ConnectionTestResult> = {};
        data.results.forEach((result: ConnectionTestResult) => {
          tests[result.environment] = result;
        });
        setConnectionTests(tests);
      }
    } catch (error) {
      console.error('Failed to test connections:', error);
    } finally {
      setTestingEnv(null);
    }
  };

  const addLog = (message: string) => {
    setState(prev => ({
      ...prev,
      logs: [...prev.logs, `[${new Date().toLocaleTimeString()}] ${message}`],
    }));
  };

  const setStep = (step: TransferStep) => {
    setState(prev => ({ ...prev, step }));
  };

  const addPath = () => {
    if (pathInput && !state.itemPaths.includes(pathInput)) {
      setState(prev => ({
        ...prev,
        itemPaths: [...prev.itemPaths, pathInput],
      }));
      setPathInput('');
    }
  };

  const removePath = (path: string) => {
    setState(prev => ({
      ...prev,
      itemPaths: prev.itemPaths.filter(p => p !== path),
    }));
  };

  // Fetch content item
  const fetchItem = async () => {
    setBrowseLoading(true);
    setBrowseError(null);
    setCurrentItem(null);
    setItemChildren([]);

    try {
      const res = await fetch('/api/content/item', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: ENV_TO_KEY[browseEnv], path: browsePath }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setCurrentItem(data.item);
      if (data.children) setItemChildren(data.children);
    } catch (error) {
      setBrowseError(error instanceof Error ? error.message : 'Failed to fetch item');
    } finally {
      setBrowseLoading(false);
    }
  };

  // Fetch children
  const fetchChildren = async (itemId: string) => {
    setBrowseLoading(true);
    setBrowseError(null);

    try {
      const res = await fetch('/api/content/children', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ environment: ENV_TO_KEY[browseEnv], itemId }),
      });

      const data = await res.json();
      if (!data.success) throw new Error(data.error);

      setItemChildren(data.children || []);
    } catch (error) {
      setBrowseError(error instanceof Error ? error.message : 'Failed to fetch children');
    } finally {
      setBrowseLoading(false);
    }
  };

  const startTransfer = async () => {
    if (state.itemPaths.length === 0) {
      alert('Please add at least one item path');
      return;
    }

    setState(prev => ({ ...prev, step: 'initiating', errors: [], logs: [] }));
    addLog(`Starting transfer: ${state.sourceEnv.toUpperCase()} → ${state.targetEnv.toUpperCase()}`);

    try {
      // Step 1: Initiate
      addLog('Step 1: Initiating transfer...');
      const initRes = await fetch('/api/transfer/initiate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEnv: ENV_TO_KEY[state.sourceEnv],
          itemPaths: state.itemPaths,
          scope: state.scope,
          mergeStrategy: state.mergeStrategy,
        }),
      });

      const initData = await initRes.json();
      if (!initData.success) throw new Error(initData.error);

      setState(prev => ({ ...prev, transferId: initData.transferId }));
      addLog(`Transfer ID: ${initData.transferId}`);

      // Step 2: Poll
      setStep('polling');
      addLog('Step 2: Packaging content...');

      const pollRes = await fetch('/api/transfer/poll', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEnv: ENV_TO_KEY[state.sourceEnv],
          transferId: initData.transferId,
        }),
      });

      const pollData = await pollRes.json();
      if (!pollData.success) throw new Error(pollData.error);
      addLog(`Package ready: ${pollData.totalItems} items`);

      // Step 3: Relay
      setStep('relaying');
      addLog('Step 3: Transferring to target...');

      const relayRes = await fetch('/api/transfer/relay', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceEnv: ENV_TO_KEY[state.sourceEnv],
          targetEnv: ENV_TO_KEY[state.targetEnv],
          transferId: initData.transferId,
          humanApproved: humanApproved || ENV_TO_KEY[state.targetEnv] !== 'prod',
        }),
      });

      const relayData = await relayRes.json();
      if (!relayData.success) throw new Error(relayData.error);

      setState(prev => ({ ...prev, raifFileName: relayData.raifFileName }));
      addLog(`Transfer complete: ${relayData.raifFileName}`);

      // Step 4: Consume
      setStep('consuming');
      addLog('Step 4: Importing content...');

      const consumeRes = await fetch('/api/transfer/consume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetEnv: ENV_TO_KEY[state.targetEnv],
          blobName: relayData.raifFileName,
          mergeStrategy: state.mergeStrategy,
          itemPaths: state.itemPaths,
        }),
      });

      const consumeData = await consumeRes.json();
      if (!consumeData.success) throw new Error(consumeData.error);

      setState(prev => ({ ...prev, importTransferId: consumeData.importTransferId }));
      addLog(`Import started: ${consumeData.importTransferId}`);

      // Step 5: Verify
      setStep('verifying');
      addLog('Step 5: Verifying...');

      const verifyRes = await fetch('/api/transfer/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetEnv: ENV_TO_KEY[state.targetEnv],
          importTransferId: consumeData.importTransferId,
          database: consumeData.database || 'master',
        }),
      });

      const verifyData = await verifyRes.json();

      if (!verifyData.success) {
        setState(prev => ({
          ...prev,
          step: 'failed',
          errors: verifyData.errors || [verifyData.error],
        }));
        addLog(`❌ Failed: ${verifyData.error || 'See errors'}`);
        return;
      }

      setState(prev => ({
        ...prev,
        step: 'completed',
        totalItems: verifyData.totalItems,
        transferredItems: verifyData.transferredItems,
      }));
      addLog(`✅ Success: ${verifyData.transferredItems}/${verifyData.totalItems} items transferred`);

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      setState(prev => ({
        ...prev,
        step: 'failed',
        errors: [...prev.errors, msg],
      }));
      addLog(`❌ Error: ${msg}`);
    }
  };

  const reset = () => {
    setState({
      step: 'config',
      sourceEnv: '',
      targetEnv: '',
      itemPaths: [],
      scope: 'ItemAndDescendants',
      mergeStrategy: 'OverrideExistingItem',
      errors: [],
      logs: [],
    });
    setHumanApproved(false);
  };

  const currentStepIdx = STEP_KEYS.indexOf(state.step);

  return (
    <div className="app-layout">
      {/* Mobile Header */}
      <div className="mobile-header">
        <button className="mobile-hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
          <span></span>
          <span></span>
          <span></span>
        </button>
        <div className="mobile-logo">
          <svg viewBox="0 0 32 32" fill="currentColor">
            <path d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16 16-7.163 16-16S24.837 0 16 0zm0 28C9.373 28 4 22.627 4 16S9.373 4 16 4s12 5.373 12 12-5.373 12-12 12z"/>
            <path d="M16 8c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm0 12c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z"/>
          </svg>
          <span>SitecoreAI</span>
        </div>
        <span className="mobile-beta">Beta</span>
      </div>

      {/* Sidebar Overlay */}
      {sidebarOpen && <div className="sidebar-overlay" onClick={() => setSidebarOpen(false)} />}

      {/* Sidebar */}
      <aside className={`sidebar ${sidebarOpen ? 'open' : 'collapsed'}`}>
        <div className="sidebar-header">
          <div className="sidebar-logo">
            <svg viewBox="0 0 32 32" fill="currentColor">
              <path d="M16 0C7.163 0 0 7.163 0 16s7.163 16 16 16 16-7.163 16-16S24.837 0 16 0zm0 28C9.373 28 4 22.627 4 16S9.373 4 16 4s12 5.373 12 12-5.373 12-12 12z"/>
              <path d="M16 8c-4.418 0-8 3.582-8 8s3.582 8 8 8 8-3.582 8-8-3.582-8-8-8zm0 12c-2.209 0-4-1.791-4-4s1.791-4 4-4 4 1.791 4 4-1.791 4-4 4z"/>
            </svg>
            {sidebarOpen && <span>SitecoreAI</span>}
          </div>
          <button className="hamburger" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <span></span>
            <span></span>
            <span></span>
          </button>
        </div>

        <nav className="sidebar-nav">
          <button
            className={`nav-item ${activeTab === 'browse' ? 'active' : ''}`}
            onClick={() => { setActiveTab('browse'); if (window.innerWidth <= 768) setSidebarOpen(false); }}
            title="Browse Content"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
              <polyline points="9 22 9 12 15 12 15 22"/>
            </svg>
            {sidebarOpen && <span>Browse Content</span>}
          </button>
          <button
            className={`nav-item ${activeTab === 'transfer' ? 'active' : ''}`}
            onClick={() => { setActiveTab('transfer'); if (window.innerWidth <= 768) setSidebarOpen(false); }}
            title="Content Transfer"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="17 1 21 5 17 9"/>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
              <polyline points="7 23 3 19 7 15"/>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
            </svg>
            {sidebarOpen && <span>Content Transfer</span>}
          </button>
          <button
            className={`nav-item ${activeTab === 'local' ? 'active' : ''}`}
            onClick={() => { setActiveTab('local'); if (window.innerWidth <= 768) setSidebarOpen(false); }}
            title="Local Sync"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="2" y="3" width="20" height="14" rx="2" ry="2"/>
              <line x1="8" y1="21" x2="16" y2="21"/>
              <line x1="12" y1="17" x2="12" y2="21"/>
            </svg>
            {sidebarOpen && <span>Local Sync</span>}
          </button>
          <button
            className={`nav-item ${activeTab === 'admin' ? 'active' : ''}`}
            onClick={() => { setActiveTab('admin'); loadEnvConfig(); if (window.innerWidth <= 768) setSidebarOpen(false); }}
            title="Settings"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"/>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
            </svg>
            {sidebarOpen && <span>Settings</span>}
          </button>
        </nav>

        <div className="sidebar-footer">
          <div className="sidebar-status">
            <span className="status-dot"></span>
            {sidebarOpen && <span>Connected</span>}
          </div>
          {sidebarOpen && (
            <div className="sidebar-version-info">
              <span className="sidebar-version">v2.0.0</span>
              <span className="sidebar-beta">Beta</span>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="main-content">

        {activeTab === 'browse' && (
          <>
          <div className="page-header">
            <h1>Browse Content</h1>
            <p>Explore and navigate Sitecore content items across environments</p>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 style={{ margin: 0 }}>Content Browser</h2>
            </div>

            <div className="grid grid-3 mb-2">
              <div className="form-group">
                <label>Environment</label>
                <select value={browseEnv} onChange={e => setBrowseEnv(e.target.value)}>
                  {ENVIRONMENTS.map(env => (
                    <option key={env} value={env}>{env.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div className="form-group" style={{ gridColumn: 'span 2' }}>
                <label>Item Path or GUID</label>
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={browsePath}
                    onChange={e => setBrowsePath(e.target.value)}
                    placeholder="/sitecore/content/Home"
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-primary" onClick={fetchItem} disabled={browseLoading}>
                    {browseLoading ? 'Loading...' : 'Fetch'}
                  </button>
                </div>
              </div>
            </div>

            {browseError && (
              <div className="alert alert-danger">{browseError}</div>
            )}

            {currentItem && (
              <div className="mt-2">
                <div className="card" style={{ background: '#fafafa' }}>
                  <h3>Item Details</h3>
                  <table className="table">
                    <tbody>
                      <tr>
                        <td style={{ width: '150px', fontWeight: 500 }}>Name</td>
                        <td>{currentItem.name}</td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 500 }}>Path</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{currentItem.path}</td>
                      </tr>
                      <tr>
                        <td style={{ fontWeight: 500 }}>ID</td>
                        <td style={{ fontFamily: 'monospace', fontSize: '0.875rem' }}>{currentItem.id}</td>
                      </tr>
                      {currentItem.templateName && (
                        <tr>
                          <td style={{ fontWeight: 500 }}>Template</td>
                          <td>{currentItem.templateName}</td>
                        </tr>
                      )}
                    </tbody>
                  </table>

                  {currentItem.fields && Object.keys(currentItem.fields).length > 0 && (
                    <>
                      <h3 className="mt-2">Fields</h3>
                      <table className="table">
                        <thead>
                          <tr>
                            <th>Field Name</th>
                            <th>Value</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Object.entries(currentItem.fields).map(([key, value]) => (
                            <tr key={key}>
                              <td style={{ fontWeight: 500 }}>{key}</td>
                              <td style={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </>
                  )}

                  <div className="flex gap-1 mt-2">
                    <button
                      className="btn btn-outline"
                      onClick={() => {
                        setState(prev => ({
                          ...prev,
                          itemPaths: prev.itemPaths.includes(currentItem.path)
                            ? prev.itemPaths
                            : [...prev.itemPaths, currentItem.path],
                        }));
                        setActiveTab('transfer');
                      }}
                    >
                      Add to Transfer
                    </button>
                    {currentItem.id && (
                      <button
                        className="btn btn-secondary"
                        onClick={() => fetchChildren(currentItem.id)}
                        disabled={browseLoading}
                      >
                        Load Children
                      </button>
                    )}
                  </div>
                </div>

                {itemChildren.length > 0 && (
                  <div className="mt-2">
                    <h3>Children ({itemChildren.length})</h3>
                    <div className="tree-view">
                      {itemChildren.map(child => (
                        <div
                          key={child.id}
                          className="tree-item"
                          onClick={() => {
                            setBrowsePath(child.path || child.id);
                            fetchItem();
                          }}
                        >
                          <span className="tree-item-icon">📄</span>
                          <span className="tree-item-name">{child.name}</span>
                          <span className="tree-item-path">{child.path}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
          </>
        )}

        {activeTab === 'transfer' && state.step === 'config' && (
          <>
          <div className="page-header">
            <h1>Content Transfer</h1>
            <p>Transfer content between cloud environments with full ID preservation</p>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 style={{ margin: 0 }}>Transfer Configuration</h2>
            </div>

            <div className="grid grid-2 mb-2">
              <div className="form-group">
                <label>Source Environment</label>
                <select
                  value={state.sourceEnv}
                  onChange={e => setState(prev => ({ ...prev, sourceEnv: e.target.value }))}
                >
                  <option value="">Select source...</option>
                  {ENVIRONMENTS.filter(env => env !== 'local').map(env => (
                    <option key={env} value={env}>{env.toUpperCase()}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Target Environment</label>
                <select
                  value={state.targetEnv}
                  onChange={e => setState(prev => ({ ...prev, targetEnv: e.target.value }))}
                >
                  <option value="">Select target...</option>
                  {ENVIRONMENTS.filter(env => env !== 'local').map(env => (
                    <option key={env} value={env}>{env.toUpperCase()}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-group">
              <label>Item Paths</label>
              <div className="flex gap-1 mb-1">
                <input
                  type="text"
                  value={pathInput}
                  onChange={e => setPathInput(e.target.value)}
                  placeholder="/sitecore/content/Home"
                  onKeyDown={e => e.key === 'Enter' && addPath()}
                  style={{ flex: 1 }}
                />
                <button className="btn btn-secondary" onClick={addPath}>Add Path</button>
              </div>
              <div className="flex gap-1 flex-wrap">
                {state.itemPaths.map(path => (
                  <span key={path} className="tag">
                    {path}
                    <button className="tag-remove" onClick={() => removePath(path)}>×</button>
                  </span>
                ))}
              </div>
            </div>

            <div className="grid grid-2 mb-2">
              <div className="form-group">
                <label>Scope</label>
                <select
                  value={state.scope}
                  onChange={e => setState(prev => ({ ...prev, scope: e.target.value as typeof state.scope }))}
                >
                  <option value="SingleItem">Item Only</option>
                  <option value="ItemAndDescendants">Item and Descendants</option>
                </select>
                {state.scope === 'SingleItem' && (
                  <div className="alert alert-warning mt-1" style={{ padding: '0.5rem', fontSize: '0.875rem' }}>
                    ⚠️ Parent items must exist on target with matching IDs
                  </div>
                )}
              </div>
              <div className="form-group">
                <label>Merge Strategy</label>
                <select
                  value={state.mergeStrategy}
                  onChange={e => setState(prev => ({ ...prev, mergeStrategy: e.target.value as typeof state.mergeStrategy }))}
                >
                  <option value="OverrideExistingItem">Override Existing Item</option>
                  <option value="KeepExistingItem">Keep Existing Item</option>
                  <option value="OverrideExistingTree">Override Existing Tree</option>
                  <option value="MergeItem">Merge Item Fields</option>
                  <option value="Skip">Skip Existing Items</option>
                </select>
                <div className="mt-1" style={{ fontSize: '0.75rem', color: 'var(--sitecore-gray)' }}>
                  {state.mergeStrategy === 'OverrideExistingItem' && 'Replace existing items with transferred items'}
                  {state.mergeStrategy === 'KeepExistingItem' && 'Keep existing items, only add new ones'}
                  {state.mergeStrategy === 'OverrideExistingTree' && 'Replace entire tree structure on target'}
                  {state.mergeStrategy === 'MergeItem' && 'Merge fields from source into existing items'}
                  {state.mergeStrategy === 'Skip' && 'Skip items that already exist on target'}
                </div>
              </div>

            </div>

            {ENV_TO_KEY[state.targetEnv] === 'prod' && (
              <div className="alert alert-warning mb-2">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={humanApproved}
                    onChange={e => setHumanApproved(e.target.checked)}
                  />
                  <strong>I approve this transfer to PRODUCTION</strong>
                </label>
                <p style={{ margin: '0.5rem 0 0', fontSize: '0.875rem' }}>
                  Production transfers require explicit human approval
                </p>
              </div>
            )}

            <button
              className="btn btn-primary"
              onClick={startTransfer}
              disabled={!state.sourceEnv || !state.targetEnv || state.sourceEnv === state.targetEnv || (ENV_TO_KEY[state.targetEnv] === 'prod' && !humanApproved)}
              style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}
            >
              {state.sourceEnv && state.targetEnv
                ? `Start Transfer: ${state.sourceEnv.toUpperCase()} → ${state.targetEnv.toUpperCase()}`
                : 'Select Source and Target Environments'}
            </button>
            {state.sourceEnv && state.targetEnv && state.sourceEnv === state.targetEnv && (
              <p className="mt-1" style={{ color: 'var(--danger)', textAlign: 'center', fontSize: '0.875rem' }}>
                Source and target environments cannot be the same
              </p>
            )}
          </div>
          </>
        )}

        {activeTab === 'transfer' && state.step !== 'config' && (
          <>
          <div className="page-header">
            <h1>Content Transfer</h1>
            <p>Transfer in progress...</p>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 style={{ margin: 0 }}>Transfer Progress</h2>
              <span className={`status ${state.step === 'completed' ? 'status-success' : state.step === 'failed' ? 'status-danger' : 'status-info'}`}>
                {state.step}
              </span>
            </div>

            <div className="progress-steps">
              {STEP_NAMES.map((name, idx) => {
                const isActive = currentStepIdx === idx;
                const isComplete = currentStepIdx > idx || state.step === 'completed';
                const isFailed = state.step === 'failed' && currentStepIdx === idx;

                return (
                  <div key={name} className={`progress-step ${isActive ? 'active' : ''} ${isComplete ? 'completed' : ''} ${isFailed ? 'failed' : ''}`}>
                    <div className="progress-step-circle">
                      {isComplete ? '✓' : isFailed ? '✕' : idx + 1}
                    </div>
                    <div className="progress-step-label">{name}</div>
                  </div>
                );
              })}
            </div>

            {state.step === 'completed' && (
              <div className="alert alert-success">
                <strong>✅ Transfer Complete</strong>
                <p style={{ margin: '0.5rem 0 0' }}>
                  Successfully transferred {state.transferredItems} of {state.totalItems} items
                  from {state.sourceEnv.toUpperCase()} to {state.targetEnv.toUpperCase()}
                </p>
              </div>
            )}

            {state.step === 'failed' && (
              <div className="alert alert-danger">
                <strong>❌ Transfer Failed</strong>
                {state.errors.map((err, i) => (
                  <p key={i} style={{ margin: '0.25rem 0 0' }}>{err}</p>
                ))}
              </div>
            )}

            <h3>Activity Log</h3>
            <div className="console">
              {state.logs.map((log, i) => (
                <div key={i} className={log.includes('✅') ? 'console-success' : log.includes('❌') ? 'console-error' : ''}>
                  {log}
                </div>
              ))}
              {!['completed', 'failed'].includes(state.step) && (
                <div className="console-info">Processing...</div>
              )}
            </div>

            {['completed', 'failed'].includes(state.step) && (
              <button className="btn btn-secondary mt-2" onClick={reset}>
                Start New Transfer
              </button>
            )}
          </div>
          </>
        )}

        {activeTab === 'local' && (
          <>
          <div className="page-header">
            <h1>Local Sync</h1>
            <p>Sync content from cloud environments to your local Docker instance</p>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 style={{ margin: 0 }}>Local Sync</h2>
              <span className="status status-info">Direct API Transfer</span>
            </div>

            {localSyncStatus === 'idle' && (
              <>
                <p style={{ color: 'var(--sitecore-gray)', marginBottom: '1.5rem' }}>
                  Sync content from cloud environments directly to your local Docker instance.
                  Uses Item Service API - no Azure Blob Storage required.
                </p>

                <div className="grid grid-3 mb-2">
                  <div className="form-group">
                    <label>Source Environment</label>
                    <select
                      value={localSourceEnv}
                      onChange={e => setLocalSourceEnv(e.target.value)}
                    >
                      <option value="dev">DEV</option>
                      <option value="qa">QA</option>
                      <option value="prod">PROD</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Source Database</label>
                    <select
                      value={localDatabase}
                      onChange={e => setLocalDatabase(e.target.value as 'master' | 'web')}
                    >
                      <option value="master">Master (All content)</option>
                      <option value="web">Web (Published only)</option>
                    </select>
                  </div>
                  <div className="form-group">
                    <label>Target</label>
                    <input type="text" value="LOCAL (Docker)" disabled style={{ background: '#f5f5f5' }} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Item Path</label>
                  <input
                    type="text"
                    value={localItemPath}
                    onChange={e => setLocalItemPath(e.target.value)}
                    placeholder="/sitecore/content/Home"
                  />
                </div>

                <div className="form-group">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={localIncludeDescendants}
                      onChange={e => setLocalIncludeDescendants(e.target.checked)}
                    />
                    Include descendants (child items)
                  </label>
                </div>

                <div className="alert alert-warning" style={{ marginTop: '1rem' }}>
                  <strong>Note:</strong> This sync copies content but does NOT preserve item IDs.
                  For ID preservation (serialization compatibility), use Sitecore CLI:
                  <code style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.75rem', background: 'rgba(0,0,0,0.05)', padding: '0.5rem', borderRadius: '4px', whiteSpace: 'pre-wrap' }}>
                    dotnet sitecore ser pull -n prod -i Demosite{'\n'}
                    dotnet sitecore ser push -n default -i Demosite
                  </code>
                </div>

                <button
                  className="btn btn-primary"
                  onClick={startLocalSync}
                  style={{ width: '100%', padding: '0.875rem', fontSize: '1rem' }}
                >
                  Sync to Local: {localSourceEnv.toUpperCase()} → LOCAL
                </button>
              </>
            )}

            {localSyncStatus !== 'idle' && (
              <>
                {localSyncStatus === 'completed' && localSyncResult && (
                  <div className="alert alert-success">
                    <strong>✅ Sync Complete</strong>
                    <p style={{ margin: '0.5rem 0 0' }}>
                      Successfully synced {localSyncResult.transferred} items to local
                    </p>
                  </div>
                )}

                {localSyncStatus === 'failed' && (
                  <div className="alert alert-danger">
                    <strong>❌ Sync Failed</strong>
                    <p style={{ margin: '0.5rem 0 0' }}>Check the logs below for details</p>
                  </div>
                )}

                <h3>Activity Log</h3>
                <div className="console">
                  {localSyncLogs.map((log, i) => (
                    <div key={i} className={log.includes('✅') ? 'console-success' : log.includes('❌') ? 'console-error' : ''}>
                      {log}
                    </div>
                  ))}
                  {localSyncStatus === 'syncing' && (
                    <div className="console-info">Syncing...</div>
                  )}
                </div>

                {['completed', 'failed'].includes(localSyncStatus) && (
                  <button className="btn btn-secondary mt-2" onClick={resetLocalSync}>
                    Start New Sync
                  </button>
                )}
              </>
            )}
          </div>
          </>
        )}

        {activeTab === 'admin' && (
          <>
          <div className="page-header">
            <h1>Settings</h1>
            <p>Configure environment connections and test connectivity</p>
          </div>
          <div className="card">
            <div className="card-header">
              <h2 style={{ margin: 0 }}>Environment Settings</h2>
              <button
                className="btn btn-primary"
                onClick={testAllConnections}
                disabled={testingEnv === 'all'}
                style={{ padding: '0.5rem 1rem' }}
              >
                {testingEnv === 'all' ? 'Testing...' : 'Test All Connections'}
              </button>
            </div>

            {configLoading ? (
              <p>Loading configuration...</p>
            ) : (
              <div className="env-grid">
                {['dev', 'qa', 'prod', 'local'].map(env => {
                  const config = envConfigs[env];
                  const test = connectionTests[env];
                  const isTesting = testingEnv === env || testingEnv === 'all';

                  return (
                    <div key={env} className="env-card">
                      <div className="env-card-header">
                        <h3>{env.toUpperCase()}</h3>
                        {test && (
                          <span className={`status ${test.success ? 'status-success' : 'status-danger'}`}>
                            {test.success ? 'Connected' : 'Failed'}
                          </span>
                        )}
                      </div>

                      <div className="env-card-body">
                        <div className="env-field">
                          <label>URL</label>
                          <input
                            type="text"
                            value={config?.url || ''}
                            readOnly
                            style={{ background: '#f5f5f5' }}
                          />
                        </div>

                        {env === 'local' && (
                          <div className="env-field">
                            <label>Identity URL</label>
                            <input
                              type="text"
                              value={config?.identityUrl || ''}
                              readOnly
                              style={{ background: '#f5f5f5' }}
                            />
                          </div>
                        )}

                        <div className="env-field">
                          <label>Client ID</label>
                          <input
                            type="text"
                            value={config?.clientId || ''}
                            readOnly
                            style={{ background: '#f5f5f5' }}
                          />
                        </div>

                        <div className="env-field">
                          <label>Client Secret</label>
                          <input
                            type="password"
                            value={config?.hasSecret ? '••••••••••••' : ''}
                            readOnly
                            style={{ background: '#f5f5f5' }}
                          />
                        </div>

                        {env === 'local' && (
                          <>
                            <div className="env-field">
                              <label>Username</label>
                              <input
                                type="text"
                                value={config?.username || ''}
                                readOnly
                                style={{ background: '#f5f5f5' }}
                              />
                            </div>
                            <div className="env-field">
                              <label>Password</label>
                              <input
                                type="password"
                                value={config?.hasPassword ? '••••••••' : ''}
                                readOnly
                                style={{ background: '#f5f5f5' }}
                              />
                            </div>
                          </>
                        )}

                        {test && (
                          <div className={`env-test-result ${test.success ? 'success' : 'error'}`}>
                            {test.success ? (
                              <>
                                <div>Auth: {test.authMethod}</div>
                                <div>Response: {test.responseTime}ms</div>
                              </>
                            ) : (
                              <div className="error-text">{test.error}</div>
                            )}
                          </div>
                        )}
                      </div>

                      <div className="env-card-footer">
                        <button
                          className="btn btn-secondary"
                          onClick={() => testConnection(env)}
                          disabled={isTesting}
                          style={{ width: '100%' }}
                        >
                          {isTesting ? 'Testing...' : 'Test Connection'}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="alert alert-warning mt-2">
              <strong>Note:</strong> Environment credentials are configured in <code>.env.local</code> file.
              Changes require server restart.
            </div>
          </div>
          </>
        )}
      </main>
    </div>
  );
}
