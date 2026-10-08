# SitecoreAI Content Transfer Agent

An AI-powered Next.js application for transferring content between Sitecore XM Cloud environments using the modern Content Transfer API and Item Service API. Features a responsive sidebar navigation, environment management, and support for both cloud-to-cloud and cloud-to-local transfers.

**Version: 2.0.0 Beta**

> **L2 Capstone — Option 4: AI Case Study**
> 
> See [CASE_STUDY.md](./CASE_STUDY.md) for the complete submission, [REFLECTION.md](./REFLECTION.md) for detailed analysis, and [EVALUATION_CRITERIA.md](./EVALUATION_CRITERIA.md) for success metrics.

## Features

### Content Browser
- Browse Sitecore content tree across all environments (DEV, QA, PROD, LOCAL)
- View item details, fields, and children
- One-click "Add to Transfer" functionality

### Content Transfer (Cloud-to-Cloud)
- Transfer content between cloud environments (DEV, QA, PROD)
- Uses Sitecore Content Transfer API with RAIF packages
- Preserves item IDs during transfer
- Configurable merge strategies (Override, Keep, Merge, Skip)
- Human approval gate for production transfers
- 5-step transfer process with progress tracking

### Local Sync (Cloud-to-Local)
- Sync content from cloud environments to local Docker instance
- Uses Direct Item Service API (no Azure Blob Storage required)
- Database selection: Master (all content) or Web (published only)
- Ideal for local development and testing

### Settings (Admin Panel)
- View environment configurations
- Test connections to all environments
- Verify API credentials and connectivity

## Quick Start

### Prerequisites

- Node.js 18+ 
- npm or yarn
- Sitecore XM Cloud environments with API credentials (OAuth client credentials)
- (Optional) Local Sitecore XM Cloud Docker instance for Local Sync

### Installation

```bash
# Clone and install
git clone <repository-url>
cd sitecoreai-content-agent
npm install

# Configure environment
cp .env.example .env.local
```

### Environment Configuration

Edit `.env.local` with your credentials:

```env
# Portkey Gateway (for LLM access)
PORTKEY_GATEWAY_URL=https://portkeygateway.yourorganization.com/v1
PORTKEY_API_KEY=your_portkey_api_key
PORTKEY_PROVIDER=@aws-bedrock-use2
ANTHROPIC_MODEL=us.anthropic.claude-sonnet-4-5-20250929-v1:0

# Sitecore XM Cloud - DEV Environment
SITECORE_DEV_URL=https://xmc-your-dev-instance.sitecorecloud.io
SITECORE_DEV_CLIENT_ID=your_dev_client_id
SITECORE_DEV_CLIENT_SECRET=your_dev_client_secret

# Sitecore XM Cloud - QA Environment
SITECORE_QA_URL=https://xmc-your-qa-instance.sitecorecloud.io
SITECORE_QA_CLIENT_ID=your_qa_client_id
SITECORE_QA_CLIENT_SECRET=your_qa_client_secret

# Sitecore XM Cloud - PROD Environment
SITECORE_PROD_URL=https://xmc-your-prod-instance.sitecorecloud.io
SITECORE_PROD_CLIENT_ID=your_prod_client_id
SITECORE_PROD_CLIENT_SECRET=your_prod_client_secret

# Local Docker Environment
SITECORE_LOCAL_URL=https://xmcloudcm.localhost
SITECORE_LOCAL_IDENTITY_URL=https://id.localhost
SITECORE_LOCAL_CLIENT_ID=SitecorePassword
SITECORE_LOCAL_CLIENT_SECRET=SitecorePassword
SITECORE_LOCAL_USERNAME=admin
SITECORE_LOCAL_PASSWORD=b
```

**How to get Sitecore credentials:**
1. Go to Sitecore Cloud Portal → XM Cloud Deploy → Credentials → Environment
2. Create credentials by selecting the Automation option
3. Copy Client ID and Client Secret

---

## Running the Application

