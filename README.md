# 🌈 Kaleidoscope

> Responsive design preview tool for developers using Claude Code. See your websites across multiple devices simultaneously before pushing to production.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)

## 🎯 What is Kaleidoscope?

Kaleidoscope is a multi-device preview tool designed for developers using Claude Code who need to validate responsive designs across 8 different device sizes before deploying. It combines:

- **Multi-device preview**: View websites on iPhone, iPad, Desktop simultaneously
- **Localhost support**: Preview your local dev server (`http://localhost:3000`)
- **Auth preview**: Test authenticated pages with cookie injection
- **Interactive flow diagrams**: Map user journeys and test entire flows
- **MCP integration**: Claude can programmatically invoke previews

## ✨ Features

- 📱 8 device types (Mobile, Tablet, Desktop)
- 🔥 Live reload when files change
- 🔐 Authentication support
- 🔄 URL tunneling for web Claude Code users
- 📸 Screenshots (Basic & HD)
- 🔍 Flow diagram search & spotlight
- ⌨️ Keyboard navigation
- 🌙 Dark mode

## 🚀 Quick Start

### Prerequisites

- Node.js 20+
- npm or pnpm
- (Optional) Docker for containerized setup

### Option 1: Manual Setup (Recommended for Development)

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/Kaleidoscope.git
cd Kaleidoscope

# 2. Install dependencies
npm run install:all

# 3. Start development servers
npm run dev:all
```

This starts:
- **Frontend**: the Vite URL printed in the terminal, usually http://localhost:5173 and http://localhost:5174 if 5173 is already occupied
- **Backend**: http://localhost:5000

### Option 2: Docker Development

```bash
# Start development environment with Docker Compose
docker-compose up

# Access Kaleidoscope at http://localhost:5173
```

### Option 3: Docker Production

```bash
# Build and run the production container
docker compose -f docker-compose.prod.yml up --build

# Access Kaleidoscope at http://localhost:5000
# Frontend and API are served from a single container
```

## 📖 How to Use

### Basic Preview

1. Open Kaleidoscope at the frontend URL printed by Vite. In local development this is usually `http://localhost:5173`, and `http://localhost:5174` when 5173 is occupied.
2. In the sidebar, enter a URL: `https://example.com`
3. Press Enter or click the arrow button
4. See your site on 8 different devices!

### Preview Your Local Development Server

```bash
# Terminal 1: Start your dev server
cd your-project
npm run dev
# Running on http://localhost:3000

# Terminal 2: Already running Kaleidoscope
# Just enter: http://localhost:3000 in Kaleidoscope
```

**Note**: Localhost URLs now work! Previously blocked, this has been fixed in the latest version.

### Test With Sample Projects

We include sample projects for testing:

```bash
# Start sample site (port 3000)
cd examples/sample-site
npm install
npm run dev

# Start auth demo (port 3001)
cd examples/auth-demo
npm install
npm run dev
```

Then preview:
- Sample site: `http://localhost:3000`
- Auth demo: `http://localhost:3001`

### Preview Authenticated Pages

Some pages require login (e.g., dashboards). Here's how to preview them:

1. **Start the auth demo**:
   ```bash
   cd examples/auth-demo
   npm run dev
   ```

2. **Log in normally** in a new tab:
   - Go to http://localhost:3001/login
   - Username: `demo`, Password: `demo`
   - You'll be redirected to the dashboard

3. **Get your session cookie**:
   - Open DevTools (F12)
   - Go to Application → Cookies
   - Find `session_token`
   - Copy the value: `demo_session_abc123`

4. **In Kaleidoscope**:
   - Enter URL: `http://localhost:3001/dashboard`
   - Click "Preview with Auth" (coming in next update)
   - Paste cookie name: `session_token`
   - Paste cookie value: `demo_session_abc123`
   - All devices now show the logged-in dashboard!

## 🤖 MCP Server (Claude Code Integration)

Kaleidoscope includes an MCP server that lets Claude Code control previews and screenshots programmatically.

### Setup

Add to your Claude Code MCP config (`~/.claude/claude_desktop_config.json`):

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

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `preview_responsive` | Open a URL for responsive preview across device sizes |
| `capture_screenshots` | Capture screenshots across multiple viewports |
| `discover_page_elements` | Find likely selectors from a natural-language query |
| `inspect_element_source` | Inspect an element by CSS selector and return structured source metadata |
| `kaleidoscope_status` | Check if services are running |
| `kaleidoscope_start` | Start Kaleidoscope services |
| `kaleidoscope_stop` | Stop all services |

