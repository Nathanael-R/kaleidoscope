# Compatibility Guide

Kaleidoscope is a Node.js MCP server plus a packaged local web app runtime.

## Supported Runtime

- Node.js: 20 or newer
- npm: 9 or newer
- OS: Windows, macOS, Linux
- Browser engine for screenshots/walkthroughs: Playwright Chromium

Install Chromium once when using capture or walkthrough tools:

```bash
npx playwright install chromium
```

## Normal npm Users

Normal users do not need to clone this repository. Install the MCP package:

```bash
npm install -g kaleidoscope-mcp-server
```

Then configure the MCP client to run:

```bash
kaleidoscope-mcp
```

The npm package includes:

- the MCP stdio server
- the Kaleidoscope backend
- the built Kaleidoscope web client

When no server is already reachable at `KALEIDOSCOPE_SERVER_URL`, the MCP server starts the packaged runtime automatically.

## Windows

Recommended MCP command:

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

Notes:

- Prefer the installed `kaleidoscope-mcp` command over `cmd /c npx ...`.
- The MCP no longer depends on `C:\Windows\system32\cmd.exe` for managed Kaleidoscope startup.
- Paths with spaces are supported when passed through normal JSON/TOML MCP config strings.
- PowerShell, CMD, Git Bash, and WSL can all launch the installed executable, but WSL and Windows have separate filesystems and browser installs.

Troubleshooting:

- `spawn ... cmd.exe ENOENT`: update to this version and use `kaleidoscope-mcp` directly.
- Browser missing: run `npx playwright install chromium` in the same Windows environment that runs the MCP.
- Port already in use: set `KALEIDOSCOPE_SERVER_URL=http://localhost:<free-port>` or stop the existing service.

## macOS

Install:

```bash
npm install -g kaleidoscope-mcp-server
npx playwright install chromium
```

Use `kaleidoscope-mcp` in Claude Desktop, Claude Code, Codex, Cursor, Windsurf, or VS Code MCP config.

If macOS blocks an external tunnel binary such as `cloudflared` or `ngrok`, approve that binary in System Settings or install it through a trusted package manager.

## Linux

Install:

```bash
npm install -g kaleidoscope-mcp-server
npx playwright install chromium
```

Headless servers may need Playwright system dependencies. If Chromium launch fails, run:

```bash
npx playwright install-deps chromium
```

## Docker

The local non-Docker server binds to `127.0.0.1` by default. Docker configs set `HOST=0.0.0.0` intentionally so the container port can be published.

Development:

```bash
docker compose up
```

Production-style local run:

```bash
CORS_ORIGIN=http://localhost:5000 docker compose -f docker-compose.prod.yml up --build
```

## Environment Variables

- `KALEIDOSCOPE_SERVER_URL`: MCP target server URL. Defaults to `http://localhost:5000`.
- `KALEIDOSCOPE_CLIENT_PORT`: preferred client port for source-checkout development.
- `KALEIDOSCOPE_REQUEST_TIMEOUT_MS`: MCP HTTP request timeout. Defaults to `60000`.
- `KALEIDOSCOPE_WORKSPACE_ROOT`: allowed root for source inspection and performance source mapping. Defaults to the server working directory.
- `KALEIDOSCOPE_ARTIFACT_ROOT`: allowed root for user-selected walkthrough output directories.
- `KALEIDOSCOPE_WALKTHROUGH_DIR`: default walkthrough output directory.
- `KALEIDOSCOPE_PROXY_TIMEOUT_MS`: proxy target request timeout. Defaults to `30000`.
- `KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES`: proxy response cap. Defaults to `10485760`.
- `KALEIDOSCOPE_DEBUG_ERRORS=1`: include stack traces in server error logs. Leave unset for normal users.
- `HOST`: server bind host. Defaults to `127.0.0.1`; use `0.0.0.0` only for Docker/LAN deployment.
- `PORT`: server port. Defaults to `5000`.

## Known Limitations

- Screenshot and walkthrough tools require a working Playwright Chromium install.
- Inspect source mapping only reads files under `KALEIDOSCOPE_WORKSPACE_ROOT`.
- Public tunnels require an installed `cloudflared` or `ngrok` binary.
- Git Bash and WSL may see different global npm installs than Windows native shells.

## Verification

After installation, ask your MCP client to run:

1. `kaleidoscope_status`
2. `kaleidoscope_start`
3. `kaleidoscope_list_devices`

Expected result: the server reports running on `http://localhost:5000`, the client URL is the same packaged runtime origin, and device presets are returned.

