# Keepr

> Capture anything. Find everything.

Keepr is a modern, privacy-first personal knowledge repository and digital memory vault designed to seamlessly capture, structure, and retrieve notes, web links, visual research, documents, and quotes.

---

## Overview

In today's fast-paced digital world, valuable insights, bookmarks, meeting notes, code snippets, and research paper summaries are fragmented across browser tabs, messaging apps, and ephemeral scratchpads.

**Keepr solves digital sprawl** by providing a clean, unified workspace where information can be captured effortlessly and retrieved instantly. Whether you are storing a quick text thought, a curated web link, an annotated PDF, or a visual reference screenshot, Keepr organizes your data securely with tag-based taxonomies and high-speed trigram search.

---

## Features

- **Rich Text Notes**: Capture thoughts, code snippets, recipes, and structured ideas with zero friction.
- **Web Links**: Bookmark external links with auto-extracted domains and metadata.
- **Visual Images**: Drag & drop visual assets, screenshots, and inspiration photos.
- **PDF Documents**: Upload and view document references with formatted file sizing.
- **Quotes**: Highlight key excerpt quotes alongside author attributions.
- **Authentication**: Guest mode fallback for local usage + Google OAuth & Passwordless login via Supabase.
- **Instant Search**: Real-time fuzzy trigram pattern searching across titles, content, and tags.
- **Dark Mode**: Eye-friendly, adaptive dark & light theme modes matching system preferences.
- **Responsive Layout**: Designed desktop-first with touch-friendly mobile layouts.
- **Supabase Cloud Storage**: Secure, private cloud asset storage with signed temporal URLs.
- **Tagging Taxonomy**: Categorize entries using custom user tags for precise filtering.
- **Keyboard Shortcuts**: Quick modal triggers and search shortcuts (`Cmd+K` / `Ctrl+K`).

---

## Screenshots

<!-- Screenshot Placeholders -->
![Keepr Dashboard Placeholder](assets/linear_project_overview.png)
*Keepr Workspace Dashboard*

---

## Tech Stack

- **Frontend**: React 19, JavaScript (ESM), HTML5, Tailwind CSS v4, Lucide Icons, Motion
- **Build Tooling**: Vite 6, TypeScript 5, PostCSS, Autoprefixer
- **Backend & API**: Express 4 / Vite SSR Proxy, Node.js
- **Database**: PostgreSQL 15+ (via Supabase) with `pg_trgm` and `uuid-ossp` extensions
- **Authentication**: Supabase Auth (Google OAuth 2.0 & Email/Password)
- **Storage**: Supabase Storage (`keepr-artifacts` private bucket)
- **Hosting**: Vercel / Cloud Run (Docker)

---

## Architecture

Keepr employs a resilient hybrid architecture:
1. **Client Layer**: Single-page application built with React and native browser history hashing for tab state management (`#home`, `#search`, `#settings`).
2. **Repository Layer Pattern**: `RepositoryService` abstract interface that dynamically selects between `SupabaseArtifactRepository` (cloud database & storage) and `LocalStorageArtifactRepository` (offline fallback).
3. **Security Model**: Row Level Security (RLS) guarantees complete data isolation between authenticated users across both database queries and storage object downloads.

---

## Database

The PostgreSQL database schema is defined in `supabase-schema.sql`:

- `public.profiles`: User profile metadata linked 1:1 with `auth.users`.
- `public.artifacts`: Primary store for captured items (`note`, `link`, `image`, `pdf`, `file`, `quote`) with `JSONB` metadata for external attributes.
- `public.tags`: User-defined tag entities with unique `(user_id, name)` constraints.
- `public.artifact_tags`: Many-to-many junction table mapping tags to artifacts.
- `storage.objects`: Private `keepr-artifacts` bucket configured with user-folder RLS isolation (`auth.uid()`).

---

## Local Development

### Installation

```bash
# Clone repository
git clone https://github.com/your-username/keepr.git
cd keepr

# Install dependencies
npm install
```

### Environment Variables

Copy `.env.example` to `.env` and populate your Supabase credentials:

```bash
cp .env.example .env
```

```env
VITE_SUPABASE_URL="https://your-supabase-project.supabase.co"
VITE_SUPABASE_ANON_KEY="your-supabase-anon-key"
```

### Running Locally

```bash
# Start development server on port 3000
npm run dev
```

Open `http://localhost:3000` in your browser.

---

## Deployment

For complete, step-by-step production deployment instructions, refer to **[DEPLOYMENT.md](DEPLOYMENT.md)**.

---

## Roadmap

Future planned features under consideration for upcoming releases:

- **AI Search**: Intelligent query synthesis and dynamic filter generation.
- **Semantic Search**: Vector embeddings (`pgvector`) for conceptual document matching.
- **Collections**: Custom folder hierarchies and shared team workspaces.
- **Browser Extension**: One-click web page clipping and selection highlighting.
- **Smart Tags**: Auto-categorization using natural language processing.
- **Offline Support**: ServiceWorker background caching and automatic synchronization.

*Note: These roadmap items represent future concepts and are not currently implemented in the current production release.*

---

## License

This project is licensed under the [MIT License](LICENSE).
