# 🛠️ Development Guide

This guide explains how to develop and test Kaleidoscope locally.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Development Workflow](#development-workflow)
- [Testing Strategy](#testing-strategy)
- [Architecture Overview](#architecture-overview)
- [Common Tasks](#common-tasks)
- [Debugging](#debugging)

## Prerequisites

### Required
- **Node.js**: v20 or higher
- **npm**: v9 or higher (or pnpm/yarn)
- **Git**: For version control

### Optional
- **Docker**: For containerized development
- **ngrok**: For tunnel testing (coming soon)
- **VS Code**: Recommended IDE with extensions:
  - ESLint
  - Prettier
  - TypeScript Vue Plugin
  - Tailwind CSS IntelliSense

## Initial Setup

### 1. Clone and Install

```bash
# Clone repository
git clone https://github.com/yourusername/Kaleidoscope.git
cd Kaleidoscope

# Install root dependencies
npm install

# Install all workspace dependencies
npm run install:all
```

This installs dependencies for:
- Root monorepo
- `mosaic-client/` (frontend)
- `server/` (backend)
- `examples/sample-site/`
- `examples/auth-demo/`

### 2. Verify Installation

```bash
# Check TypeScript compilation
cd mosaic-client && npm run check
cd ../server && npm run check

# Run tests
cd .. && npm test
```

### 3. Start Development Servers

```bash
# Option A: All servers at once (recommended)
npm run dev:all

# Option B: Individual terminals
# Terminal 1:
npm run dev:client

# Terminal 2:
npm run dev:server
```

### 4. Access Applications

- **Kaleidoscope Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000/api/health
- **Sample Site**: http://localhost:3000 (after `cd examples/sample-site && npm run dev`)
- **Auth Demo**: http://localhost:3001 (after `cd examples/auth-demo && npm run dev`)

## Development Workflow

### Daily Development

```bash
# 1. Pull latest changes
git pull origin main

# 2. Install any new dependencies
npm run install:all

# 3. Start development
npm run dev:all

# 4. Make your changes...

# 5. Run tests
npm test

# 6. Commit and push
git add .
git commit -m "Your message"
git push
```

### Hot Reload

Both frontend and backend support hot reload:

- **Frontend (Vite)**: Changes reflect instantly
- **Backend (tsx)**: Server restarts automatically on file changes

### Code Style

We use ESLint and TypeScript for code quality:

```bash
# Lint frontend
cd mosaic-client && npm run lint

# Fix lint issues
cd mosaic-client && npm run lint -- --fix

# Type check
npm run check
```

## Testing Strategy

### Unit Tests (Vitest)

Located in `mosaic-client/src/tests/` and `tests/unit/`.

```bash
# Run unit tests
npm run test:unit

# Watch mode (re-runs on file changes)
cd mosaic-client && npm run test

# UI mode (interactive)
cd mosaic-client && npm run test:ui

# Coverage report
cd mosaic-client && npm run test:coverage
```

**Writing Unit Tests:**

```typescript
// Example: mosaic-client/src/lib/__tests__/devices.test.ts
import { describe, it, expect } from 'vitest';
import { getDevicesByCategory } from '../devices';

describe('getDevicesByCategory', () => {
  it('should group devices by category', () => {
    const grouped = getDevicesByCategory();

    expect(grouped).toHaveProperty('Mobile');
    expect(grouped).toHaveProperty('Tablet');
    expect(grouped).toHaveProperty('Desktop');
  });
});
```

### E2E Tests (Playwright)

Located in `tests/e2e/`.

```bash
# Run E2E tests
npm run test:e2e

# Interactive UI mode
npm run test:e2e:ui

# Specific test file
npx playwright test tests/e2e/preview.spec.ts

# Debug mode
npx playwright test --debug

# Generate report
npx playwright show-report
```

**Writing E2E Tests:**

```typescript
// Example: tests/e2e/auth-preview.spec.ts
import { test, expect } from '@playwright/test';

test('should preview authenticated dashboard', async ({ page }) => {
  // Navigate to Kaleidoscope
  await page.goto('http://localhost:5173');

  // Enter auth demo URL
  await page.fill('input[type="url"]', 'http://localhost:3001/dashboard');
  await page.press('input[type="url"]', 'Enter');

  // Verify iframe loaded (might show login page initially)
  const iframe = page.frameLocator('iframe').first();
  await expect(iframe.locator('body')).toBeVisible();
});
```

### Manual Testing

Use the **manual testing checklist** in README.md.

Also test with the sample projects:

```bash
# Terminal 1: Kaleidoscope
npm run dev:all

# Terminal 2: Sample site
cd examples/sample-site && npm run dev

# Terminal 3: Auth demo
cd examples/auth-demo && npm run dev

# Now test:
# 1. Preview http://localhost:3000
# 2. Preview http://localhost:3001
# 3. Test auth flow at http://localhost:3001/login
```

## Architecture Overview

### Frontend (mosaic-client/)

```
src/
├── components/           # React components
│   ├── ui/              # shadcn/ui components
│   ├── header.tsx       # Top navigation
│   ├── sidebar.tsx      # Device selector & URL input
│   ├── preview-area.tsx # Device grid
│   └── device-frame.tsx # Individual device mockup
├── hooks/               # Custom React hooks
│   ├── use-recent-urls.tsx
│   └── use-mobile.tsx
├── lib/                 # Utilities & configuration
│   ├── devices.ts       # Device definitions
│   ├── queryClient.ts   # React Query setup
│   └── utils.ts         # Helper functions
├── pages/               # Page components
│   └── home.tsx         # Main application page
├── tests/               # Test setup
│   └── setup.ts
└── main.tsx            # Entry point
```

**Key Concepts:**

- **State Management**: React Query for async state, useState for local state
- **Styling**: Tailwind CSS with shadcn/ui components
- **Routing**: Wouter (lightweight client-side router)
- **Device Frames**: iframe-based preview with device chrome

### Backend (server/)

```
server/
├── index.ts       # Express app setup & middleware
├── routes.ts      # API route definitions
└── types.ts       # TypeScript type definitions
```

**Current Endpoints:**

- `GET /api/health` - Health check

**Future Endpoints:**

- `POST /api/tunnel` - Create ngrok tunnel
- `POST /api/screenshot` - Capture HD screenshot
- `GET /api/tunnel/status` - Check tunnel status

## Common Tasks

### Adding a New Component

```bash
# Create component file
touch mosaic-client/src/components/my-component.tsx

# Create test file
touch mosaic-client/src/components/__tests__/my-component.test.tsx
```

```typescript
// mosaic-client/src/components/my-component.tsx
import { cn } from "@/lib/utils";

interface MyComponentProps {
  className?: string;
}

export default function MyComponent({ className }: MyComponentProps) {
  return (
    <div className={cn("p-4", className)}>
      My Component
    </div>
  );
}
```

### Adding a New Device

```typescript
// mosaic-client/src/lib/devices.ts
export const devices: Device[] = [
  // ... existing devices
  {
    id: 'new-device',
    name: 'New Device',
    width: 1024,
    height: 768,
    icon: 'tablet-alt',
    type: 'tablet',
    category: 'Tablet'
  }
];
```

### Adding an API Endpoint

```typescript
// server/routes.ts
import { Router } from 'express';

const router = Router();

router.get('/api/my-endpoint', (req, res) => {
  res.json({ message: 'Hello from new endpoint' });
});

export default router;
```

### Adding Dependencies

```bash
# Frontend dependency
cd mosaic-client
npm install package-name

# Backend dependency
cd server
npm install package-name

# Dev dependency
npm install -D package-name
```

## Debugging

### Frontend Debugging

**Browser DevTools:**

```javascript
// Add breakpoints in sources
debugger;

// Console logging
console.log('Device selected:', device);

// React DevTools
// Install React DevTools extension
```

**VS Code Debugging:**

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "chrome",
      "request": "launch",
      "name": "Launch Chrome",
      "url": "http://localhost:5173",
      "webRoot": "${workspaceFolder}/mosaic-client/src"
    }
  ]
}
```

### Backend Debugging

```bash
# Run with debugger
cd server
node --inspect node_modules/.bin/tsx index.ts

# Attach VS Code debugger to port 9229
```

### Common Issues

#### Port Already in Use

```bash
# Find process using port 5173
lsof -i :5173

# Kill process
kill -9 <PID>

# Or use different port
PORT=5174 npm run dev
```

#### Module Not Found

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

#### TypeScript Errors

```bash
# Restart TypeScript server in VS Code
# Cmd/Ctrl + Shift + P → "TypeScript: Restart TS Server"

# Check for type errors
npm run check
```

#### Tests Failing

```bash
# Clear test cache
npx vitest run --clearCache

# Re-install Playwright browsers
npx playwright install
```

#### Playwright Chromium (Screenshots & Flows)

Kaleidoscope uses `playwright-core`, so browsers are not auto-downloaded.

```bash
# Recommended: install Playwright-managed Chromium once
npx playwright install chromium

# Alternative: use system Chrome/Chromium
export PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH="/path/to/chrome"
```

**Tradeoffs**:
- Playwright-managed Chromium is consistent across machines.
- System Chrome avoids downloads but can behave differently across versions.

## Performance Optimization

### Frontend Optimization

```typescript
// Use React.memo for expensive components
export default React.memo(DeviceFrame);

// Lazy load components
const FlowDiagram = lazy(() => import('./components/flow-diagram'));

// Virtualize long lists
import { useVirtualizer } from '@tanstack/react-virtual';
```

### Build Optimization

```bash
# Analyze bundle size
cd mosaic-client
npm run build
npx vite-bundle-visualizer
```

## Git Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation
- `test/description` - Test additions
- `refactor/description` - Code refactoring

### Commit Messages

Follow conventional commits:

```bash
git commit -m "feat: add tunnel integration"
git commit -m "fix: localhost blocking in device-frame"
git commit -m "docs: update README with testing instructions"
git commit -m "test: add E2E tests for auth preview"
```

### Pull Request Process

1. Create feature branch
2. Make changes
3. Run tests: `npm test`
4. Push to GitHub
5. Open Pull Request
6. Wait for CI checks
7. Address review feedback
8. Merge when approved

## Next Steps

Now that you understand the development workflow:

1. Check out the [Roadmap](README.md#roadmap) to see what's being built
2. Look at [open issues](https://github.com/yourusername/Kaleidoscope/issues) for tasks
3. Read the [Architecture PRD](PRD.md) for detailed technical specs
4. Join discussions in [GitHub Discussions](https://github.com/yourusername/Kaleidoscope/discussions)

Happy coding! 🎉
