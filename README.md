<p align="center">
  <img src="assets/Kal%20new%20logo.png" alt="Kaleidoscope logo" width="148" />
</p>

# Kaleidoscope

Responsive preview tooling for local and public web apps. Load a URL once, inspect it across multiple device profiles, capture screenshots, tunnel local sites, and use the MCP server to automate the flow.

<p align="center">
  <img src="assets/readme/overview-local-dev.png" alt="Kaleidoscope preview workspace showing local development mode and an iPhone preview frame" width="100%" />
</p>

## Visual Tour

<table>
  <tr>
    <td width="50%" valign="top">
      <img src="assets/readme/screenshot-panel.png" alt="Screenshot capture panel with multiple device targets selected" />
      <br />
      <strong>Capture multiple devices in one pass</strong>
      <br />
      Queue mobile, tablet, and desktop screenshots from the sidebar without leaving the preview workflow.
    </td>
    <td width="50%" valign="top">
      <img src="assets/readme/four-device-comparison.png" alt="Desktop comparison view showing four responsive device previews side by side" />
      <br />
      <strong>Compare layouts side by side</strong>
      <br />
      Pin devices and inspect how the same page behaves across very different breakpoints.
    </td>
  </tr>
  <tr>
    <td width="50%" valign="top">
      <img src="assets/readme/mobile-comparison-stack.png" alt="Mobile-stacked comparison layout for narrow screens" />
      <br />
      <strong>Use it comfortably on narrow screens</strong>
      <br />
      Comparison mode falls back to a stacked layout so the workspace stays usable on smaller displays.
    </td>
    <td width="50%" valign="top">
      <img src="assets/readme/overview-local-dev.png" alt="Main Kaleidoscope workspace with local development URL mode enabled" />
      <br />
      <strong>Local-first preview workflow</strong>
      <br />
      Enter localhost shortcuts like <code>3000</code>, switch devices quickly, and move straight into inspect, auth, screenshots, or performance checks.
    </td>
  </tr>
</table>

## What It Does

Kaleidoscope currently ships these product surfaces:

- Multi-device preview for local and public HTTP/HTTPS URLs
- Local development support for loopback targets such as `http://localhost:3000`
- Auth preview through a server-side proxy with cookie and header injection
- Live reload for trusted local sessions
- Screenshot capture across device profiles
- Inspect tooling for local targets, including selector discovery and source mapping
- MCP tools for preview, screenshots, proxy auth, and inspect flows

## Current Scope

The active UI is the preview workspace. Older flow-diagram and crawl-authoring code has been removed from the shipped client and server packages.

## Supported Device Profiles

The shared device catalog currently includes 14 profiles across mobile, tablet, and desktop classes, including iPhone 14-17, Samsung Galaxy S21/S24/S24 Ultra/S25 Ultra, Google Pixel 6, iPad, iPad Pro, MacBook Air, Desktop HD, and Desktop 4K.

## Quick Start

### Prerequisites

- Node.js 20+
- npm 9+
- Optional: Docker
- Optional but recommended for screenshots and E2E tests: Playwright Chromium
- Optional for localhost sharing: `cloudflared` or `ngrok`

### Local Development

```bash
git clone <your-repo-url>
cd Kaleidoscope
npm run install:all
npm run dev:all
```

The frontend runs on the Vite URL printed in the terminal, usually `http://localhost:5173`, with fallback ports such as `5174` when needed. The backend runs on `http://localhost:5000`.

### Optional Browser Install

Kaleidoscope does not download Playwright browsers during `npm install`. Install Chromium explicitly when you need screenshots or Playwright tests.

```bash
npm run install:browsers
```

### Docker Development

```bash
docker compose up
```

### Docker Production

For a local production-style run:

```bash
CORS_ORIGIN=http://localhost:5000 docker compose -f docker-compose.prod.yml up --build
```

For a real deployment, replace `http://localhost:5000` with the public origin serving the app.

## Usage

### Basic Preview

1. Open the frontend URL printed by Vite.
2. Enter a target URL such as `https://example.com` or `http://localhost:3000`.
3. Switch devices, pin devices for comparison mode, or capture screenshots.

For a follow-along workflow while an agent is making changes, load your local app URL in Kaleidoscope and turn on the `Live Reload` toggle. Trusted local sessions can automatically refresh as files change.

### Auth Preview

For authenticated pages, use the auth panel in the sidebar. Kaleidoscope can create a server-side proxy session with cookies or safe custom headers, then load the proxied page inside the preview.

### Inspect Mode

Inspect mode is limited to trusted local loopback targets such as `localhost` and `127.0.0.1`. It can:

- Discover likely selectors from natural-language queries
- Resolve a selected element back to source context when available
- Export JSON or LLM-friendly source summaries

