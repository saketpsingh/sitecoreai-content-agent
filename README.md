<p align="center">
  <img src="https://img.shields.io/badge/Sitecore-XM%20Cloud-eb1f1f?style=for-the-badge&logo=sitecore&logoColor=white" alt="Sitecore XM Cloud"/>
  <img src="https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js&logoColor=white" alt="Next.js 14"/>
  <img src="https://img.shields.io/badge/LangGraph-AI%20Agent-blue?style=for-the-badge&logo=chainlink&logoColor=white" alt="LangGraph"/>
  <img src="https://img.shields.io/badge/MCP-Protocol-purple?style=for-the-badge" alt="MCP"/>
  <img src="https://img.shields.io/badge/TypeScript-5.4-3178c6?style=for-the-badge&logo=typescript&logoColor=white" alt="TypeScript"/>
</p>

<h1 align="center">
  SitecoreAI Content Agent
</h1>

<h4 align="center">AI-powered content migration tool for Sitecore XM Cloud with intelligent automation and safety controls.</h4>

<p align="center">
  <a href="#-key-features">Key Features</a> •
  <a href="#-architecture">Architecture</a> •
  <a href="#-quick-start">Quick Start</a> •
  <a href="#-usage">Usage</a> •
  <a href="#-api-reference">API</a> •
  <a href="#-mcp-server">MCP Server</a> •
  <a href="#-tech-stack">Tech Stack</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-2.0.0--beta-blue" alt="Version"/>
  <img src="https://img.shields.io/badge/tests-46%20passed-success" alt="Tests"/>
  <img src="https://img.shields.io/badge/license-MIT-green" alt="License"/>
</p>

---

## ✨ Key Features

<table>
<tr>
<td>

### 🔄 Cloud-to-Cloud Transfer
Full content migration between XM Cloud environments with **ID preservation** using Sitecore's Item Transfer API

</td>
<td>

### 🖥️ Local Sync
Direct API transfer from cloud to local Docker instances for rapid development workflows

</td>
</tr>
<tr>
<td>

### 🤖 AI Agent
LangGraph-powered autonomous agent with intelligent transfer decisions and automatic error recovery

</td>
<td>

### 🛡️ Human Gate
Mandatory approval workflow for production deployments — safety first, always

</td>
</tr>
<tr>
<td>

### 📊 Real-time Progress
Live transfer status with visual 5-step pipeline: Initiate → Package → Relay → Import → Verify

</td>
<td>

### 🔌 MCP Protocol
Model Context Protocol server for seamless LLM integration with Claude Desktop & IDE

</td>
</tr>
</table>

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        SitecoreAI Content Agent                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│   ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │
│   │   Next.js   │    │  LangGraph  │    │ MCP Server  │                │
│   │   Web UI    │◄──►│   Agent     │◄──►│  (stdio)    │                │
│   └──────┬──────┘    └──────┬──────┘    └──────┬──────┘                │
│          │                  │                  │                        │
│          ▼                  ▼                  ▼                        │
│   ┌─────────────────────────────────────────────────────┐              │
│   │                    Core Services                     │              │
│   │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────┐ │              │
│   │  │ Sitecore │ │  Human   │ │  Memory  │ │ Trace  │ │              │
│   │  │  Client  │ │   Gate   │ │  Store   │ │ Export │ │              │
│   │  └────┬─────┘ └──────────┘ └──────────┘ └────────┘ │              │
│   └───────┼─────────────────────────────────────────────┘              │
│           │                                                             │
│           ▼                                                             │
│   ┌─────────────────────────────────────────────────────┐              │
│   │              Sitecore XM Cloud APIs                  │              │
│   │     DEV ──── QA ──── STAGING ──── PROD ──── LOCAL   │              │
│   └─────────────────────────────────────────────────────┘              │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🚀 Quick Start

### Prerequisites

```bash
Node.js 18+  •  npm or yarn  •  Sitecore XM Cloud API access
```

### Installation

```bash
# Clone the repository
git clone https://github.com/saketpsingh/sitecoreai-content-agent.git
cd sitecoreai-content-agent

# Install dependencies
npm install

# Configure environment
cp .env.example .env.local
```

### Configuration

Create `.env.local` with your credentials:

```env
# Sitecore Cloud Environments
SITECORE_DEV_URL=https://xmc-your-dev.sitecorecloud.io
SITECORE_DEV_CLIENT_ID=your-client-id
SITECORE_DEV_CLIENT_SECRET=your-client-secret

SITECORE_QA_URL=https://xmc-your-qa.sitecorecloud.io
SITECORE_QA_CLIENT_ID=your-client-id
SITECORE_QA_CLIENT_SECRET=your-client-secret

SITECORE_PROD_URL=https://xmc-your-prod.sitecorecloud.io
SITECORE_PROD_CLIENT_ID=your-client-id
SITECORE_PROD_CLIENT_SECRET=your-client-secret

# Local Docker (Optional)
SITECORE_LOCAL_URL=https://cm.local.localhost
SITECORE_LOCAL_IDENTITY_URL=https://id.local.localhost
SITECORE_LOCAL_USERNAME=admin
SITECORE_LOCAL_PASSWORD=b

# LLM Configuration (for AI Agent)
PORTKEY_GATEWAY_URL=https://your-gateway
PORTKEY_API_KEY=your-key
```

