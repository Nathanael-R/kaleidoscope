# Kaleidoscope

Responsive preview tooling for local and public web apps. Load a URL once, inspect it across multiple device profiles, capture screenshots, tunnel local sites, and use the MCP server to automate the flow.

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

The MCP server lives in [mcp-server](mcp-server) and exposes tools for preview, screenshots, auth proxy sessions, selector discovery, and source inspection.

Example MCP config:

```json
{
  "mcpServers": {
    "kaleidoscope": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/path/to/Kaleidoscope/mcp-server"
    }
  }
}
```

Core tools:

- `preview_responsive`
- `capture_screenshots`
- `preview_with_auth`
- `inject_mock_data`
- `discover_page_elements`
- `inspect_element_source`
- `kaleidoscope_status`
- `kaleidoscope_start`
- `kaleidoscope_stop`

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

# Full local suites
npm run test:unit
npm run test:e2e
npm run test:e2e:ui

# Browser install for screenshots and Playwright
npm run install:browsers
```

## Security Notes

- Production mode requires `CORS_ORIGIN`.
- Local management APIs are restricted to trusted Kaleidoscope clients.
- Inspect mode is limited to loopback targets.
- Auth proxy sessions are temporary and cleaned up automatically.

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