```bash
# Development mode (with hot reload)
npm run dev

# Production build
npm run build
npm run start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## User Interface

### Sidebar Navigation
The application features a collapsible left sidebar with:
- **Browse Content** - Explore Sitecore content tree
- **Content Transfer** - Transfer between cloud environments
- **Local Sync** - Sync cloud content to local Docker
- **Settings** - Environment configuration and connection testing

The sidebar:
- Collapses to icon-only view on desktop
- Slides in as overlay on mobile devices
- Shows connection status and version info

### Mobile Support
- Responsive design for all screen sizes
- Mobile header with hamburger menu
- Touch-friendly navigation
- Auto-close sidebar after navigation on mobile

---

## Content Transfer (Cloud-to-Cloud)

Transfer content between cloud environments with full ID preservation.

### How It Works
1. **Select Source & Target** - Choose from DEV, QA, or PROD
2. **Add Item Paths** - Specify items to transfer
3. **Configure Options**:
   - Scope: Single Item or Item and Descendants
   - Merge Strategy: Override, Keep, Merge, or Skip
4. **Approve** - Required for production targets
5. **Execute** - 5-step transfer process:
   - Initiate → Package → Relay → Import → Verify

### Fields Transferred
All Sitecore fields are transferred including:
- Custom template fields
- Appearance fields (`__Sortorder`, `__Display name`, `__Hidden`, etc.)
- Publishing fields (`__Publish`, `__Unpublish`, `__Valid from`, etc.)
- Workflow fields (`__Workflow`, `__Workflow state`)
- Layout fields (`__Renderings`, `__Final Renderings`)

---

## Local Sync (Cloud-to-Local)

Sync content from cloud environments to your local Docker instance.

### How It Works
1. **Select Source** - Choose DEV, QA, or PROD
2. **Select Database** - Master (all content) or Web (published only)
3. **Enter Item Path** - Path to sync
4. **Include Descendants** - Optional
5. **Execute** - Direct API transfer

### Important Notes
- Uses Item Service API (Direct transfer)
- **Does NOT preserve item IDs** - Sitecore generates new IDs on create
- For ID preservation, use Sitecore CLI:
  ```bash
  dotnet sitecore ser pull -n prod -i HAPSite
  dotnet sitecore ser push -n default -i HAPSite
  ```

### Local Environment Setup
Ensure your local Docker instance is running and accessible at the configured URL (default: `https://xmcloudcm.localhost`).

---

## Settings (Admin Panel)

### Environment Cards
View configuration for each environment:
- URL
- Client ID
- Secret status (configured/not configured)

### Connection Testing
- **Test Connection** - Test individual environment
- **Test All Connections** - Test all environments at once
- Shows: Auth method, response time, success/failure status

---

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| `/api/content/item` | POST | Fetch item details via GraphQL |
| `/api/content/children` | POST | Fetch item children |
| `/api/transfer/initiate` | POST | Start content transfer package |
| `/api/transfer/poll` | POST | Poll transfer status |
| `/api/transfer/relay` | POST | Relay chunks to target |
| `/api/transfer/consume` | POST | Import on target environment |
| `/api/transfer/verify` | POST | Verify import completion |
| `/api/transfer/direct` | POST | Direct API transfer (Local Sync) |
| `/api/transfer/local-import` | POST | Local import with fallback |
| `/api/admin/test-connection` | GET/POST | Environment configuration and testing |

---

## MCP Server

The MCP server enables AI-assisted content transfers via Claude Code CLI, Claude Desktop, or IDE integration.

### Option 1: Claude Code CLI (Recommended)

The project includes a pre-configured `.claude/settings.json`. When you open this project in Claude Code CLI, the MCP server is automatically available.

```bash
# Navigate to project and start Claude Code
cd C:\Projects\sitecoreai-content-agent
claude
```

Use `/mcp` command to verify the server is connected. Then ask Claude to use Sitecore tools directly:
- "Transfer content from dev to qa at /sitecore/content/Home"
- "Get item details for /sitecore/content/MySite"

### Option 2: Claude Desktop

Add to your Claude Desktop config (`%APPDATA%\Claude\claude_desktop_config.json` on Windows):

