# Keepr

![Keepr Logo](./assets/logo.png)

**Capture anything. Find everything.**

Keepr is a modern personal knowledge repository and digital memory vault built to seamlessly capture, structure, and retrieve notes, bookmarks, screenshots, documents, and quotes.

---

## Table of Contents

- [Logo](#logo)
- [Product Screenshots](#product-screenshots)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Setup & Installation](#setup--installation)
- [Environment Configuration (.env.example)](#environment-configuration-envexample)
- [.gitignore & Repository Hygiene](#gitignore--repository-hygiene)
- [Screenshots Gallery](#screenshots-gallery)
- [Roadmap](#roadmap)
- [Known Limitations](#known-limitations)
- [License](#license)

---

## Logo

The official Keepr brand icon:

![Keepr Brand Icon](./assets/logo.png)

---

## Product Screenshots

### Main Workspace Dashboard
![Keepr Main Workspace Dashboard](./assets/screenshots/home_page_initial_1785408838309.png)

### Quick "Keep" Item Capture Modal
![Quick Keep Modal](./assets/screenshots/keep_modal_open_1785408700430.png)

### Item Detail Drawer & Editor
![Item Detail Drawer](./assets/screenshots/detail_drawer_open_1785408889640.png)

---

## Features

- 📝 **Rich Text Notes**: Capture structured thoughts, code snippets, meeting minutes, and journal entries.
- 🔗 **Web Link Bookmarks**: Store external URLs with domain favicon extraction, title metadata, and quick launch links.
- 🖼️ **Visual Images**: Upload screenshots and visual references with inline preview lightboxes and full resolution downloads.
- 📄 **PDF Documents**: Store and view document references with formatted file size indicators.
- 💬 **Quotes & Excerpts**: Highlight key quotes alongside author or source attributions.
- 🔍 **Instant Fuzzy Search**: Real-time trigram-powered search across titles, content body, and tags (`Cmd+K` / `Ctrl+K`).
- 🏷️ **Tagging Taxonomy**: Organize entries with custom user-defined tags and filter chips.
- 🌙 **Adaptive Themes**: Light and dark mode support automatically tuned for eye comfort.
- 🔐 **Dual Persistence Engine**: Guest Mode local storage fallback + Full Cloud Sync (Supabase Postgres & Cloud Storage).
- 🔑 **Authentication Options**: Email/Password login and Google OAuth 2.0 integration.

---

## Tech Stack

### Frontend
- **Framework**: React 19 (TypeScript)
- **Styling**: Tailwind CSS v4, Custom CSS Variables
- **Icons**: Lucide Icons (`lucide-react`)
- **Animation**: Motion (`motion`)
- **Build System**: Vite 6

### Backend & Database
- **API Server**: Express 4 / Node.js
- **Database**: PostgreSQL 15+ (Supabase Postgres) with `pg_trgm` fuzzy search index
- **Authentication**: Supabase Auth (Email/Password & Google OAuth)
- **Object Storage**: Supabase Cloud Storage

---

## Architecture

Keepr follows a modular repository layer architecture:

```
┌─────────────────────────────────────────────────────────┐
│                     React 19 Frontend                   │
│       (App.tsx, DetailDrawer, KeepModal, FilterBar)     │
└───────────────────────────┬─────────────────────────────┘
                            │
              ┌─────────────┴─────────────┐
              ▼                           ▼
┌───────────────────────────┐   ┌─────────────────────────┐
│  Supabase Repository      │   │ LocalStorage Repository │
│  (Cloud Sync & Storage)   │   │ (Guest Mode Fallback)   │
└─────────────┬─────────────┘   └─────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────────────────────┐
│            Supabase Postgres DB & Cloud Storage         │
│          Row Level Security (RLS) User Isolation        │
└─────────────────────────────────────────────────────────┘
```

1. **Client Layer**: Modular SPA with dynamic hashtag view routing (`#home`, `#search`, `#settings`).
2. **Repository Abstraction Pattern**: `RepositoryService` cleanly toggles between `SupabaseArtifactRepository` and offline `LocalStorageArtifactRepository`.
3. **Database Security Model**: PostgreSQL Row Level Security (RLS) policies enforce strict per-user data isolation (`auth.uid() = user_id`).

---

## Setup & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **pnpm** / **bun**

### 1. Clone the Repository
```bash
git clone https://github.com/your-username/keepr.git
cd keepr
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Environment Setup
Copy `.env.example` to `.env` and fill in your keys:
```bash
cp .env.example .env
```

### 4. Database Setup (Supabase)
Execute the SQL schema in `supabase-schema.sql` inside your Supabase SQL Editor.

### 5. Start Development Server
```bash
npm run dev
```

### 6. Build for Production
```bash
npm run build
npm run start
```

---

## Environment Configuration (.env.example)

Your environment file should match the following keys defined in `.env.example`:

```env
# Gemini AI API Key (Server-Side)
GEMINI_API_KEY="your_gemini_api_key_here"

# Application Base URL
APP_URL="http://localhost:3000"

# Supabase Configuration
VITE_SUPABASE_URL="https://your-project-id.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key-here"
```

---

## .gitignore & Repository Hygiene

The project `.gitignore` prevents sensitive configuration files and build artifacts from entering source control:

```gitignore
node_modules/
dist/
build/
.env
.env.local
.DS_Store
*.log
```

---

## Screenshots Gallery

### Settings Screen (Light Theme)
![Settings Light](./assets/screenshots/settings_page_light_1785408850653.png)

### Settings Screen (Dark Theme)
![Settings Dark](./assets/screenshots/settings_page_dark_1785408857499.png)

### Compact Mode View
![Settings Compact](./assets/screenshots/settings_page_compact_1785408867759.png)

---

## Roadmap

- [ ] **AI Semantic Search**: Vector embeddings (`pgvector`) for conceptual document searching.
- [ ] **Smart Auto-Tagging**: AI-assisted categorization for saved links and notes.
- [ ] **Browser Extension**: One-click web clipper extension.
- [ ] **Folders & Collections**: Nested directories for organizing personal knowledge workspaces.

---

## Known Limitations

- **Guest Mode Storage Limit**: Guest mode uses browser `localStorage` (capped at ~5MB). Use Supabase Cloud Sync for heavy image or PDF assets.
- **Upload File Size**: Default Supabase Storage policies limit individual uploads to 50MB.
- **iFrame Sandbox**: OAuth popups require running the app in a standalone tab if embedded within restrictive iFrame containers.

---

## License

**Proprietary / All Rights Reserved**

Copyright (c) 2026 Keepr. All Rights Reserved.

This repository and codebase are private and proprietary. Unauthorized copying, distribution, or modification of this project via any medium is strictly prohibited. See [LICENSE](./LICENSE) for full details.
