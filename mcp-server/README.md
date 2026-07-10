# kaleidoscope-mcp-server

`kaleidoscope-mcp-server` gives MCP clients browser-grounded responsive QA tools for local and public web apps. It packages the Kaleidoscope web workspace, backend, and stdio MCP server together, so a coding agent can start the runtime, inspect rendered UI, capture artifacts, and verify a post-edit layout without a repository checkout.

## What Agents Can Do

- Open a local or public page in Kaleidoscope's multi-device workspace.
- Capture viewport or full-page screenshots across selected device profiles and return chat-ready local image references.
- Record structured or script-based Playwright walkthrough videos with a visible cursor overlay.
- Create a temporary authenticated proxy preview with cookies or safe headers; inject mock API responses through that proxy without changing the application.
- Find visible page elements from a natural-language query, then inspect a local element for viewport and source metadata.
- Capture a structured layout baseline, then recapture after an edit to identify meaningful element, text, and geometry changes across selected devices.
- Wait for a Kaleidoscope watcher reload before running that post-edit comparison.
- Sweep a continuous width range to find sampled document-overflow and clipped-interactive-control failures beyond named device presets.

The layout workflow is a structural DOM/layout comparison, not pixel-level image diffing. It returns a concise no-change verdict when appropriate and source-attributed changes when available.

## Install and Configure

No global install is required:

```bash
npx -y kaleidoscope-mcp-server@latest
```

Example MCP configuration:

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

For Codex:

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

The package starts its bundled runtime automatically if a tool needs it and no Kaleidoscope server is already available. To use a persistent command instead, install globally with `npm install -g kaleidoscope-mcp-server@latest` and configure `kaleidoscope-mcp` as the command.

## Recommended Agent Loop

1. Start the target app, for example at `http://localhost:3000`.
2. Call `kaleidoscope_read_layout` for the route and device set that matter.
3. Make the UI change.
4. Call `kaleidoscope_after_edit` once the app has rebuilt, or `kaleidoscope_observe_layout` if a Kaleidoscope watcher is already waiting for the reload.
5. Review only the reported changes; capture screenshots or inspect source when more evidence is needed.

Example prompt:

```text
Capture a Kaleidoscope layout baseline for http://localhost:3000/checkout on iphone-14, ipad, and desktop. After changing the checkout form, compare it with the baseline and report only changed elements, including source locations when available.
```

## Tool Reference

| Tool | Purpose |
| --- | --- |
| `kaleidoscope_status`, `kaleidoscope_start`, `kaleidoscope_stop` | Check or control the packaged runtime. |
| `kaleidoscope_list_devices` | List supported device profiles and the default capture set. |
| `preview_responsive` | Prepare a multi-device visual workspace for a URL. |
| `capture_screenshots` | Save viewport or full-page screenshots across devices. |
| `record_walkthrough` | Record a scripted browser flow as a local WebM video. |
| `preview_with_auth` | Create a temporary proxy preview with server-side auth injection. |
| `inject_mock_data` | Serve mock API responses through an existing proxy session. |
| `discover_page_elements` | Return scored visible-element candidates for a natural-language query. |
| `inspect_element_source` | Inspect a rendered local element by selector and return source context. |
| `kaleidoscope_read_layout` | Capture a structured, source-attributed layout baseline. |
| `kaleidoscope_after_edit` | Recapture and compare after a known app rebuild. |
| `kaleidoscope_observe_layout` | Wait for a watcher reload, then recapture and compare. |
| `kaleidoscope_scan_breakpoints` | Sweep a width range for supported responsive failure signals. |

## Boundaries and Safety

- Inspect mode is limited to local loopback targets such as `localhost` and `127.0.0.1`; source reads must remain under `KALEIDOSCOPE_WORKSPACE_ROOT`.
- Layout captures are temporary in-memory server state. By default, captures expire after two hours and the latest 50 are retained.
- Screenshot and layout rendering uses the supported Chromium/Playwright runtime. It is not a cross-browser Safari or Firefox verifier.
- Breakpoint scanning currently detects document-level horizontal overflow and horizontally clipped visible controls. It reports sampled ranges, not exact breakpoint boundaries or every possible visual defect.
- Auth proxy sessions are temporary. Mock data is served by the proxy at runtime and does not edit the target codebase.
- The local API binds to `127.0.0.1` by default.

## Environment Options

- `KALEIDOSCOPE_SERVER_URL`: backend URL; defaults to `http://localhost:5000`.
- `KALEIDOSCOPE_REQUEST_TIMEOUT_MS`: MCP request timeout; defaults to `60000`.
- `KALEIDOSCOPE_WORKSPACE_ROOT`: source-inspection root for local projects.
- `KALEIDOSCOPE_ARTIFACT_ROOT`: allowed root for user-selected walkthrough output directories.
- `KALEIDOSCOPE_WALKTHROUGH_DIR`: default walkthrough-video directory.
- `KALEIDOSCOPE_PROXY_TIMEOUT_MS`: proxy request timeout; defaults to `30000`.
- `KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES`: proxy response limit; defaults to `10485760`.
- `KALEIDOSCOPE_LAYOUT_CAPTURE_MAX_AGE_MS`: layout-capture retention time; defaults to `7200000`.
- `KALEIDOSCOPE_LAYOUT_CAPTURE_MAX_COUNT`: layout-capture limit; defaults to `50`.

MCP clients can also discover each tool's structured input and output schema at runtime.

## License

MIT. See [LICENSE](LICENSE).
