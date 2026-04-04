# kaleidoscope-mcp-server

MCP server for [Kaleidoscope](https://github.com/Nathanael-R/kaleidoscope), a responsive preview and inspection tool for local web apps.

## What it can do

- start and stop Kaleidoscope services
- report service status
- prepare responsive preview sessions
- capture screenshots across multiple devices
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

## MCP client config

Example stdio config:

```json
{
  "command": "npx",
  "args": ["-y", "kaleidoscope-mcp-server"],
  "env": {
    "KALEIDOSCOPE_SERVER_URL": "http://localhost:5000"
  }
}
```

## Environment

- `KALEIDOSCOPE_SERVER_URL`
  Defaults to `http://localhost:5000`.
- `KALEIDOSCOPE_CLIENT_PORT`
  Optional preferred local client port for status and startup checks.

## Notes

- This package talks to the Kaleidoscope server API; it is not a standalone screenshot service by itself.
- Rich screenshot responses use MCP `structuredContent`, `resource_link`, and inline `image` blocks when the client supports them.
- Inspect remains selector-based and is limited to loopback/dev targets.

## Development

```bash
npm install
npm run build
npm run check
npm test
```

## Publish to npm

Run this exact flow from `mcp-server/`:

```bash
npm adduser
npm run publish:check
npm run publish:public
```

`publish:check` runs the build, typecheck, tests, and an `npm publish --dry-run --access public` pass before the real publish.

More detailed usage and testing notes live in the main repository:

- [MCP testing guide](https://github.com/Nathanael-R/kaleidoscope/blob/master/Documentation/MCP-TESTING.md)
- [project README](https://github.com/Nathanael-R/kaleidoscope/blob/master/README.md)