### Launch

```bash
npm run dev
# Open http://localhost:3000
```

---

## 📖 Usage

### Transfer Pipeline

The cloud-to-cloud transfer follows a 5-step process:

```
    ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
    │ INITIATE │────►│ PACKAGE  │────►│  RELAY   │────►│  IMPORT  │────►│  VERIFY  │
    └──────────┘     └──────────┘     └──────────┘     └──────────┘     └──────────┘
         │                │                │                │                │
         ▼                ▼                ▼                ▼                ▼
     Create           Wait for        Transfer          Consume         Validate
     transfer         .raif           to target        on target         success
```

### Merge Strategies

| Strategy | Behavior |
|----------|----------|
| `OverrideExistingItem` | Replace existing items with transferred content |
| `KeepExistingItem` | Keep existing items, only add new ones |
| `OverrideExistingTree` | Replace entire subtree on target |
| `MergeItem` | Merge fields from source into existing |
| `Skip` | Skip items that already exist |

---

## 📡 API Reference

### Transfer Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/transfer/initiate` | POST | Start a new transfer |
| `/api/transfer/poll` | POST | Poll packaging status |
| `/api/transfer/relay` | POST | Relay chunks to target |
| `/api/transfer/consume` | POST | Import on target |
| `/api/transfer/verify` | POST | Verify completion |
| `/api/transfer/direct` | POST | Direct local sync |

### Content Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/content/item` | POST | Get item by path/GUID |
| `/api/content/children` | POST | Get item children |

### Admin Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/admin/test-connection` | GET/POST | Test connectivity |
| `/api/traces` | GET | Get trace logs |

---

## 🔌 MCP Server

Integrate with Claude Desktop or IDE for AI-assisted transfers.

### Available Tools

| Tool | Description |
|------|-------------|
| `get_item` | Fetch Sitecore item by path |
| `transfer_initiate` | Start content transfer |
| `transfer_poll_status` | Poll packaging status |
| `transfer_relay_chunks` | Relay to target |
| `transfer_consume` | Import on target |
| `transfer_verify` | Verify success |
| `transfer_cleanup` | Clean up artifacts |

### Claude Desktop Config

```json
{
  "mcpServers": {
    "sitecore-transfer": {
      "command": "npx",
      "args": ["tsx", "path/to/src/mcp/server.ts"]
    }
  }
}
```

---

## 🛠️ Tech Stack

<table>
  <tr>
    <td align="center" width="100">
      <img src="https://skillicons.dev/icons?i=nextjs" width="48" height="48" alt="Next.js" />
      <br><strong>Next.js 14</strong>
    </td>
    <td align="center" width="100">
      <img src="https://skillicons.dev/icons?i=react" width="48" height="48" alt="React" />
      <br><strong>React 18</strong>
    </td>
    <td align="center" width="100">
      <img src="https://skillicons.dev/icons?i=ts" width="48" height="48" alt="TypeScript" />
      <br><strong>TypeScript</strong>
    </td>
    <td align="center" width="100">
      <img src="https://skillicons.dev/icons?i=nodejs" width="48" height="48" alt="Node.js" />
      <br><strong>Node.js</strong>
    </td>
  </tr>
  <tr>
    <td align="center" width="100">
      <strong>LangGraph</strong>
      <br><sub>AI Agent</sub>
    </td>
    <td align="center" width="100">
      <strong>Zod</strong>
      <br><sub>Validation</sub>
    </td>
    <td align="center" width="100">
      <strong>Vitest</strong>
      <br><sub>Testing</sub>
    </td>
    <td align="center" width="100">
      <strong>MCP</strong>
      <br><sub>Protocol</sub>
    </td>
  </tr>
</table>

---

## 📁 Project Structure

```
sitecoreai-content-agent/
├── src/
│   ├── agent/              # LangGraph state machine
│   ├── app/                # Next.js App Router
│   │   ├── api/           # 11 API route handlers
│   │   └── page.tsx       # Main UI (sidebar + 4 tabs)
│   ├── lib/               # Core libraries
│   │   ├── tools/         # Agent tool implementations
│   │   ├── agent.ts       # TransferAgent class
│   │   ├── human-gate.ts  # Approval workflow
│   │   ├── memory.ts      # Session + persistent
│   │   └── sitecore-*.ts  # API client
│   ├── mcp/               # MCP server
│   └── evaluation/        # LLM eval framework
├── tests/                 # 46 Vitest tests
└── data/                  # Test fixtures
```

---

## 🧪 Development

```bash
# Run tests
npm run test

# Run with UI
npm run test:ui

# Lint
npm run lint

# Demo script
npm run demo

# Evaluations
npm run eval
```

---

## 🛡️ Safety Features

| Feature | Description |
|---------|-------------|
| **Human Gate** | Production transfers require explicit approval |
| **Iteration Cap** | Agent loop limited to 10 iterations |
| **Failure Escalation** | Escalates after 3 consecutive failures |
| **Retry Logic** | Exponential backoff for transient errors |
| **Token Caching** | OAuth tokens cached with expiry handling |
| **Audit Logging** | Full transfer audit trail |

---

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing`)
5. Open a Pull Request

---

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

---

<p align="center">
  <sub>Built with ❤️ by <a href="https://github.com/saketpsingh">Saket Singh</a></sub>
</p>