### Example Usage (in Claude Code)

```
"Preview my app at localhost:3000 across all mobile devices"
→ Calls preview_responsive(url="http://localhost:3000", devices=["iphone-14","samsung-s21","pixel-6"])

"Take screenshots of my dashboard on desktop and iPad"
→ Calls capture_screenshots(url="http://localhost:3000/dashboard", devices=["desktop","ipad"])

"Find the save button on iPhone 16"
→ Calls discover_page_elements(url="http://localhost:3000/checkout", query="save button", device="iphone-16")

"Inspect the overflowing save button on iPhone 16"
→ Calls inspect_element_source(url="http://localhost:3000/checkout", selector="#save", device="iphone-16", source_dir="C:/Code/my-app/src")
```

## 📸 Screenshots

Capture device screenshots via the sidebar panel or the Screenshot button in the toolbar.

- Select which device viewports to capture
- Toggle full-page capture for scrollable content
- Screenshots are saved to `./screenshots/` as PNG files
- Powered by Playwright + Chromium for pixel-perfect results

### Screenshot API

```bash
# Capture screenshots via API
curl -X POST http://localhost:5000/api/screenshots \
  -H "Content-Type: application/json" \
  -d '{"url":"http://localhost:3000","devices":["iphone-14","desktop"]}'
```

## 🧪 Testing

### Run All Tests

```bash
npm test
```

### Unit Tests (Vitest)

```bash
cd mosaic-client
npm run test

# With UI
npm run test:ui

# With coverage
npm run test:coverage
```

### E2E Tests (Playwright)

```bash
# Run tests
npm run test:e2e

# Interactive mode
npm run test:e2e:ui

# Specific browser
npx playwright test --project=chromium
```

### Manual Testing Checklist

Use this checklist to verify everything works:

#### Basic Functionality
- [ ] Can open Kaleidoscope at the frontend URL printed by Vite
- [ ] Can enter a URL and see it load
- [ ] All 8 devices render correctly
- [ ] Can switch between devices
- [ ] Dark mode toggle works

#### Localhost Support
- [ ] Can preview `http://localhost:3000`
- [ ] Can preview `http://127.0.0.1:3000`
- [ ] No "localhost blocked" error message

#### Device Interaction
- [ ] Can pin devices (click pin icon or press Space)
- [ ] Comparison mode shows pinned devices side-by-side
- [ ] Can toggle comparison mode with C key
- [ ] Can navigate devices with arrow keys

#### Auth Preview (Future)
- [ ] Can capture session cookies
- [ ] Authenticated pages load correctly
- [ ] All devices show logged-in view

## 📁 Project Structure

```
Kaleidoscope/
├── mosaic-client/          # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/          # Custom hooks
│   │   ├── lib/            # Utilities
│   │   ├── pages/          # Page components
│   │   └── tests/          # Unit tests
│   └── vitest.config.ts
├── server/                 # Express backend
│   ├── index.ts
│   ├── routes.ts
│   ├── services/           # Tunnel, watcher, screenshot services
│   └── routes/             # API route handlers
├── mcp-server/             # MCP server for Claude Code integration
│   └── src/
│       ├── index.ts        # MCP server entry point
│       ├── process-manager.ts  # Start/stop Kaleidoscope services
│       └── tools/          # MCP tool definitions
├── examples/               # Sample projects for testing
│   ├── sample-site/        # Basic responsive site
│   └── auth-demo/          # Authentication demo
├── docker-compose.yml      # Docker setup
├── playwright.config.ts    # Playwright configuration
└── package.json           # Monorepo scripts
```

## 🔧 Development

### Available Scripts

```bash
# Development
npm run dev:client          # Start frontend only
npm run dev:server          # Start backend only
npm run dev:all            # Start everything (recommended)
npm run dev:client --port 5174  # Start frontend on an explicit port
npm run dev:all --port 5174     # Start frontend on an explicit port with the backend

# Testing
npm test                   # Run all tests
npm run test:unit          # Unit tests only
npm run test:e2e           # E2E tests only
npm run test:e2e:ui        # E2E tests with UI

# Building
cd mosaic-client && npm run build
cd server && npm run build

# Linting
cd mosaic-client && npm run lint

# Type checking
cd mosaic-client && npm run check
cd server && npm run check

# Docker
npm run docker:up          # Start with Docker
npm run docker:down        # Stop Docker containers
npm run docker:build       # Rebuild images
```

