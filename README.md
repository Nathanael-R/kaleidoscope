<p align="center">
  <img src="assets/Kal%20new%20logo.png" alt="Kaleidoscope logo" width="148" />
</p>

# Kaleidoscope

Kaleidoscope is a local-first responsive visual QA tool for web apps and coding agents. It lets you preview a page across real device emulation profiles, capture evidence, inspect rendered elements, and verify a UI edit against a structured layout baseline.

Use the visual workspace when you want to review a page yourself. Use the included MCP server when an agent needs browser evidence before or after changing UI code.

<p align="center">
  <img src="assets/readme/overview-local-dev.png" alt="Kaleidoscope preview workspace showing local development mode and an iPhone preview frame" width="100%" />
</p>

## Why Kaleidoscope

Code can tell an agent what it changed; it cannot prove what the browser rendered. Kaleidoscope closes that gap with a tight browser-feedback loop:

1. capture a page across selected device profiles;
2. make a UI change;
3. recapture after the app rebuilds; and
4. return a concise `noChange`, `changed`, or `inconclusive` verdict, with the affected elements and source locations when available.

It is deliberately local-first: the server binds to loopback by default, inspect mode is restricted to trusted local pages, and temporary auth proxy sessions are cleaned up automatically.

## What You Can Do

### Review responsive layouts visually

- Load local or public HTTP/HTTPS pages once and compare mobile, tablet, and desktop profiles side by side.
- Pin device frames, switch quickly between profiles, and use a stacked comparison view on narrow screens.
- Use Playwright device emulation for supported profiles, including the appropriate mobile/touch defaults where available.
- Enable live reload in the workspace to keep the preview aligned with a local dev server.

### Capture visual evidence

- Capture viewport or full-page screenshots across several devices in one run.
- Save screenshots locally and return chat-ready image paths, Markdown image tags, resource links, and inline previews when the MCP client supports them.
- Record scripted Playwright walkthroughs as local WebM videos, with an optional visible cursor overlay—useful for demos and bug reproductions.

### Verify a UI edit structurally

- Capture a structured layout baseline across one or more devices before editing.
- Recapture after the edit and compare visible elements for additions, removals, text changes, and significant geometry changes.
- Receive a short no-change verdict when the rendered layout is stable; otherwise receive a ranked, source-attributed summary of affected elements.
- Wait for Kaleidoscope's live-reload watcher, then automatically recapture and compare instead of guessing when the target app has rebuilt.

Layout comparison uses stable selectors and fallback identities where possible. It is a structured DOM/layout comparison, not a pixel-perfect image diff.

### Discover failures between device presets

- Sweep a continuous viewport range rather than checking only a few named devices.
- Return compact sampled width ranges for deterministic failures: document-level horizontal overflow and visible interactive controls clipped horizontally.
- Start with a clear, concrete signal instead of asking an agent to inspect dozens of screenshots. A clear result means none of the currently supported checks found a problem, not that every possible visual defect has been ruled out.

### Connect a rendered element to its code

- Find likely visible elements from a natural-language query such as “save button” or “hero section.”
- Inspect a selected element on a trusted local page and return viewport context plus runtime source metadata when it is available.
- Use the same source attribution in layout comparison results to help an agent move from a rendered regression to the responsible component.

### Review protected and data-dependent pages

- Preview an authenticated page through a temporary server-side proxy with cookies or safe custom headers.
- Embed pages that would otherwise refuse framing because of frame or CSP headers.
- Inject realistic mock API responses into a proxy session without modifying the application's codebase, so an agent can review useful states even when authentication is unavailable.

### Give coding agents browser tools

Kaleidoscope is available as a stdio MCP server for Claude Code, Codex, Cursor, Windsurf, VS Code, and other MCP clients. It can start its packaged runtime automatically, capture artifacts, inspect local pages, and return structured results instead of only prose.

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
      <strong>Keep reviewing on narrow screens</strong>
      <br />
      Comparison mode falls back to a stacked layout so the workspace stays usable on smaller displays.
    </td>
    <td width="50%" valign="top">
      <img src="assets/readme/overview-local-dev.png" alt="Main Kaleidoscope workspace with local development URL mode enabled" />
      <br />
      <strong>Start local, then automate</strong>
      <br />
      Begin with localhost shortcuts such as <code>3000</code>, then move into inspect, auth, screenshots, walkthroughs, or MCP-driven verification.
    </td>
  </tr>
</table>

## Agent Workflows

### Prove an edit did not disturb the rest of the page

Ask your agent to:

```text
Use Kaleidoscope to capture a layout baseline for http://localhost:3000/checkout on iphone-14, ipad, and desktop. After I edit the checkout form, wait for the app to reload and compare it with the baseline. Report only meaningful layout or text changes and their source locations.
```

The agent can use `kaleidoscope_read_layout`, then `kaleidoscope_observe_layout` (with a watcher) or `kaleidoscope_after_edit` (after a known rebuild). Layout captures are stored in the running server for a limited time; they are not durable project baselines yet.

### Find the code behind a rendered problem

```text
On http://localhost:3000/checkout, find the save button on an iPhone 16 viewport and inspect its source under c:/Code/my-app/src.
```

Use `discover_page_elements` to obtain ranked selector candidates, then `inspect_element_source` for the source payload. Inspect mode only accepts loopback URLs.

