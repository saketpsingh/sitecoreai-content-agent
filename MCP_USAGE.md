# Using the Sitecore Content Transfer Agent

This guide covers how to use the MCP (Model Context Protocol) tools with Claude CLI, Claude Desktop, VS Code, or any MCP-compatible client to transfer content between Sitecore XM Cloud environments.

---

## Using with Claude CLI

Claude CLI (Claude Code) is the recommended way to use the Sitecore Content Transfer tools. The MCP server integrates directly into your terminal session.

### 1. Configure MCP Server

Add to `.claude/settings.json` in the project root:

```json
{
  "mcpServers": {
    "sitecore-xmcloud-transfer": {
      "command": "npx",
      "args": ["tsx", "src/mcp/server.ts"],
      "cwd": "<your local project path>\\sitecoreai-content-agent",
      "env": {
        "NODE_TLS_REJECT_UNAUTHORIZED": "0"
      }
    }
  }
}
```

> **Note:** Claude CLI reads environment variables from your `.env.local` file automatically when running from the project directory.

**Alternative: Global config** (`~/.claude/settings.json`) for use from any directory:

```json
{
  "mcpServers": {
    "sitecore-xmcloud-transfer": {
      "command": "npx",
      "args": ["tsx", "<your local project path>/sitecoreai-content-agent/src/mcp/server.ts"],
      "env": {
        "SITECORE_DEV_URL": "https://xmc-your-dev.sitecorecloud.io",
        "SITECORE_DEV_CLIENT_ID": "your-client-id",
        "SITECORE_DEV_CLIENT_SECRET": "your-client-secret",
        "SITECORE_QA_URL": "https://xmc-your-qa.sitecorecloud.io",
        "SITECORE_QA_CLIENT_ID": "your-client-id",
        "SITECORE_QA_CLIENT_SECRET": "your-client-secret",
        "SITECORE_PROD_URL": "https://xmc-your-prod.sitecorecloud.io",
        "SITECORE_PROD_CLIENT_ID": "your-client-id",
        "SITECORE_PROD_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### 2. Start Claude CLI

```bash
cd C:/Projects/sitecoreai-content-agent
claude
```

### 3. Verify Connection

Run `/mcp` to see connected servers, or test with:

```
> get /sitecore/content/Demosite/Demosite/Home from qa
```

### 4. Example Session

```
$ claude

> get /sitecore/content/Demosite/Demosite/Home from qa

Got the Home item from QA. Here's the summary:
- ID: 46eba6815e5248cb91355d064b76b010
- Template: Page
- Title: Demosite
- 50 direct children...

> transfer /sitecore/content/Demosite/Demosite/Home/Testing from dev to qa

Starting transfer...
Step 1 - Initiate: Created transfer package
Step 2 - Poll: 47 items packaged
Step 3 - Relay: Chunks transferred
Step 4 - Consume: Import started
Step 5 - Verify: Complete!

> /mcp