### Sharing Localhost

The tunnel panel uses external tunnel binaries rather than bundling a JS tunnel dependency. Install either:

- `cloudflared` for Cloudflare quick tunnels
- `ngrok` for ngrok-managed tunnels

## MCP Server

The MCP server lives in [mcp-server](mcp-server) and exposes tools for preview, screenshots, walkthrough videos, auth proxy sessions, selector discovery, and source inspection.

For normal users, use the npm package. It includes the MCP server, Kaleidoscope backend, and built web client, so users do not need to clone this repo.

```bash
npm install -g kaleidoscope-mcp-server
npx playwright install chromium
```

Recommended MCP config for Claude Desktop, Claude Code, Cursor, Windsurf, VS Code, and similar stdio clients:

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

Codex `config.toml`:

```toml
[mcp_servers.kaleidoscope]
command = "kaleidoscope-mcp"
enabled = true
startup_timeout_sec = 20
tool_timeout_sec = 60

[mcp_servers.kaleidoscope.env]
KALEIDOSCOPE_SERVER_URL = "http://localhost:5000"
```

Use `kaleidoscope-mcp` directly on Windows instead of wrapping `npx` in `cmd /c`. This avoids shell-path failures such as `spawn C:\Windows\system32\cmd.exe ENOENT`.

If you are developing from this repo checkout, run from `mcp-server`:

```bash
npm install
npm run build
npm test
```

Source-checkout MCP config:

```json
{
  "mcpServers": {
    "kaleidoscope": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/kaleidoscope/mcp-server",
      "env": {
        "KALEIDOSCOPE_SERVER_URL": "http://localhost:5000"
      }
    }
  }
}
```

Useful MCP tools:

- `kaleidoscope_status`, `kaleidoscope_start`, `kaleidoscope_stop`
- `kaleidoscope_list_devices`, `preview_responsive`, `capture_screenshots`
- `record_walkthrough`
- `preview_with_auth`, `inject_mock_data`
- `discover_page_elements`, `inspect_element_source`

Important environment variables:

- `KALEIDOSCOPE_WORKSPACE_ROOT`: source-inspection root. `source_dir` must stay inside this directory.
- `KALEIDOSCOPE_ARTIFACT_ROOT`: allowed root for walkthrough `output_dir`.
- `KALEIDOSCOPE_WALKTHROUGH_DIR`: default walkthrough output directory.
- `KALEIDOSCOPE_REQUEST_TIMEOUT_MS`: MCP request timeout.
- `KALEIDOSCOPE_PROXY_TIMEOUT_MS` and `KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES`: proxy safety limits.

Verification after install:

1. Ask the MCP client to run `kaleidoscope_status`.
2. Run `kaleidoscope_start`.
3. Run `kaleidoscope_list_devices`.

## Scripts

```bash
# Development
npm run dev:client
npm run dev:server
npm run dev:all

# Quality checks
npm run lint
npm run check
npm run test:ci
npm --prefix mcp-server test

# Full local suites
npm run test:unit
npm run test:e2e
npm run test:e2e:ui

# Browser install for screenshots and Playwright
npm run install:browsers

# GitHub CLI wrapper for shells where gh is not on PATH
npm run gh -- --version
```

Windows-only video helper:

```powershell
.\scripts\Invoke-FfmpegVideoTool.ps1 -InputFile .\input.webm -OutputFile .\output.webm -SpeedMultiplier 1.08 -Overwrite
```

## Security Notes

- Production mode requires `CORS_ORIGIN`.
- The local API binds to `127.0.0.1` by default. Docker sets `HOST=0.0.0.0` explicitly.
- Local management APIs are restricted to trusted Kaleidoscope clients and should not be exposed to untrusted networks.
- Inspect mode is limited to loopback targets, and source reads must stay under `KALEIDOSCOPE_WORKSPACE_ROOT`.
- Walkthrough output directories must stay under `KALEIDOSCOPE_ARTIFACT_ROOT` or `KALEIDOSCOPE_WALKTHROUGH_DIR`.
- Auth proxy sessions are temporary and cleaned up automatically.
- Public tunnels created with `cloudflared` or `ngrok` should be treated as public URLs.

## Repository Layout

```text
Kaleidoscope/
|- mosaic-client/   React client
|- server/          Express API and local tooling services
|- mcp-server/      MCP server and process manager
|- shared/          Shared device definitions
|- examples/        Sample apps for manual testing
|- tests/           End-to-end coverage
```

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and contribution expectations.

## Security Reporting

See [SECURITY.md](SECURITY.md) for how to report vulnerabilities responsibly.

## License

This project is released under the MIT License. See [LICENSE](LICENSE).