### Technology Stack

**Frontend:**
- React 19 + TypeScript
- Vite 7 (build tool)
- Tailwind CSS v4
- shadcn/ui components
- React Query (data fetching)
- Vitest (testing)

**Backend:**
- Express.js
- TypeScript
- esbuild (bundler)

**Testing:**
- Vitest (unit tests)
- Playwright (E2E tests)
- React Testing Library

## 🐛 Troubleshooting

### "Cannot connect to localhost:3000"

**Problem**: Kaleidoscope can't reach your dev server.

**Solutions**:
1. Ensure your dev server is running: `npm run dev` in your project
2. Check the port number matches
3. Try http://127.0.0.1:3000 instead of localhost

### "Refused to display in a frame"

**Problem**: Website has `X-Frame-Options: DENY` header.

**Explanation**: Some sites (Google, Facebook) block embedding for security.

**Solutions**:
- This is expected behavior for those sites
- Your own localhost sites won't have this restriction
- For production sites, you can't bypass this (it's a security feature)

### "Linked actions blocked private host"

**Problem**: Linked actions need a proxy session so Kaleidoscope can inject the sync bridge, and private hosts are blocked by default.

**Solutions**:
- Prefer `localhost` or `127.0.0.1` when possible.
- For a trusted private dev host, allow it explicitly before starting the server.

```powershell
$env:KALEIDOSCOPE_LINKED_DEV_ALLOWLIST="192.168.1.8:3000"
npm run dev:server
```

```bash
export KALEIDOSCOPE_LINKED_DEV_ALLOWLIST=192.168.1.8:3000
npm run dev:server
```

- Multiple hosts can be comma-separated: `192.168.1.8:3000,host.docker.internal:5173`.
- This allowlist is intended for development only.

### "High memory usage"

**Problem**: Browser using too much RAM with 8 iframes.

**Solutions**:
- Close some device previews
- Use single device mode instead of comparison
- Reduce number of pinned devices
- Restart browser

### Tests Failing

**Problem**: E2E tests fail to connect.

**Solutions**:
```bash
# Install Playwright browsers
npx playwright install

# Make sure servers are running
npm run dev:all

# Run tests again
npm test
```

## 🗺️ Roadmap

### Week 0: Foundation ✅
- [x] Testing infrastructure (Vitest, Playwright)
- [x] Docker Compose setup
- [x] Sample projects
- [x] Remove localhost blocking

### Week 1-2: Core Features ✅
- [x] Tunnel integration (localtunnel + fallbacks)
- [x] Live reload with file watching (chokidar + WebSocket)
- [x] Auth capture wizard

### Week 3-4: MCP Server & Screenshots ✅
- [x] MCP server with process management
- [x] `preview_responsive` tool
- [x] `capture_screenshots` tool
- [x] `kaleidoscope_status`, `kaleidoscope_start`, `kaleidoscope_stop` tools
- [x] Screenshot API with Playwright/Chromium
- [x] Screenshot panel UI in sidebar

### Week 5-7: Flow Diagrams ✅
- [x] React Flow integration with 4 node types (Page, Action, Condition, Note)
- [x] Interactive flow builder with drag-and-drop
- [x] Search & spotlight feature with focus navigation
- [x] Save/load flows (localStorage + JSON export/import)

### Week 8-9: Polish ✅
- [x] Accessibility (ARIA labels, skip-to-content, keyboard focus)
- [x] Mobile responsive layout (sidebar overlay, stacked, icon-only buttons)
- [x] Lazy loading (React.lazy + Suspense)
- [x] Error boundary for crash recovery

### Week 10: Production ✅
- [x] Production Docker build (multi-stage, single container)
- [x] Error boundary for crash recovery
- [x] Environment configuration (.env.example)
- [x] Health checks

## 🤝 Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## 📄 License

MIT License - see [LICENSE](LICENSE) file for details

## 🙏 Acknowledgments

- Built for developers using [Claude Code](https://claude.ai/code)
- Inspired by the need for better responsive design testing
- Powered by React, Vite, and modern web technologies

## 📞 Support

- 📧 Issues: [GitHub Issues](https://github.com/yourusername/Kaleidoscope/issues)
- 💬 Discussions: [GitHub Discussions](https://github.com/yourusername/Kaleidoscope/discussions)
- 📖 Docs: [Full Documentation](https://kaleidoscope-docs.example.com)

---

**Made with ❤️ for the Claude Code community**
