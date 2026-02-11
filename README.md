# Kiro Account Manager

A desktop application for managing Kiro accounts, usage tracking, and subscriptions. Built with Electron, React, and TypeScript.

## Features

- Multi-account management with groups and tags
- Real-time usage and quota tracking
- Auto-registration with Playwright browser automation
- OAuth authentication (Google, GitHub, AWS Builder ID)
- SSO token and OIDC credential import
- Machine ID management for device identification
- MCP server configuration
- Steering file editor for AI behavior rules
- Import/Export accounts (JSON, CSV, TXT)
- Dark/Light theme support
- Auto-updates via GitHub releases

## Tech Stack

- Electron 38
- React 19
- TypeScript
- Tailwind CSS v4
- Zustand (state management)
- Playwright (browser automation)
- electron-updater (auto-updates)

## Prerequisites

- Node.js 18+
- npm or yarn

## Installation

```bash
# Install dependencies
npm install

# Install Playwright browser (required for auto-registration)
npm run install-browser
```

## Development

```bash
# Start development server with hot reload
npm run dev
```

## Build

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:mac    # macOS
npm run build:win    # Windows
npm run build:linux  # Linux
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Typecheck and build |
| `npm run build:mac` | Build macOS distribution |
| `npm run build:win` | Build Windows distribution |
| `npm run build:linux` | Build Linux distribution |
| `npm run typecheck` | Run TypeScript type checking |
| `npm run lint` | Run ESLint |
| `npm run format` | Format code with Prettier |
| `npm run install-browser` | Install Playwright Chromium |

## Project Structure

```
src/
├── main/           # Electron main process
│   ├── index.ts        # Main entry, IPC handlers, API calls
│   ├── autoRegister.ts # Playwright browser automation
│   └── machineId.ts    # Machine ID utilities
├── preload/        # Electron preload scripts
│   ├── index.ts        # IPC API for renderer
│   └── index.d.ts      # Type definitions
└── renderer/       # React frontend
    └── src/
        ├── components/ # UI components
        ├── store/      # Zustand state
        ├── types/      # TypeScript types
        └── styles/     # CSS styles
```

## License

MIT
