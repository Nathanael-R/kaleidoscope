# kaleidoscope-mcp-server

MCP server for [Kaleidoscope](https://github.com/Nathanael-R/kaleidoscope), a responsive preview and inspection tool for local and public web apps.

## What You Can Do

- Start and stop the packaged Kaleidoscope runtime.
- Preview local and public URLs across mobile, tablet, and desktop device profiles.
- Capture screenshots across multiple devices.
- Record scripted walkthrough videos with visible cursor movement.
- Preview authenticated pages with temporary cookie and header injection.
- Discover likely page elements from natural-language queries.
- Inspect trusted local pages and return structured source context.

## MCP Client Setup

No global install is required. Configure your MCP client to run the package through `npx`:

```bash
npx -y kaleidoscope-mcp-server@latest
```

The npm package includes the Kaleidoscope MCP server, backend, and built web client. When an MCP tool needs Kaleidoscope and no server is already running, it can start the packaged runtime automatically.

### Claude Code

Project-scoped `.mcp.json`:

```json
{
  "mcpServers": {
    "kaleidoscope": {
      "command": "npx",
      "args": ["-y", "kaleidoscope-mcp-server@latest"],
      "env": {
        "KALEIDOSCOPE_SERVER_URL": "http://localhost:5000"
      }
    }
  }
}
```

CLI form:

```bash
claude mcp add --transport stdio kaleidoscope --scope project -- npx -y kaleidoscope-mcp-server@latest
```

### Codex `config.toml`

```toml
[mcp_servers.kaleidoscope]
command = "npx"
args = ["-y", "kaleidoscope-mcp-server@latest"]
enabled = true
startup_timeout_sec = 20
tool_timeout_sec = 60

[mcp_servers.kaleidoscope.env]
KALEIDOSCOPE_SERVER_URL = "http://localhost:5000"
```

### Codex Desktop Connector UI

- Name: `kaleidoscope`
- Transport: `STDIO`
- Command to launch: `npx`
- Arguments: `-y`, `kaleidoscope-mcp-server@latest`
- Environment variable: `KALEIDOSCOPE_SERVER_URL=http://localhost:5000`
- Working directory: leave blank

### Optional Global Install

If you prefer a persistent local command, install the package globally:

```bash
npm install -g kaleidoscope-mcp-server@latest
```

Then configure your MCP client to run:

```bash
kaleidoscope-mcp
```

JSON config:

```json
{
  "mcpServers": {
    "kaleidoscope": {
      "command": "kaleidoscope-mcp",
      "env": {
        "KALEIDOSCOPE_SERVER_URL": "http://localhost:5000"
      }
    }
  }
}
```

## Common Workflows

### Preview A Local App

1. Start your app, for example on `http://localhost:3000`.
2. Ask your MCP client to run `kaleidoscope_start`.
3. Ask it to prepare a responsive preview for your URL.
4. Open `http://localhost:5000` if you want to use the visual workspace directly.

### Capture Screenshots

Use `capture_screenshots` with device IDs or common names:

```json
{
  "url": "http://localhost:3000",
  "devices": ["iphone-14", "ipad", "desktop"]
}
```

### Record A Walkthrough

Use `record_walkthrough` with structured steps or a simple script:

```text
click #open-settings
type "hello@example.com" into #email
click button[type="submit"]
wait 800ms
```

Walkthroughs are saved as local `.webm` files and returned as MCP artifacts.

### Inspect A Local Page

Inspect mode works with trusted loopback targets such as `localhost` and `127.0.0.1`. It can discover likely selectors and return source context for selected elements when a workspace root is configured.

## MCP Tools

- `kaleidoscope_status`, `kaleidoscope_start`, `kaleidoscope_stop`
- `kaleidoscope_list_devices`
- `preview_responsive`
- `capture_screenshots`
- `record_walkthrough`
- `preview_with_auth`
- `inject_mock_data`
- `discover_page_elements`
- `inspect_element_source`

## Environment Options

- `KALEIDOSCOPE_SERVER_URL`: Kaleidoscope backend URL. Defaults to `http://localhost:5000`.
- `KALEIDOSCOPE_REQUEST_TIMEOUT_MS`: MCP request timeout. Defaults to `60000`.
- `KALEIDOSCOPE_WORKSPACE_ROOT`: source-inspection root for local projects.
- `KALEIDOSCOPE_ARTIFACT_ROOT`: allowed root for user-selected walkthrough output directories.
- `KALEIDOSCOPE_WALKTHROUGH_DIR`: default output directory for walkthrough videos.
- `KALEIDOSCOPE_PROXY_TIMEOUT_MS`: proxy request timeout. Defaults to `30000`.
- `KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES`: proxy response byte limit. Defaults to `10485760`.

## Troubleshooting

- `Browser executable not found`: run `npx playwright install chromium` in the same environment that launches the MCP server.
- `spawn C:\Windows\system32\cmd.exe ENOENT`: install the package globally and configure your MCP client to run `kaleidoscope-mcp` directly.
- `sourceDir must be inside...`: set `KALEIDOSCOPE_WORKSPACE_ROOT` to the project root you want Kaleidoscope to inspect.
- `output_dir must stay inside...`: set `KALEIDOSCOPE_ARTIFACT_ROOT` or `KALEIDOSCOPE_WALKTHROUGH_DIR`, then use an output directory below it.
- Port conflicts: set `KALEIDOSCOPE_SERVER_URL=http://localhost:<free-port>` or stop the process using port `5000`.

## Privacy And Safety

- Kaleidoscope is designed for local preview and inspection workflows.
- The local API binds to `127.0.0.1` by default.
- Inspect mode is limited to loopback targets, and source reads must stay under `KALEIDOSCOPE_WORKSPACE_ROOT`.
- Walkthrough output directories must stay under `KALEIDOSCOPE_ARTIFACT_ROOT` or `KALEIDOSCOPE_WALKTHROUGH_DIR`.
- Auth proxy sessions are temporary and cleaned up automatically.

## License

Kaleidoscope is released under the MIT License. See [LICENSE](LICENSE).
