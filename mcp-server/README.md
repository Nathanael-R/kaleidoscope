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

Run it directly with `npx`:

```bash
npx -y kaleidoscope-mcp-server
```

The executable name is:

```bash
kaleidoscope-mcp
```

Or install it globally first:

```bash
npm install -g kaleidoscope-mcp-server
```

## MCP client config

### Claude Code

Project-scoped `.mcp.json`:

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

If you installed the package globally, you can also use:

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

CLI form:

```bash
claude mcp add --transport stdio kaleidoscope --scope project -- npx -y kaleidoscope-mcp-server
```

### Codex `config.toml`

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

If you installed the package globally:

```toml
[mcp_servers.kaleidoscope]
command = "kaleidoscope-mcp"
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
- Command to launch: `npx`
- Arguments: `-y`, `kaleidoscope-mcp-server`
- Environment variable: `KALEIDOSCOPE_SERVER_URL=http://localhost:5000`
- Working directory: leave blank

If you installed the package globally, use `kaleidoscope-mcp` as the command and leave arguments empty.

## Environment

- `KALEIDOSCOPE_SERVER_URL`
  Defaults to `http://localhost:5000`.
- `KALEIDOSCOPE_CLIENT_PORT`
  Optional preferred local client port for status and startup checks.
- `KALEIDOSCOPE_WALKTHROUGH_DIR`
  Optional default output directory for `record_walkthrough`. Used when the tool call omits `output_dir`.

## Notes

- This package talks to the Kaleidoscope server API; it is not a standalone screenshot service by itself.
- Rich screenshot responses use MCP `structuredContent`, `resource_link`, inline `image` blocks, and absolute local display paths when the client supports them.
- Screenshot tool responses include per-image `markdownImageTag` values plus a top-level `readyToPasteMarkdown` array so agents can paste a working Markdown image tag directly into chat on Windows, macOS, Linux, or UNC network shares.
- `record_walkthrough` saves local `.webm` files and returns them as `resource_link` artifacts plus absolute local paths. It supports structured `click`, `hover`, `type`, `press`, `wait`, `scroll`, `goto`, and `select` steps, or a simpler one-command-per-line `script` format.
- `record_walkthrough` resolves its save location in this order: explicit `output_dir`, then `KALEIDOSCOPE_WALKTHROUGH_DIR`, then `./walkthroughs`.
- `record_walkthrough` requires Playwright Chromium to be installed on the host machine:

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
