# Release Readiness Checklist

## Security

- [x] Local API defaults to loopback binding.
- [x] MCP startup avoids shell/cmd fallback.
- [x] Source reads are bounded by `KALEIDOSCOPE_WORKSPACE_ROOT`.
- [x] Walkthrough artifact paths are bounded.
- [x] Proxy responses have timeouts and size limits.
- [x] `npm audit --workspaces --audit-level=moderate` reports zero vulnerabilities.
- [ ] Review any future new tool arguments as hostile input before release.

## Packaging

- [x] `kaleidoscope-mcp-server` package includes MCP server, backend, and web client.
- [x] `npm pack --dry-run` includes runtime files under `dist/app`.
- [x] Package exposes `kaleidoscope-mcp`.
- [ ] Test published tarball install on clean Windows, macOS, and Linux machines.

## Installation

- [x] README documents npm install without cloning the repo.
- [x] README documents Playwright Chromium install.
- [x] Compatibility guide documents Windows, macOS, Linux, Docker, WSL, Git Bash, PowerShell, and CMD notes.
- [ ] Verify at least one MCP client on each OS.

## Cross-Platform Support

- [x] CI workflow now targets Ubuntu, Windows, and macOS.
- [x] Windows `.cmd` npm shims are resolved to Node entrypoints where possible.
- [x] Docker explicitly opts into `HOST=0.0.0.0`.
- [ ] Confirm real CI matrix results before publishing.

## Tests

- [x] Type-check client, server, and MCP.
- [x] Client unit tests pass.
- [x] Server unit/integration tests pass.
- [x] MCP integration tests pass.
- [x] Added security regression tests for source path boundaries and artifact output paths.

## Documentation

- [x] `SECURITY_AUDIT.md` added.
- [x] `COMPATIBILITY.md` added.
- [x] README updated with safer setup and troubleshooting.
- [x] MCP README updated with environment and verification guidance.

