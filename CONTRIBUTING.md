# Contributing

## Local Setup

```bash
npm run install:all
npm run install:browsers
npm run dev:all
```

`npm run install:browsers` is only required for screenshots and Playwright-based testing.

## Before Opening a Pull Request

Run the same baseline checks used by CI:

```bash
npm run lint
npm run check
npm run test:ci
```

If your change touches screenshots, browser automation, or end-to-end behavior, also run:

```bash
npm run test:e2e
```

If you are publishing the public npm package for the MCP server, run the release scripts in `mcp-server/` (`npm run publish:check`, then `npm run publish:public`).

## Scope Expectations

- Keep changes focused.
- Prefer small, reviewable pull requests.
- Add or update tests when changing behavior.
- Update docs when commands, environment variables, or product scope changes.

## Security

Do not open public issues for undisclosed security problems. Use the process in [SECURITY.md](SECURITY.md).
