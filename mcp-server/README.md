# kaleidoscope-mcp-server

MCP server for [Kaleidoscope](https://github.com/Nathanael-R/kaleidoscope), a responsive preview and inspection tool for local web apps.

## What it can do

- start and stop Kaleidoscope services
- report service status
- list the available screenshot device presets
- prepare responsive preview sessions
- capture screenshots across multiple devices
- record scripted walkthrough videos with a visible cursor overlay
- create authenticated proxy previews and inject mock data
- discover likely page elements from natural-language queries
- inspect a page element by CSS selector and return structured source metadata

## Install and run

For the most reliable setup, install it once and launch the real executable:

```bash
npm install -g kaleidoscope-mcp-server
```

The executable name is:

```bash
kaleidoscope-mcp
```

You can still run it ad hoc with `npx` if you want:

```bash
npx -y kaleidoscope-mcp-server
```

The npm package includes a packaged Kaleidoscope backend and built web client. When the MCP tools need Kaleidoscope and nothing is already running at `KALEIDOSCOPE_SERVER_URL`, the MCP can start that packaged runtime itself; users do not need to clone this repository for normal screenshot and preview usage.

## MCP client config

### Claude Code

Project-scoped `.mcp.json`:

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

If you prefer `npx`, you can also use:

```json
{
  "mcpServers": {
    "kaleidoscope": {
      "command": "npx",
      "args": ["-y", "kaleidoscope-mcp-server"],
      "env": {
        "KALEIDOSCOPE_SERVER_URL": "http://localhost:5000"
      }
    }
  }
}
```

CLI form:

```bash
claude mcp add --transport stdio kaleidoscope --scope project -- kaleidoscope-mcp
```

### Codex `config.toml`

```toml
[mcp_servers.kaleidoscope]
command = "kaleidoscope-mcp"
enabled = true
startup_timeout_sec = 20
tool_timeout_sec = 60

[mcp_servers.kaleidoscope.env]
KALEIDOSCOPE_SERVER_URL = "http://localhost:5000"
```

If you prefer `npx`:

```toml
[mcp_servers.kaleidoscope]
command = "npx"
args = ["-y", "kaleidoscope-mcp-server"]
enabled = true
startup_timeout_sec = 20
tool_timeout_sec = 60

[mcp_servers.kaleidoscope.env]
KALEIDOSCOPE_SERVER_URL = "http://localhost:5000"
```

### Codex desktop connector UI

Use these values in the MCP connector form:

- Name: `kaleidoscope`
- Transport: `STDIO`
- Command to launch: `kaleidoscope-mcp`
- Arguments: leave empty
- Environment variable: `KALEIDOSCOPE_SERVER_URL=http://localhost:5000`
- Working directory: leave blank

If you prefer `npx`, use `npx` with arguments `-y`, `kaleidoscope-mcp-server`.

## Environment

- `KALEIDOSCOPE_SERVER_URL`
  Defaults to `http://localhost:5000`.
- `KALEIDOSCOPE_CLIENT_PORT`
  Optional preferred local client port for repo-checkout development. Npm-installed packaged runtime serves the client from `KALEIDOSCOPE_SERVER_URL`.
- `KALEIDOSCOPE_REQUEST_TIMEOUT_MS`
  Optional timeout for MCP requests to the Kaleidoscope backend. Defaults to `60000`.
- `KALEIDOSCOPE_WORKSPACE_ROOT`
  Optional root directory for source inspection and performance source mapping. `source_dir` must stay inside this directory.
- `KALEIDOSCOPE_ARTIFACT_ROOT`
  Optional root directory for user-selected walkthrough output directories.
- `KALEIDOSCOPE_WALKTHROUGH_DIR`
  Optional default output directory for `record_walkthrough`. Used when the tool call omits `output_dir`.
- `KALEIDOSCOPE_PROXY_TIMEOUT_MS`
  Optional proxy target request timeout. Defaults to `30000`.
- `KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES`
  Optional proxy response byte limit. Defaults to `10485760`.

## Notes

- The published npm package includes the Kaleidoscope app runtime. In a source checkout, the MCP still starts the local development server and Vite client.
- Rich screenshot responses use MCP `structuredContent`, `resource_link`, inline `image` blocks, and absolute local display paths when the client supports them.
- Screenshot tool responses include a top-level `primaryMarkdownImageTag`, per-image `markdownImageTag` values, and a `readyToPasteMarkdown` array so agents can paste a working Markdown image tag directly into chat on Windows, macOS, Linux, or UNC network shares.
- `capture_screenshots` accepts both device IDs and common names. For example, `devices: ["iphone-14"]`, `devices: ["iPhone 14"]`, and `devices: ["iphone14"]` all resolve to the iPhone 14 preset.
- `record_walkthrough` saves local `.webm` files and returns them as `resource_link` artifacts plus absolute local paths. It supports structured `click`, `hover`, `type`, `press`, `wait`, `scroll`, `goto`, and `select` steps, or a simpler one-command-per-line `script` format.
- `record_walkthrough` supports `artifact_mode: "deliverable"` and `artifact_mode: "inspection"`. Deliverables resolve their save location as explicit `output_dir`, then `KALEIDOSCOPE_WALKTHROUGH_DIR`, then `./walkthroughs`. Inspection recordings default to the OS temp directory unless `output_dir` is provided. Explicit `output_dir` values must stay inside `KALEIDOSCOPE_ARTIFACT_ROOT` or the configured walkthrough root.
- `record_walkthrough` and screenshot capture require Playwright Chromium to be installed on the host machine before capture begins:

```bash
npx playwright install chromium
```

Example `script` input for `record_walkthrough`:

```text
click #open-settings
type "hello@example.com" into #email
click button[type="submit"]
wait 800ms
```

- Inspect remains selector-based and is limited to loopback/dev targets.
- Source mapping only reads files under `KALEIDOSCOPE_WORKSPACE_ROOT`.

## Troubleshooting

- `spawn C:\Windows\system32\cmd.exe ENOENT`: install this package and configure the client to run `kaleidoscope-mcp` directly instead of `cmd /c npx ...`.
- `Browser executable not found`: run `npx playwright install chromium` in the same environment that launches the MCP.
- `sourceDir must be inside...`: set `KALEIDOSCOPE_WORKSPACE_ROOT` to the project root you want Kaleidoscope to inspect.
- `output_dir must stay inside...`: set `KALEIDOSCOPE_ARTIFACT_ROOT` or `KALEIDOSCOPE_WALKTHROUGH_DIR`, then use an output directory below it.
- Port conflicts: set `KALEIDOSCOPE_SERVER_URL=http://localhost:<free-port>` or stop the process using port 5000.

## Development

```bash
npm install
npm run build
npm run check
npm test
```

More detailed usage and testing notes live in the main repository:

- [MCP testing guide](https://github.com/Nathanael-R/kaleidoscope/blob/master/Documentation/MCP-TESTING.md)
- [project README](https://github.com/Nathanael-R/kaleidoscope/blob/master/README.md)
