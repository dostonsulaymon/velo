# Velo — Minimalist Engineering Workspace & Issue Tracker

> A high-density, keyboard-driven issue tracker and engineering workspace inspired by Linear, Raycast, and Vercel. Engineered with zero external npm dependencies using native Node.js 23 standard library and built-in SQLite.

---

## Features

- **Dual View Modes**:
  - **Board View**: Native drag-and-drop Kanban workflow (`Backlog`, `Todo`, `In Progress`, `Done`) with optimistic UI updates and real-time SQLite persistence.
  - **List View**: High-density engineering view with status badges, priority flags, issue keys, and relative dates.
- **Power-User Keyboard Shortcuts**:
  - `⌘K` or `Ctrl+K`: Floating Command Palette with fuzzy search across issues and quick workspace actions.
  - `C`: Quick-create new issue modal from anywhere.
  - `/`: Focus global search filter.
  - `Esc`: Close modals and slide-overs.
- **Slide-Over Detail Drawer**:
  - Full issue inspection with inline editable title, status and priority dropdowns, markdown descriptions, and automated activity timeline.
- **Zero External Dependencies**:
  - Built entirely on Node.js 23's native `node:http`, `node:sqlite` (`DatabaseSync`), `node:crypto`, and `node:test`.
- **Data Portability**:
  - 1-click export to CSV and JSON formats.

---

## Quickstart

### Prerequisites
- Node.js >= 22.5.0 (Node.js 23 recommended)

### Run
```bash
# Start server
node server.js

# Or with npm script
npm start
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### Run Tests
```bash
node --test tests/server.test.js
# or
npm test
```

---

## License
MIT
