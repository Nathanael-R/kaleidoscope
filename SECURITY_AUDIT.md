# Security Audit

Date: 2026-05-22

## Executive Summary

- Overall risk level after this pass: Medium.
- Safe for normal users right now: Yes, with the documented local-machine permissions and Playwright browser dependency.
- Cross-platform ready: Mostly. Windows process startup, npm package runtime, and CI coverage were improved; real Windows/macOS CI runs should be watched before release.
- Ready to publish/distribute: Close, but publish only after a clean CI matrix run and one install-from-npm smoke test on Windows, macOS, and Linux.

Top issues fixed in this pass:

1. Server defaulted to `0.0.0.0`, exposing management APIs on the LAN.
2. Inspect/source mapping could read absolute runtime file paths outside the chosen source directory.
3. User-provided source directories were accepted without a workspace boundary.
4. Proxy requests had no fetch timeout or response-size cap and could preserve unsafe response headers.
5. Windows MCP process startup could fall back to shell/cmd behavior.

## Fixed Issues

### 1. LAN-exposed management server

- File: `server/index.ts`
- Severity: High
- Problem: The server listened on `0.0.0.0` by default. Management endpoints depend on a trusted client header, which is not a network authentication boundary.
- Scenario: Another machine on the same network could reach the API if it knew the port and spoofed `X-Kaleidoscope-Client`.
- Fix: Default bind host is now `127.0.0.1`; Docker explicitly sets `HOST=0.0.0.0`.
- Patched now: Yes.

### 2. Source inspection arbitrary file read

- File: `server/services/inspect.service.ts`
- Severity: High
- Problem: Runtime element metadata could provide an absolute `filePath`; if the file existed, the server read source lines from it even when outside `sourceDir`.
- Scenario: A hostile local page could report a path to a sensitive local file and cause snippets to be returned to the MCP client.
- Fix: Exact and stack paths are now resolved only inside the approved `sourceDir`; outside absolute paths are reduced to basenames and never read.
- Patched now: Yes, with regression coverage.

### 3. Unbounded/unsafe `sourceDir`

- Files: `server/routes/inspect.routes.ts`, `server/routes/performance.routes.ts`, `server/utils/path-policy.ts`
- Severity: High
- Problem: `sourceDir` was resolved directly and could point anywhere the process could read.
- Scenario: An MCP client could ask for inspection/performance mapping against a private directory such as a home folder.
- Fix: Added `KALEIDOSCOPE_WORKSPACE_ROOT` and bounded path validation. `sourceDir` must exist, be a directory, avoid `..`, and stay inside that root.
- Patched now: Yes, with tests.

### 4. Proxy timeout and memory limits

- File: `server/services/proxy.service.ts`
- Severity: High
- Problem: Proxy fetches and response reads had no explicit timeout or size cap.
- Scenario: A target could hang the proxy or return a very large response that consumes memory.
- Fix: Added `KALEIDOSCOPE_PROXY_TIMEOUT_MS`, `KALEIDOSCOPE_PROXY_MAX_RESPONSE_BYTES`, streamed response reads, mock data limits, and safer response headers.
- Patched now: Yes.

### 5. Windows shell/cmd fallback

- Files: `mcp-server/src/process-manager.ts`, `scripts/run-dev-all.mjs`, `scripts/run-client-dev.mjs`
- Severity: High
- Problem: Some startup paths could use command-shell fallbacks or hard-to-debug `.cmd` shim behavior.
- Scenario: Users hit errors like `spawn C:\Windows\system32\cmd.exe ENOENT`, or startup depended on shell behavior that varies across PowerShell, CMD, Git Bash, and WSL.
- Fix: Local npm shims are resolved to Node entrypoints where possible; missing local binaries now fail with clear instructions instead of shell fallback. Dev scripts avoid `cmd.exe`.
- Patched now: Yes.

### 6. Error/log data exposure

- Files: `server/utils/logger.ts`, `server/utils/http.ts`, `mcp-server/src/tool-utils.ts`, multiple routes/services
- Severity: Medium
- Problem: Some errors returned raw exception messages or logged stack traces/full paths.
- Scenario: Local absolute paths, stack traces, or sensitive request details could be exposed to an MCP client or logs.
- Fix: Sanitized MCP tool errors, limited error length, hid stacks unless `KALEIDOSCOPE_DEBUG_ERRORS=1`, and replaced several raw route/service errors with safe messages.
- Patched now: Yes.

### 7. Walkthrough output path and step limits

- File: `mcp-server/src/tools/walkthrough.ts`
- Severity: Medium
- Problem: `output_dir` could write anywhere the MCP process could access, and scripts/steps were unbounded.
- Scenario: A hostile client could write large artifacts outside expected output locations or run extremely long scripts.
- Fix: `output_dir` is bounded by `KALEIDOSCOPE_ARTIFACT_ROOT`/`KALEIDOSCOPE_WALKTHROUGH_DIR`, URLs are restricted to HTTP(S), steps/scripts/selectors/text are capped, and navigation has explicit timeouts.
- Patched now: Yes, with tests.

### 8. Dependency advisories

- File: `package-lock.json`
- Severity: High
- Problem: `npm audit --workspaces` reported one high and five moderate transitive advisories.
- Scenario: A vulnerable transitive parser/server/test dependency could be exploitable if code paths were reached.
- Fix: Ran `npm audit fix --workspaces`; audit now reports zero vulnerabilities.
- Patched now: Yes.

## Remaining Risks

- The proxy intentionally supports loopback targets for local development. This is useful, but it means the tool can request local HTTP services. Keep the server bound to loopback unless intentionally running Docker/LAN mode.
- Tunnel creation intentionally exposes a local port through `cloudflared` or `ngrok`. Treat tunnel URLs as public.
- Screenshot and walkthrough tools create local artifacts and return local paths. This is expected for MCP clients, but users should not run the MCP against untrusted client prompts without understanding that tools can create files inside configured artifact roots.
- Playwright browser installation is external. Missing browsers produce runtime failures until `npx playwright install chromium` is run.
- DNS rebinding cannot be fully eliminated with Node `fetch`; validation is repeated before proxy requests, but the strongest practical mitigation is loopback-only server binding.

## Security Checklist

- [x] No default LAN bind for the local API.
- [x] No shell fallback for MCP-managed Windows startup.
- [x] Source reads bounded by `KALEIDOSCOPE_WORKSPACE_ROOT`.
- [x] Artifact writes bounded for walkthrough outputs.
- [x] Proxy timeout and response-size limits.
- [x] Mock route count and payload-size limits.
- [x] Error messages sanitized and stack traces gated behind debug mode.
- [x] Dependency audit clean after lockfile update.
- [x] Tests cover path boundaries and Windows command shim behavior.
- [ ] Run full CI matrix on Windows, macOS, and Linux before publishing.
- [ ] Run install-from-package smoke tests on clean machines.

