# kaleidoscope-mcp-server

`kaleidoscope-mcp-server` gives MCP clients browser-grounded responsive QA tools for local and public web apps. It packages the Kaleidoscope web workspace, backend, and stdio MCP server together, so a coding agent can start the runtime, inspect rendered UI, capture artifacts, and verify a post-edit layout without a repository checkout.

## What Agents Can Do

- Open a local or public page in Kaleidoscope's multi-device workspace.
- Capture viewport or full-page screenshots across selected device profiles and return chat-ready local image references.
- Compare matching PNG captures pixel by pixel and return a highlighted diff artifact.
- Find visible page elements from a natural-language query, then inspect a local element for viewport and source metadata.
- Capture a structured layout baseline, then recapture after an edit to identify meaningful element, text, and geometry changes across selected devices.
- Sweep a continuous width range to find sampled document-overflow and clipped-interactive-control failures beyond named device presets.

The layout workflow returns structural, source-attributed changes. Screenshot comparison provides exact pixel mismatch metrics separately.

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
4. Call `kaleidoscope_after_edit` once the app has rebuilt.
5. Review only the reported changes; capture screenshots or inspect source when more evidence is needed.

Example prompt:

```text
Capture a Kaleidoscope layout baseline for http://localhost:3000/checkout on iphone-14, ipad, and desktop. After changing the checkout form, compare it with the baseline and report only changed elements, including source locations when available.
```

## Tool Reference

| Tool | Purpose |
| --- | --- |
| `kaleidoscope_status` | Check the packaged runtime. |
| `kaleidoscope_list_devices` | List supported device profiles and the default capture set. |
| `preview_responsive` | Prepare a multi-device visual workspace for a URL. |
| `capture_screenshots` | Save viewport or full-page screenshots across devices. |
| `compare_screenshots` | Compare matching PNG captures and return a highlighted diff artifact. |
| `discover_page_elements` | Return scored visible-element candidates for a natural-language query. |
| `inspect_element_source` | Inspect a rendered local element by selector and return source context. |
| `kaleidoscope_read_layout` | Capture a structured, source-attributed layout baseline. |
| `kaleidoscope_after_edit` | Recapture and compare after a known app rebuild. |
| `kaleidoscope_scan_breakpoints` | Sweep a width range for supported responsive failure signals. |

## Capture reliability, chat previews, and expiry

`capture_screenshots` defaults to `wait_until: "domcontentloaded"` and `settle_ms: 500`, so pages with ongoing network requests can still be captured. Increase `settle_ms` (up to 2000) for slower rendering, or select `wait_until: "load"` when the page needs its load event. Playwright [discourages using networkidle for readiness](https://playwright.dev/docs/api/class-page#page-goto-option-wait-until).

Native MCP image blocks include previews for up to ten requested devices. Large PNGs are resized to fit a shared response budget; originals stay at their captured resolution. `inlinePreviews` maps each device to its image block, and `previewWarnings` explains unavailable previews. Local Markdown image paths are a fallback for clients that support them; a terminal or chat renderer may not display them.

New screenshots, pixel diffs, and their chat copies expire after **five minutes** by default. Set `retention_minutes` on `capture_screenshots` or `compare_screenshots` to change the lifetime for that call, or use `0` to keep its files. `expiresAt` reports the deletion deadline. Cleanup checks every ten seconds while each service is running and resumes on restart. Keep captures longer when comparing edits across a longer session.

Cleanup removes only files with Kaleidoscope expiry metadata. Existing captures from older versions and files you save separately remain untouched. If all services are stopped, deletion waits until the next startup. Images already embedded or cached by a chat client cannot be erased by Kaleidoscope.

For OpenCode, use its [local MCP configuration](https://opencode.ai/docs/mcp-servers/#local), with `command: ["npx", "-y", "kaleidoscope-mcp-server@latest"]`. When testing an unpublished checkout, build it and use `command: ["node", "C:/Code/kaleidoscope/mcp-server/dist/index.js"]`, then reconnect the MCP server. Published packages do not include local edits.

## Boundaries and Safety

- Inspect mode is limited to local loopback targets such as `localhost` and `127.0.0.1`; source reads must remain under `KALEIDOSCOPE_WORKSPACE_ROOT`.
- Layout captures are temporary in-memory server state. By default, captures expire after two hours and the latest 50 are retained.
- Screenshot and layout rendering uses the supported Chromium/Playwright runtime. It is not a cross-browser Safari or Firefox verifier.
- Breakpoint scanning currently detects document-level horizontal overflow and horizontally clipped visible controls. It reports sampled ranges, not exact breakpoint boundaries or every possible visual defect.
- The local API binds to `127.0.0.1` by default.

## Environment Options

- `KALEIDOSCOPE_SERVER_URL`: backend URL; defaults to `http://localhost:5000`.
- `KALEIDOSCOPE_REQUEST_TIMEOUT_MS`: MCP request timeout; defaults to `60000`.
- `KALEIDOSCOPE_IMAGE_RETENTION_MINUTES`: default saved-image lifetime in minutes; defaults to `5`. Use `0` to keep files, or override per call with `retention_minutes`. Configure this on a separately managed backend as well.
- `KALEIDOSCOPE_WORKSPACE_ROOT`: source-inspection root for local projects.
- `KALEIDOSCOPE_PROXY_TIMEOUT_MS`: proxy request timeout; defaults to `30000`.
- `KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES`: proxy response limit; defaults to `10485760`.
- `KALEIDOSCOPE_LAYOUT_CAPTURE_MAX_AGE_MS`: layout-capture retention time; defaults to `7200000`.
- `KALEIDOSCOPE_LAYOUT_CAPTURE_MAX_COUNT`: layout-capture limit; defaults to `50`.

MCP clients can also discover each tool's structured input and output schema at runtime.

## License

MIT. See [LICENSE](LICENSE).