Lists all connected MCP servers and their tools
```

### Useful Claude CLI Commands

| Command | Description |
|---------|-------------|
| `/mcp` | List all MCP servers and available tools |
| `/clear` | Clear conversation context |
| `/cost` | Show token usage for the session |

### Tips for Claude CLI

1. **Natural language works** — Just describe what you want:
   - "Show me the Home page from QA"
   - "Transfer Medicare content from dev to qa"
   - "What's in /sitecore/content/Demosite?"

2. **Stay in project directory** — Run `claude` from the project root so `.env.local` is loaded automatically.

3. **Check MCP status** — Run `/mcp` to verify the server is connected and see available tools.

4. **Batch operations** — Claude CLI can handle multi-step requests:
   ```
   "Transfer these three pages from dev to qa:
   /sitecore/content/Demosite/Demosite/Home/Medicare
   /sitecore/content/Demosite/Demosite/Home/Employers  
   /sitecore/content/Demosite/Demosite/Home/About"
   ```

---

## Using with Claude Desktop

### Configure MCP Server

Add to `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "sitecore-xmcloud-transfer": {
      "command": "npx",
      "args": ["tsx", "C:/Projects/sitecoreai-content-agent/src/mcp/server.ts"],
      "env": {
        "SITECORE_DEV_URL": "https://xmc-your-dev.sitecorecloud.io",
        "SITECORE_DEV_CLIENT_ID": "your-client-id",
        "SITECORE_DEV_CLIENT_SECRET": "your-client-secret",
        "SITECORE_QA_URL": "https://xmc-your-qa.sitecorecloud.io",
        "SITECORE_QA_CLIENT_ID": "your-client-id",
        "SITECORE_QA_CLIENT_SECRET": "your-client-secret",
        "SITECORE_PROD_URL": "https://xmc-your-prod.sitecorecloud.io",
        "SITECORE_PROD_CLIENT_ID": "your-client-id",
        "SITECORE_PROD_CLIENT_SECRET": "your-client-secret"
      }
    }
  }
}
```

### Verify Connection

Ask Claude:
> "Get the Home item from QA at /sitecore/content/MyProject/Home"

If configured correctly, Claude will return the item details including fields and children.

---

## Using with VS Code

### Configure MCP Server

Add to `.vscode/mcp.json`:

```json
{
  "servers": {
    "sitecore-xmcloud-transfer": {
      "command": "npx",
      "args": ["tsx", "${workspaceFolder}/src/mcp/server.ts"]
    }
  }
}
```

> **Note:** VS Code reads environment variables from your `.env.local` file automatically.

---

## Available Tools

| Tool | Description |
|------|-------------|
| `get_item` | Fetch a Sitecore item by path (includes fields and children) |
| `transfer_initiate` | **Step 1:** Create a transfer package on source |
| `transfer_poll_status` | **Step 2:** Wait for packaging to complete |
| `transfer_relay_chunks` | **Step 3:** Send chunks to target environment |
| `transfer_consume` | **Step 4:** Import the .raif file into target |
| `transfer_verify` | **Step 5:** Confirm import completed successfully |
| `transfer_cleanup` | Remove transfer artifacts from source |

---

## Transfer Workflow

Content transfer follows a 5-step pipeline:

```
Source Environment                           Target Environment
─────────────────                           ──────────────────
     │                                            │
     │  1. INITIATE                               │
     │  Create transfer package                   │
     ▼                                            │
     │  2. POLL                                   │
     │  Wait for .raif packaging                  │
     ▼                                            │
     │  3. RELAY ─────────────────────────────────►
     │  Send chunks to target                     │
     │                                            ▼
     │                                      4. CONSUME
     │                                      Import into content tree
     │                                            │
     │                                            ▼
     │                                      5. VERIFY
     │                                      Confirm success
```

---

## Example Prompts

### Browse Content

```
"Show me the item at /sitecore/content/Demosite/Demosite/Home from QA"

"Get the children of /sitecore/content/Demosite/Demosite/Home/Medicare from dev"