### Review a protected state without changing the app

```text
Create an authenticated preview for my local dashboard. If the session cannot authenticate, inject mock responses for the dashboard API and capture the desktop and mobile screenshots.
```

This uses `preview_with_auth`, optionally `inject_mock_data`, then either preview or screenshot tools against the returned proxy URL.

### Produce a reproducible flow artifact

```text
Record an iPhone walkthrough of the sign-in flow: open the form, enter an email, submit it, and wait for the confirmation state.
```

Use `record_walkthrough` with structured steps or its compact scripting syntax.

## MCP Client Setup

No global install is required. Configure your MCP client to run the package through `npx`:

```bash
npx -y kaleidoscope-mcp-server@latest
```

Claude Code, Claude Desktop, Cursor, Windsurf, VS Code, and similar clients:

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

Codex `config.toml`:

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

Codex desktop connector UI:

- Name: `kaleidoscope`
- Transport: `STDIO`
- Command to launch: `npx`
- Arguments: `-y`, `kaleidoscope-mcp-server@latest`
- Environment variable: `KALEIDOSCOPE_SERVER_URL=http://localhost:5000`
- Working directory: leave blank

The npm package includes the Kaleidoscope MCP server, backend, and built web client. When an MCP tool needs Kaleidoscope and no server is already running, it can start the packaged runtime automatically.

### Optional Global Install

```bash
npm install -g kaleidoscope-mcp-server@latest
```

Then run `kaleidoscope-mcp` from the MCP client configuration instead of `npx`.

## MCP Tool Reference

| Tool | Use it for |
| --- | --- |
| `kaleidoscope_status`, `kaleidoscope_start`, `kaleidoscope_stop` | Checking and controlling the local Kaleidoscope runtime. |
| `kaleidoscope_list_devices` | Listing supported device profiles and default screenshot devices. |
| `preview_responsive` | Opening a URL in the Kaleidoscope multi-device workspace. |
| `capture_screenshots` | Saving viewport or full-page screenshots across selected device profiles. |
| `record_walkthrough` | Recording a scripted Playwright interaction as a WebM artifact. |
| `preview_with_auth` | Creating a temporary authenticated proxy preview. |
| `inject_mock_data` | Serving mock API responses through an existing proxy session. |
| `discover_page_elements` | Finding visible elements from a natural-language query. |
| `inspect_element_source` | Resolving a local rendered element to source context. |
| `kaleidoscope_read_layout` | Capturing a structured, optionally source-attributed layout baseline. |
| `kaleidoscope_after_edit` | Recapturing and comparing a page after a known rebuild. |
| `kaleidoscope_observe_layout` | Waiting for the next watcher reload, then recapturing and comparing. |
| `kaleidoscope_scan_breakpoints` | Sweeping a width range to find sampled horizontal-overflow and clipped-control failures. |

The tool descriptions above are also exposed to MCP clients at runtime, so agents can discover the available structured inputs and outputs directly.

## Device Profiles

The shared device catalog includes iPhone 14–17, Samsung Galaxy S21/S24/S24 Ultra/S25 Ultra, Pixel 6, iPad, iPad Pro, MacBook Air, Desktop HD, and Desktop 4K. Use `kaleidoscope_list_devices` for the authoritative runtime list and dimensions.

## Environment Options

- `KALEIDOSCOPE_SERVER_URL`: Kaleidoscope backend URL. Defaults to `http://localhost:5000`.
- `KALEIDOSCOPE_REQUEST_TIMEOUT_MS`: MCP request timeout. Defaults to `60000`.
- `KALEIDOSCOPE_WORKSPACE_ROOT`: source-inspection root for local projects.
- `KALEIDOSCOPE_ARTIFACT_ROOT`: allowed root for user-selected walkthrough output directories.
- `KALEIDOSCOPE_WALKTHROUGH_DIR`: default output directory for walkthrough videos.
- `KALEIDOSCOPE_PROXY_TIMEOUT_MS`: proxy request timeout. Defaults to `30000`.
- `KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES`: proxy response byte limit. Defaults to `10485760`.
- `KALEIDOSCOPE_LAYOUT_CAPTURE_MAX_AGE_MS`: how long in-memory layout captures remain available. Defaults to `7200000` (two hours).
- `KALEIDOSCOPE_LAYOUT_CAPTURE_MAX_COUNT`: maximum in-memory layout captures retained by the server. Defaults to `50`.

## Current Boundaries

- Layout comparison checks captured visible DOM elements, text, and geometry. It does not yet perform pixel-level visual diffing, automatic broad visual issue finding, or persistent named baselines.
- Breakpoint scanning currently detects horizontal document overflow and horizontally clipped in-viewport interactive controls. It reports sampled ranges, not exact CSS-media-query boundaries, and it does not yet diagnose the responsible source rule.
- Layout and screenshot capture use the supported Chromium/Playwright runtime; they are not Safari or Firefox rendering verification.
- Runtime source attribution is best effort and depends on the target app's build/runtime metadata.
- Inspect mode is limited to trusted loopback targets such as `localhost` and `127.0.0.1`.
- Proxy auth sessions and layout captures are temporary, local runtime state.

## Troubleshooting

- `Browser executable not found`: run `npx playwright install chromium` in the environment that launches the MCP server.
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