```json
{
  "mcpServers": {
    "sitecore-xmcloud-transfer": {
      "command": "node",
      "args": [
        "C:\\Projects\\sitecoreai-content-agent\\node_modules\\tsx\\dist\\cli.mjs",
        "C:\\Projects\\sitecoreai-content-agent\\src\\mcp\\server.ts"
      ],
      "cwd": "C:\\Projects\\sitecoreai-content-agent"
    }
  }
}
```

### Manual Start (for debugging)
```bash
npm run mcp:server
```

### Available Tools
| Tool | Purpose |
|------|---------|
| `get_item` | Fetch item details by path |
| `transfer_initiate` | Start content transfer |
| `transfer_poll_status` | Wait for packaging |
| `transfer_relay_chunks` | Send chunks to target |
| `transfer_consume` | Import on target |
| `transfer_verify` | Confirm completion |
| `transfer_cleanup` | Remove transfer package |

---

## Testing

### Run All Tests
```bash
npm test
npm run test:ui  # With UI
```

### Test Results
```
 ✓ tests/human-gate.test.ts (9 tests)
 ✓ tests/evaluation.test.ts (22 tests)
 ✓ tests/agent.test.ts (15 tests)

 Test Files  3 passed (3)
      Tests  46 passed (46)
```

---

## Project Structure

```
sitecoreai-content-agent/
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── content/          # Content browsing
│   │   │   │   ├── item/
│   │   │   │   └── children/
│   │   │   ├── transfer/         # Transfer workflows
│   │   │   │   ├── initiate/
│   │   │   │   ├── poll/
│   │   │   │   ├── relay/
│   │   │   │   ├── consume/
│   │   │   │   ├── verify/
│   │   │   │   ├── direct/       # Direct API transfer
│   │   │   │   └── local-import/ # Local import
│   │   │   ├── admin/            # Admin endpoints
│   │   │   │   └── test-connection/
│   │   │   └── traces/
│   │   ├── page.tsx              # Main UI with sidebar
│   │   ├── globals.css           # Styles (responsive)
│   │   └── layout.tsx
│   ├── lib/
│   │   ├── agent.ts              # Transfer agent
│   │   ├── sitecore-api.ts       # API helpers
│   │   ├── sitecore-client.ts    # API client
│   │   ├── memory.ts             # Session memory
│   │   ├── human-gate.ts         # Approval system
│   │   ├── observability.ts      # Tracing
│   │   └── tools/                # Agent tools
│   ├── mcp/
│   │   └── server.ts             # MCP server
│   └── evaluation/               # LLM evaluation
├── tests/
├── .env.example
└── README.md
```

---

## Troubleshooting

### "Cannot find module" error
```bash
rm -rf .next
npm run dev
```

### "Port 3000 is in use"
Kill the process or the app will auto-select port 3001.

### "Item not found"
- Verify the path exists in the selected environment
- Start at `/sitecore/content` and browse down

### Local Sync fails
- Ensure local Docker containers are running
- Check `https://xmcloudcm.localhost` is accessible
- Verify local credentials in `.env.local`

### Connection test fails
- Verify Client ID and Secret are correct
- Check environment URL is accessible
- For local: ensure Identity Server is running at configured URL

### IDs don't match after Local Sync
- This is expected - Direct API cannot preserve IDs
- Use Sitecore CLI for ID preservation:
  ```bash
  cd C:/Projects/HAP/XMCloudCode
  dotnet sitecore ser pull -n prod -i HAPSite -i HAPProject
  dotnet sitecore ser push -n default -i HAPSite
  ```

---

## Changelog

### v2.0.0 (Beta)
- **UI Redesign**: Left sidebar navigation with hamburger menu
- **Mobile Support**: Fully responsive design
- **Settings Panel**: Environment configuration and connection testing
- **Local Sync**: New feature for cloud-to-local transfers
- **Field Handling**: All Sitecore fields now transferred (including `__Sortorder`)
- **Removed**: Risky "Delete before import" option
- **Improved**: Error handling and user feedback

### v1.0.0
- Initial release with Content Browser and Content Transfer

---

## License

MIT
