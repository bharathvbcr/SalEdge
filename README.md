# Battery Shop Management System (BSMS)

Multi-user battery shop ERP: sales, inventory, purchases, GST reports, warranty, and services.

## Quick Start

```bash
npm install
npm run dev
```

- **Frontend:** http://localhost:3000
- **API:** http://localhost:3001

### Local AI with Ollama (smart caching built in)

1. Install and run Ollama, then pull models once:

```bash
ollama pull phi3:mini llama3.2:3b llama3.1:8b llama3.2-vision
ollama serve
```

2. Start the app as usual — the semantic layer (cache, routing, RAG compression) **starts automatically** with the API server:

```bash
npm run dev
```

On first run, Python dependencies install automatically (~1–2 min). After that, startup is fast.

Enable **Ollama** in **Settings → AI Assistant**. Chat and insights use smart caching transparently; invoice OCR uses the vision model directly. If the semantic layer is still warming up, requests fall back to direct Ollama with no action needed.

Optional: `npm run semantic:setup` for manual install, or `SEMANTIC_LAYER_AUTO_START=false` in `.env` to disable auto-start.

Default logins (change in production):
- `admin` / `admin123`
- `staff` / `staff123`

## Production

```bash
cp .env.example .env   # set JWT_SECRET and other vars
npm run build
npm start
```

Serves the built UI and API on port `3001` (or `PORT`).

## Desktop (Tauri)

Build and run as a native desktop app. The desktop build bundles the React UI and starts the Express/SQLite API server locally.

**Prerequisites:** [Rust](https://rustup.rs/) and Node.js.

```bash
npm install
npm run tauri:dev      # development — Vite + API + desktop window
npm run tauri:build    # production installer (.dmg / .msi / .AppImage)
```

- **Dev:** opens the Vite dev server at `http://localhost:3000` (API proxied to port `3001`).
- **Release:** serves the built app from `http://localhost:3001`; SQLite data is stored in the OS app data directory.

| Command | Description |
|---------|-------------|
| `npm run tauri:dev` | Desktop app in development mode |
| `npm run tauri:build` | Build desktop installer for current platform |
| `npm run build:desktop` | Build frontend + bundled server (used by Tauri) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | API server port |
| `JWT_SECRET` | *(dev only)* | **Required in production** — random 32+ char string |
| `DATABASE_PATH` | `data/bsms.sqlite` | SQLite database file |
| `ALLOW_REGISTRATION` | `false` | Set `true` to allow self-registration (not recommended) |
| `SEMANTIC_LAYER_URL` | `http://127.0.0.1:8090` | Semantic layer URL (auto-started with API server) |
| `SEMANTIC_LAYER_AUTO_START` | `true` | Start semantic layer when the API server boots |
| `SEMANTIC_LAYER_ENABLED` | `true` | Route Ollama chat/insights through semantic layer |
| `OLLAMA_BASE_URL` | `http://127.0.0.1:11434` | Direct Ollama URL (vision OCR + fallback) |

See `semantic_layer/README.md` for full `SEMANTIC_*` tuning options.
## Architecture

- **Frontend:** React + Vite, talks to `/api` (proxied in dev)
- **Backend:** Express + SQLite (`better-sqlite3`)
- **Auth:** JWT (7-day expiry), session timeout after 30 min idle
- **Multi-user:** Shared SQLite DB; optimistic locking on data saves (409 on conflict)

### Data storage

All shop data lives in SQLite. Legacy `data/store.json` is auto-migrated on first start.

To import old per-browser `localStorage` data: sign in → **Settings → Data Management** (banner appears if legacy data detected).

## User Management

Admins can create/deactivate users and reset passwords under **Settings → User Management**.

Staff and admin have the same app access (no role-based page restrictions).

## GST Features

- **GSTR-1:** B2B, B2CS, HSN CSV export
- **GSTR-3B:** Summary with ITC and net tax payable
- **E-Invoice / E-Way Bill:** Mock generation by default; configure GSP URL + API key in Settings for live integration

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | API + Vite dev servers |
| `npm run build` | Production frontend build |
| `npm run start` | Production API (+ static UI) |
| `npm run tauri:dev` | Desktop app (dev) |
| `npm run tauri:build` | Desktop installer build |
