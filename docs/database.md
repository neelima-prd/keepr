# Keepr Database Documentation

Welcome to the Keepr database documentation! If you are joining the Keepr engineering team or maintaining the platform, this document provides a comprehensive product and architectural guide to our database design, underlying philosophy, security model, and schema implementation.

---

## Overview

### Purpose
The Keepr database is designed to store, organize, and retrieve personal knowledge, captured thoughts, uploaded documents, web bookmarks, quotes, and visual assets. Rather than forcing users into rigid silos (like separate bookmark managers, note-taking apps, or drive folders), Keepr provides a unified knowledge vault.

### The "Artifact" Paradigm
Most traditional applications build separate, rigid databases for distinct content types: a `notes` table, a `bookmarks` table, a `files` table, and a `quotes` table. This approach creates high operational complexity, duplicates logic across tables, and makes search, tagging, and cross-content features difficult to maintain.

Keepr solves this by centering the schema around a single unified entity: **The Artifact**.

### Philosophy
> **"One artifact can represent anything worth remembering."**

Whether a user captures a quick text note, saves a web article link, uploads a 30-page research PDF, snaps a photo of a whiteboard, or clips a inspiring quote—it is stored as an **Artifact**. Each artifact shares common core fields (owner, title, content, type, timestamps) while utilizing a flexible `metadata` JSONB container for domain-specific attributes.

---

## Entity Relationship Overview

The Keepr database consists of four core tables:

```
profiles (1)
   │
   ▼ (1:N)
artifacts (1) ───◄ artifact_tags (N:M) ►─── (1) tags
```

### Table Relationships
1. **`profiles` (1:1 with `auth.users`)**: Stores user-facing identity information (display name, avatar). Automatically populated via PostgreSQL triggers when a user registers in Supabase Auth.
2. **`artifacts` (1:N with `profiles`)**: Every artifact belongs to exactly one authenticated user (`user_id`). Deleting a user automatically cascades and deletes all associated artifacts.
3. **`tags` (1:N with `profiles`)**: Users define custom tags. Tag names are strictly unique *per user* (i.e. User A and User B can both have a tag named `"Work"` without collision).
4. **`artifact_tags` (N:M Junction)**: A flexible many-to-many junction table connecting `artifacts` and `tags`. Deleting an artifact or a tag cleanly cascades and removes the junction record without polluting the database.

---

## Table Documentation

---

### 1. `profiles` Table

#### Purpose
Extends Supabase's built-in `auth.users` system with application-level user profile metadata. It decouples core authentication logic from user UI preferences.

#### Columns

| Column | Type | Description & Purpose |
| :--- | :--- | :--- |
| `id` | `UUID` (PK, FK → `auth.users.id`) | Primary Key. Direct 1:1 reference to Supabase `auth.users.id`. Ensures strict identity mapping and enforces cascading deletion if an account is removed. |
| `display_name` | `TEXT` | Stores the user's preferred display name. Initialized automatically from OAuth metadata (Google full name) or derived from the email prefix. |
| `avatar_url` | `TEXT` | URL pointing to the user's profile picture or OAuth avatar icon. |
| `created_at` | `TIMESTAMPTZ` | Timestamp when the profile record was created (`NOW()`). |
| `updated_at` | `TIMESTAMPTZ` | Timestamp when the profile was last modified. Maintained automatically via PostgreSQL trigger (`update_updated_at_column()`). |

#### Relationships
- Foreign Key `id` references `auth.users(id)` with `ON DELETE CASCADE`.

#### Design Decisions
- **Trigger-Driven Provisioning**: A PostgreSQL trigger (`on_auth_user_created`) automatically inserts a row into `public.profiles` upon user sign-up in `auth.users`. This guarantees that profile initialization is atomic and never relies on client-side API execution.
- **`SECURITY DEFINER` Execution**: The trigger function runs with elevated security permissions so it can reliably populate public profile rows during the Auth sign-up callback.

#### Future Considerations
- Can naturally expand to store user preferences (e.g. `theme_preference`, `default_view`, `notification_settings`) or subscription tier details without altering core authentication flows.

---

### 2. `artifacts` Table