"What fields does /sitecore/content/Demosite/Demosite/Home have in production?"
```

### Transfer Content (DEV → QA)

```
"Transfer /sitecore/content/Demosite/Demosite/Home/Medicare from dev to qa"
```

Claude will execute the 5-step workflow automatically:
1. Initiate transfer on DEV
2. Poll until packaging completes
3. Relay chunks to QA
4. Consume the .raif on QA
5. Verify import success

### Transfer to Production (Requires Approval)

```
"Transfer /sitecore/content/Demosite/Demosite/Home/About from qa to prod"
```

Claude will pause and ask for explicit approval before proceeding. You must confirm:

```
"Yes, I approve this transfer to production"
```

### Transfer Multiple Paths

```
"Transfer these items from dev to qa:
- /sitecore/content/Demosite/Demosite/Home/Medicare
- /sitecore/content/Demosite/Demosite/Home/Employers
- /sitecore/content/Demosite/Demosite/Home/About"
```

### Single Item (No Descendants)

```
"Transfer only /sitecore/content/Demosite/Demosite/Home/Medicare from dev to qa, 
do not include child items (use SingleItem scope)"
```

---

## Merge Strategies

Control how existing items are handled on the target:

| Strategy | Use When |
|----------|----------|
| `OverrideExistingItem` | **Default.** Replace existing items, preserving IDs |
| `KeepExistingItem` | Only add new items, don't touch existing ones |
| `OverrideExistingTree` | Replace entire subtree (deletes items not in source) |
| `MergeItem` | Merge field values into existing items |
| `Skip` | Skip items that already exist |

**Example:**

```
"Transfer /sitecore/content/Demosite/Demosite/Home/Forms from dev to qa 
using KeepExistingItem strategy"
```

---

## Environment Names

Use these environment identifiers in your prompts:

| Name | Description |
|------|-------------|
| `dev` | Development environment |
| `qa` | QA / Testing environment |
| `staging` | Staging / Pre-production |
| `prod` | Production (requires approval) |

---

## Safety Features

### Production Approval Gate

Transfers targeting `prod` require explicit human approval:

```json
{
  "success": false,
  "error": "Production transfer requires explicit human approval",
  "action": "Set humanApproved: true after confirming this transfer should proceed to production"
}
```

Claude will ask you to confirm before proceeding.

### ID Preservation

All transfers preserve Sitecore item IDs by default using `ItemIdMode: PreserveSourceId`. This ensures:
- Links between items remain intact
- References in rich text fields work correctly
- Personalization rules targeting specific items continue to function

### Retry Logic

Transient errors (502, 503, 504) are automatically retried up to 5 times with exponential backoff.

---

## Troubleshooting

### "Credentials not configured for [env]"

Your environment variables are missing. Ensure you have:
- `SITECORE_[ENV]_URL`
- `SITECORE_[ENV]_CLIENT_ID`
- `SITECORE_[ENV]_CLIENT_SECRET`

### "Authentication failed"

Check that your client credentials have the correct API permissions in Sitecore Cloud Portal.

### "Item not found"

The path doesn't exist in the specified environment. Use `get_item` to verify the correct path:

```
"Get item at /sitecore/content/Demosite from dev"
```

### "SingleItem scope requires parent items to already exist"

When using `SingleItem` scope, the parent item must already exist on the target with matching IDs. Either:
- Transfer with `ItemAndDescendants` scope first
- Or transfer parent items before children

### Transfer times out

Large transfers may exceed the default 120-second timeout. Ask Claude to increase it:

```
"Poll the transfer status with a 300 second timeout"
```

---

## Complete Transfer Example

Here's a full conversation example:

**You:** Transfer the Medicare section from dev to qa

**Claude:** I'll transfer `/sitecore/content/Demosite/Demosite/Home/Medicare` from dev to qa.

Starting the 5-step transfer process...

**Step 1 - Initiate:** Created transfer package (ID: abc-123)  
**Step 2 - Poll:** Packaging complete - 47 items ready  
**Step 3 - Relay:** Transferred 47 items (3 chunks)  
**Step 4 - Consume:** Import started on QA  
**Step 5 - Verify:** Transfer completed successfully!

47 items transferred from dev to qa.

---

## Getting Sitecore API Credentials

1. Go to [Sitecore Cloud Portal](https://portal.sitecorecloud.io)
2. Navigate to your XM Cloud project
3. Go to **Credentials** → **API Clients**
4. Create a new client with these permissions:
   - `content.transfer:read`
   - `content.transfer:write`
   - `authoring.graphql:read`
5. Copy the Client ID and Client Secret

---

## Additional Resources

- [Sitecore XM Cloud Content Transfer API](https://doc.sitecore.com/xmc/en/developers/xm-cloud/content-transfer-api.html)
- [Model Context Protocol](https://modelcontextprotocol.io)
- [Claude Desktop MCP Setup](https://docs.anthropic.com/en/docs/claude-desktop/mcp)
- [Claude CLI Documentation](https://docs.anthropic.com/en/docs/claude-code)
