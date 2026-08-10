<div align="center">
  <img src="assets/logo.png" alt="Keepr Logo" width="160" style="border-radius: 24px; margin-bottom: 12px;">
  <h1>Keepr</h1>
  <p><strong>Capture anything. Find everything.</strong></p>
  <p>A modern, privacy-first personal knowledge repository and digital memory vault built to seamlessly capture, structure, and retrieve notes, bookmarks, screenshots, documents, and quotes.</p>

  <p>
    <a href="#license"><img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License: MIT"></a>
    <a href="#tech-stack"><img src="https://img.shields.io/badge/React-19-blue.svg" alt="React 19"></a>
    <a href="#tech-stack"><img src="https://img.shields.io/badge/Vite-6-purple.svg" alt="Vite 6"></a>
    <a href="#tech-stack"><img src="https://img.shields.io/badge/Tailwind-v4-06B6D4.svg" alt="Tailwind CSS v4"></a>
    <a href="#tech-stack"><img src="https://img.shields.io/badge/Database-Supabase%20Postgres-3ECF8E.svg" alt="Supabase Postgres"></a>
  </p>
</div>

---

## Table of Contents

- [Overview](#overview)
- [Logo](#logo)
- [Product Screenshots](#product-screenshots)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Architecture](#architecture)
- [Setup & Installation](#setup--installation)
- [Environment Configuration (.env.example)](#environment-configuration-envexample)
- [Git & Repository Hygiene (.gitignore)](#git--repository-hygiene-gitignore)
- [Screenshots Gallery](#screenshots-gallery)
- [Roadmap](#roadmap)
- [Known Limitations](#known-limitations)
- [License](#license)

---

## Overview

In today's fast-paced digital ecosystem, valuable insights, bookmark links, meeting notes, code snippets, visual research, and paper summaries are fragmented across browser tabs, messaging apps, and ephemeral scratchpads.

**Keepr eliminates digital sprawl** by providing a unified, high-performance workspace where information can be captured effortlessly and retrieved instantly. Whether you are storing a quick text note, a web link, an annotated PDF, or a visual reference image, Keepr organizes your data securely with tag-based taxonomies, instant trigram fuzzy search, and cloud synchronization.

---

## Logo

The official Keepr brand logo features a dark forest green canvas with a light green bookmark icon and clean typography:

<div align="center">
  <img src="assets/logo.png" alt="Keepr Logo" width="220" style="border-radius: 28px; border: 1px solid #e5e7eb;">
</div>

---

## Product Screenshots

### Main Workspace Dashboard
![Keepr Main Workspace Dashboard](assets/screenshots/home_page_initial_1785408838309.png)

### Quick "Keep" Item Capture Modal
![Quick Keep Modal](assets/screenshots/keep_modal_open_1785408700430.png)

### Item Detail Drawer & Editor
![Item Detail Drawer](assets/screenshots/detail_drawer_open_1785408889640.png)

---

## Features

- 📝 **Rich Text Notes**: Capture structured thoughts, code snippets, meeting minutes, and journal entries with zero friction.
- 🔗 **Web Link Bookmarks**: Store external URLs with auto-extracted domain favicons, title metadata, and quick-open actions.
- 🖼️ **Visual Images**: Upload screenshots and visual inspiration photos with built-in preview lightbox and download capabilities.
- 📄 **PDF Documents**: Store and view document references with formatted file size indicators and preview links.
- 💬 **Quotes & Excerpts**: Highlight key quote excerpts alongside author or source attributions.
- 🔍 **Instant Fuzzy Search**: Real-time trigram-powered search across titles, content body, and tags (`Cmd+K` / `Ctrl+K`).
- 🏷️ **Tagging Taxonomy**: Organize entries with custom user-defined tags and quick-filter chips.
- 🌙 **Adaptive Dark Mode**: Eye-friendly, automatic light and dark themes matching system preferences.
- 🔐 **Dual Persistence Engine**: Guest Mode local fallback (`localStorage`) + Full Cloud Sync (`Supabase Postgres & Storage`).
- 🔑 **Authentication Options**: Email/Password login and Google OAuth 2.0 integration.
- 📱 **Fully Responsive**: Mobile-first touch interactions and spacious desktop layouts.

---

## Tech Stack

### Frontend
- **Framework**: React 19 (Functional Components & Custom Hooks)
- **Styling**: Tailwind CSS v4, Custom CSS Variables
- **Icons**: Lucide Icons (`lucide-react`)
- **Animation**: Motion (`motion`)
- **Build System**: Vite 6, TypeScript 5

### Backend & Database
- **API Server**: Express 4 / Node.js
- **Database**: PostgreSQL 15+ (Supabase Postgres) with `pg_trgm` and `uuid-ossp` extensions
- **Authentication**: Supabase Auth (Email/Password & Google OAuth)
- **Object Storage**: Supabase Cloud Storage (`keepr-artifacts` bucket)

---

## Architecture

Keepr follows a clean, modular layer architecture:

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
2. **Repository Abstraction Pattern**: `RepositoryService` abstraction cleanly toggles between `SupabaseArtifactRepository` and offline `LocalStorageArtifactRepository`.
3. **Database Security Model**: PostgreSQL Row Level Security (RLS) policies enforce strict per-user data and storage isolation (`auth.uid() = user_id`).

---

## Setup & Installation

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm** or **pnpm** / **bun**
- **Supabase Account** (optional, for cloud sync & authentication)

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
Copy the example environment file and update your credentials:
```bash
cp .env.example .env
```

### 4. Database Setup (Supabase)
Execute the SQL schema in `supabase-schema.sql` inside your Supabase SQL Editor:
- Creates `profiles`, `artifacts`, `tags`, and `artifact_tags` tables.
- Enables `pg_trgm` fuzzy search index.
- Applies Row Level Security (RLS) policies and storage bucket configuration.

### 5. Start Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) in your browser.

### 6. Build for Production
```bash
npm run build
npm run start
```

---

## Environment Configuration (.env.example)

The `.env.example` file contains all necessary configuration variables:

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

## Git & Repository Hygiene (.gitignore)

The project includes a `.gitignore` file to ensure secrets, dependencies, and build artifacts are not committed to source control:

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

| Light Mode Settings | Dark Mode Settings |
| :---: | :---: |
| ![Settings Light](assets/screenshots/settings_page_light_1785408850653.png) | ![Settings Dark](assets/screenshots/settings_page_dark_1785408857499.png) |

---

## Roadmap

Planned enhancements for upcoming versions of Keepr:

- [ ] **AI Semantic Search**: Vector embeddings (`pgvector`) for conceptual document and note searching.
- [ ] **Smart Auto-Tagging**: AI-assisted automatic categorization for saved links and notes.
- [ ] **Browser Extension**: One-click web clipper for Chrome and Firefox.
- [ ] **Collections & Folders**: Nested directory structures for workspace organization.
- [ ] **Offline PWA**: Full ServiceWorker caching with automatic background cloud sync.

---

## Known Limitations

- **Browser Storage Limits**: Guest Mode relies on browser `localStorage` (typically capped at ~5MB). Users storing heavy assets should connect Supabase Cloud Storage.
- **File Upload Size**: Default Supabase Storage bucket policy limits single file uploads to 50MB.
- **iFrame Preview Sandbox**: When rendered inside restricted embedded iFrames, popup-based OAuth redirects require opening the application in a new browser window.
- **Fuzzy Search Language**: Trigram search is optimized for alphanumeric Latin scripts; full-text search for CJK scripts requires turning on PostgreSQL `pg_bigm` or full-text CJK indexing.

---

## License

This project is open-source and available under the [MIT License](LICENSE).

Copyright (c) 2026 Keepr.