#### Purpose
The primary table in the application. Stores all user-captured memories, notes, bookmarks, uploaded media, documents, and quotes.

#### Columns

| Column | Type | Description & Purpose |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Unique identifier generated via `gen_random_uuid()`. |
| `user_id` | `UUID` (FK → `auth.users.id`) | Foreign Key identifying the owner. Ensures strict data isolation under Row Level Security. |
| `artifact_type` | `public.artifact_type` (ENUM) | Categorizes the artifact as `'note'`, `'link'`, `'image'`, `'pdf'`, `'file'`, or `'quote'`. Enables high-speed tab filtering in the UI. |
| `title` | `TEXT` | The heading, bookmark title, file name, or user-defined title for the artifact. |
| `content` | `TEXT` | Stores raw text or editor output (e.g. Markdown, rich text HTML, quote excerpt, or note body). The application layer is responsible for rendering formatted text. |
| `metadata` | `JSONB` | Flexible key-value container storing type-specific details, media attributes, OpenGraph data, and AI metadata (see Metadata section below). |
| `external_url` | `TEXT` | Stores external web URLs (for bookmarked articles, source references, or web clips). |
| `storage_path` | `TEXT` | Relative path reference in the `keepr-artifacts` private Supabase Storage bucket (formatted as `{user_id}/{filename}`). Null for text-only notes. |
| `is_archived` | `BOOLEAN` | Flags archived items (`DEFAULT FALSE`) to keep the primary dashboard clean while preserving searchability. |
| `deleted_at` | `TIMESTAMPTZ` | Nullable timestamp supporting non-destructive soft deletion. Null indicates an active artifact. |
| `created_at` | `TIMESTAMPTZ` | Creation timestamp (`NOW()`), used for timeline ordering. |
| `updated_at` | `TIMESTAMPTZ` | Timestamp updated automatically via `trigger_artifacts_updated_at` on every record update. |

#### Relationships
- Foreign Key `user_id` references `auth.users(id)` with `ON DELETE CASCADE`.

#### Design Decisions
- **`artifact_type` as PostgreSQL Enum**: Enforces schema validity at the database level while remaining extensible (`ALTER TYPE artifact_type ADD VALUE 'video'`).
- **Decoupled Rich Content**: `content` remains a standard `TEXT` column to support any editor representation (Markdown, ProseMirror JSON, or raw HTML) without binding the database schema to a specific frontend editor library.
- **No Direct Binary Storage**: Files are stored in object storage (Supabase Storage); only the file reference (`storage_path`) is persisted in PostgreSQL.

#### Future Considerations
- Soft deletion (`deleted_at`) prepares the system for a trash/recovery bin and scheduled retention cleanups.

---

### 3. `tags` Table

#### Purpose
Stores user-defined tag labels used to organize and cross-reference artifacts.

#### Columns

| Column | Type | Description & Purpose |
| :--- | :--- | :--- |
| `id` | `UUID` (PK) | Unique tag ID generated via `gen_random_uuid()`. |
| `user_id` | `UUID` (FK → `auth.users.id`) | Foreign Key linking the tag to its creator. |
| `name` | `TEXT` | The textual label for the tag (e.g., `"Research"`, `"Inspiration"`, `"Finance"`). |
| `created_at` | `TIMESTAMPTZ` | Timestamp when the tag was created. |

#### Relationships
- Foreign Key `user_id` references `auth.users(id)` with `ON DELETE CASCADE`.
- Unique constraint `unique_user_tag_name UNIQUE (user_id, name)` enforces that tag names are unique per user.

#### Design Decisions
- **Per-User Uniqueness**: Instead of a global tag pool or duplicate user tags, the `(user_id, name)` composite constraint guarantees clean, un-duplicated tag lists for each individual user while allowing different users to share common tag names.

#### Future Considerations
- Supports color coding or hierarchy (`parent_id`) in future UI iterations through metadata extension or simple column additions.

---

### 4. `artifact_tags` Table

#### Purpose
Junction table facilitating the many-to-many relationship between `artifacts` and `tags`.

#### Columns

| Column | Type | Description & Purpose |
| :--- | :--- | :--- |
| `artifact_id` | `UUID` (FK → `public.artifacts.id`) | Reference to the tagged artifact. Part of composite Primary Key. |
| `tag_id` | `UUID` (FK → `public.tags.id`) | Reference to the applied tag. Part of composite Primary Key. |
| `created_at` | `TIMESTAMPTZ` | Timestamp when the tag was attached to the artifact. |

#### Relationships
- Foreign Key `artifact_id` references `public.artifacts(id)` with `ON DELETE CASCADE`.
- Foreign Key `tag_id` references `public.tags(id)` with `ON DELETE CASCADE`.
- Composite Primary Key `(artifact_id, tag_id)` prevents accidental duplicate tag assignments on a single artifact.

#### Design Decisions
- **Cascading Integrity**: Deleting an artifact automatically unlinks its tags, and deleting a tag removes all references across artifacts without leaving orphaned records.

---

## Metadata JSONB

### Why `metadata` Exists
In a multi-type knowledge repository, different artifacts carry wildly different supplementary properties:
- A **PDF** needs `page_count` and `file_size`.
- An **Image** needs `width`, `height`, and `ocr_text`.
- A **Link** needs `favicon`, `webpage_title`, and `webpage_description`.
- An **AI Insight** needs `summary`, `auto_tags`, or `vector_embedding`.

Creating separate nullable columns for all these attributes would result in a sparse, messy table with hundreds of empty columns. Using PostgreSQL's binary JSON format (`JSONB`) provides:
1. **Zero Migration Overhead**: Adding a new property (e.g., audio `duration`) requires zero DDL migrations.
2. **High-Speed Queryability**: PostgreSQL allows indexing specific JSON keys via GIN indexes.
3. **Type Flexibility**: Enables lightweight, polymorphic data structures without sacrificing query performance.

### Standardized `metadata` Key Schema
While the JSONB object is unstructured by design, the application layer conforms to standard conventions:

```json
{
  "mime_type": "application/pdf",
  "file_size": 2405820,
  "width": 1920,
  "height": 1080,
  "page_count": 14,
  "duration": 182.5,
  "favicon": "https://example.com/favicon.ico",
  "thumbnail_url": "https://keepr.app/storage/v1/object/sign/keepr-artifacts/user/thumb.jpg",
  "webpage_title": "Understanding Distributed Systems",
  "webpage_description": "An introductory guide to distributed consistency...",
  "ocr_text": "Extracted text content from an uploaded image or scanned document...",
  "ai_metadata": {
    "summary": "Key takeaways from the article...",
    "suggested_tags": ["Architecture", "Database"],
    "sentiment": "informative"
  }
}
```

---

## Security

### Row Level Security (RLS)
Security in Keepr is enforced directly inside the database kernel via PostgreSQL Row Level Security (RLS). Every table (`profiles`, `artifacts`, `tags`, `artifact_tags`) has RLS enabled.

#### Ownership Principle
Users can **only** read, create, update, or delete records where `user_id = auth.uid()` (or `id = auth.uid()` for profiles).

```sql
-- Representative RLS Policy for artifacts
CREATE POLICY "Users can read own artifacts"
  ON public.artifacts FOR SELECT
  USING (auth.uid() = user_id);
```

#### Why This Matters
- **Database-Enforced Multi-Tenancy**: Even if an application bug or API vulnerability occurs on the server, the database engine will reject queries attempting to read or modify another user's data.
- **Junction Protection**: RLS on `artifact_tags` verifies that the referenced artifact belongs to `auth.uid()` using subquery checks.

---

## Storage

### Object Storage Architecture
Binary file uploads (images, PDFs, documents) are stored in a **private** Supabase Storage bucket named `keepr-artifacts`.

### Storage Isolation Policy
Files in `keepr-artifacts` are organized under user-specific subfolders:
```
keepr-artifacts/{user_id}/{filename}
```

Storage RLS policies validate that the authenticated user matches the top-level path segment:
```sql
(storage.foldername(name))[1] = auth.uid()::text
```

### Path-Only References
The database table `public.artifacts` stores only the relative object key in `storage_path` (e.g., `550e8400-e29b/document.pdf`). Signed temporary URLs are generated dynamically on demand by the application layer. This prevents stale URL links, exposes no public file endpoints, and keeps database rows lightweight.

---

## Indexes & Performance Optimization

To ensure instantaneous dashboard loading and fast filtering as account sizes scale into tens of thousands of items, targeted indexes are defined:

| Index Name | Target Column(s) | Index Type | Purpose |
| :--- | :--- | :--- | :--- |
| `idx_artifacts_user_id` | `user_id` | B-Tree | Fast lookup for all items belonging to a user. |
| `idx_artifacts_user_status` | `(user_id, is_archived, deleted_at, created_at DESC)` | Composite B-Tree | Optimizes the main dashboard feed query (active, non-deleted items ordered by date). |
| `idx_artifacts_type` | `(user_id, artifact_type)` | Composite B-Tree | Fast tab filtering (e.g. viewing only Links or Images). |
| `idx_artifacts_created_at` | `created_at DESC` | B-Tree | Global timeline sorting. |
| `idx_artifacts_metadata` | `metadata` | GIN | Enables high-speed JSON key queries (e.g. filtering by `metadata->>'mime_type'`). |
| `idx_tags_user_id` | `user_id` | B-Tree | Fast tag list rendering in sidebar. |

---

## Search Readiness

### Trigram Pattern Matching (`pg_trgm`)
Searching titles and note content is a core requirement for a knowledge repository. Keepr enables the `pg_trgm` PostgreSQL extension and creates GIN trigram indexes on `title` and `content`:

```sql
CREATE INDEX idx_artifacts_title_trgm ON public.artifacts USING GIN (title gin_trgm_ops);
CREATE INDEX idx_artifacts_content_trgm ON public.artifacts USING GIN (content gin_trgm_ops);
```

### Why Trigrams Over Full-Text Search (FTS)
1. **Sub-string & Partial Matching**: Trigram matching instantly matches substrings, typos, and partial words (e.g. searching `"postgres"` matches `"PostgreSQL"`).
2. **Zero Maintenance**: Traditional PostgreSQL Full Text Search (`tsvector` + `tsquery`) requires language stemmers, stop-word dictionaries, and sync triggers. Trigrams provide fast, fuzzy search without complex pipeline setup.
3. **Intentional Postponement**: Full-Text Search (`tsvector`) and Vector Embeddings (`pgvector`) are deliberately deferred until search volume and semantic capabilities demand them.

---

## Future Roadmap

The Keepr schema is designed to support advanced intelligent features without requiring breaking database structural changes:

1. **AI & Semantic Vector Search**: Embeddings generated for artifacts can be stored directly inside `metadata->'ai_metadata'->'embedding'` or seamlessly migrated to a `pgvector` column without altering primary relationships.
2. **Smart Tag Auto-Categorization**: AI-generated tags can be populated into `metadata->'ai_metadata'->'suggested_tags'` before user approval, or directly inserted into `artifact_tags`.
3. **Collections / Folders**: A future `collections` table can be attached via a simple junction table (`artifact_collections`) or nullable `collection_id` column, maintaining full backward compatibility.
4. **Related Memories**: Graph links or item similarity scores can be computed dynamically on `metadata` attributes or indexed vector distance.

---

## Database Principles

When extending or maintaining the Keepr database, adhere to these core principles:

1. **Keep It Simple**: Prefer clean, standard SQL patterns over obscure or overly complex custom functions.
2. **Optimize for Maintainability**: Clear, self-documenting column names and explicit inline comments take precedence over clever micro-optimizations.
3. **Avoid Premature Optimization**: Do not create speculative tables or hyper-complex partitioning schemes until real user usage patterns demand them.
4. **Secure by Default**: Every table must have RLS enabled with explicit ownership policies. Never expose unauthenticated public access.
5. **One Source of Truth**: The database schema is defined strictly in `supabase-schema.sql`. All environment migrations should keep this single file fully updated and idempotent.
6. **Build for Evolution, Not Prediction**: Use flexible extensions like `JSONB` for evolving domain data rather than trying to predict every future feature attribute upfront.
