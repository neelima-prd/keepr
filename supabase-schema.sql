-- ============================================================================
-- Keepr - Production Database Schema for Supabase
-- ============================================================================
-- Description: Complete, idempotent schema for Keepr artifact capture & search.
-- Author: Keepr Engineering
-- Target: Supabase / PostgreSQL 15+
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- Enables fast trigram pattern matching for search

-- ----------------------------------------------------------------------------
-- 1. Custom Types & Enums
-- ----------------------------------------------------------------------------
-- Enum defining the types of artifacts supported by Keepr.
-- Future types (e.g. 'audio', 'video') can be safely added via:
--   ALTER TYPE public.artifact_type ADD VALUE 'video';
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'artifact_type') THEN
    CREATE TYPE public.artifact_type AS ENUM (
      'note',
      'link',
      'image',
      'pdf',
      'file',
      'quote'
    );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2. Helper Functions & Triggers
-- ----------------------------------------------------------------------------
-- Reusable function to automatically update the `updated_at` timestamp column.
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger function to automatically create a public.profiles entry when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ----------------------------------------------------------------------------
-- 3. Core Tables
-- ----------------------------------------------------------------------------

-- Table: public.profiles
-- User profile information linked 1:1 with auth.users
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: public.artifacts
-- Primary table for all captured items (notes, bookmarks, images, PDFs, files, quotes).
CREATE TABLE IF NOT EXISTS public.artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  artifact_type public.artifact_type NOT NULL DEFAULT 'note',
  title TEXT,
  
  -- The `content` column stores raw editor output (e.g. Markdown, HTML, or plain text).
  -- The application layer handles rendering rich text or formatting.
  content TEXT,
  
  -- Flexible JSONB metadata store for artifact-specific attributes and AI capabilities.
  -- Keeps the core schema simple while supporting diverse data types:
  --   - mime_type (e.g. "application/pdf", "image/png")
  --   - file_size (in bytes)
  --   - width, height (for visual assets)
  --   - page_count (for documents and PDFs)
  --   - duration (for audio/video assets)
  --   - favicon (for external web links)
  --   - thumbnail_url (preview image URL or storage reference)
  --   - webpage_title, webpage_description (Open Graph metadata for links)
  --   - ocr_text (extracted text content from images or scanned PDFs)
  --   - ai_metadata (vector embeddings, smart summaries, auto-generated tags, entity extractions)
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  
  external_url TEXT, -- External web URL associated with the artifact (e.g. bookmarked page, source reference)
  storage_path TEXT, -- Reference path in the private `keepr-artifacts` Supabase storage bucket
  
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  deleted_at TIMESTAMPTZ NULL, -- Soft deletion support
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Table: public.tags
-- User-defined tags for organizing and categorizing artifacts.
CREATE TABLE IF NOT EXISTS public.tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Ensure tag names are unique per user (User A and User B can both have tag "Work")
  CONSTRAINT unique_user_tag_name UNIQUE (user_id, name)
);

-- Table: public.artifact_tags
-- Junction table linking artifacts and tags (many-to-many relationship).
CREATE TABLE IF NOT EXISTS public.artifact_tags (
  artifact_id UUID NOT NULL REFERENCES public.artifacts(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (artifact_id, tag_id)
);

-- ----------------------------------------------------------------------------
-- 4. Triggers
-- ----------------------------------------------------------------------------
-- Attach handle_new_user trigger to auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Attach updated_at trigger to public.profiles
DROP TRIGGER IF EXISTS trigger_profiles_updated_at ON public.profiles;
CREATE TRIGGER trigger_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Attach updated_at trigger to public.artifacts
DROP TRIGGER IF EXISTS trigger_artifacts_updated_at ON public.artifacts;
CREATE TRIGGER trigger_artifacts_updated_at
  BEFORE UPDATE ON public.artifacts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- ----------------------------------------------------------------------------
-- 5. Performance & Query Indexes
-- ----------------------------------------------------------------------------

-- Artifacts table indexes
-- Index user_id for fast retrieval of user workspace data
CREATE INDEX IF NOT EXISTS idx_artifacts_user_id ON public.artifacts(user_id);

-- Composite index for user dashboard queries filtering active (non-deleted, non-archived) items
CREATE INDEX IF NOT EXISTS idx_artifacts_user_status ON public.artifacts(user_id, is_archived, deleted_at, created_at DESC);

-- Index created_at & updated_at for timeline ordering
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON public.artifacts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artifacts_updated_at ON public.artifacts(updated_at DESC);

-- Index artifact_type for type-filtered queries (e.g., links view, images view)
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON public.artifacts(user_id, artifact_type);

-- Standard index on title for exact and prefix lookups
CREATE INDEX IF NOT EXISTS idx_artifacts_title ON public.artifacts(user_id, title);

-- Search Preparation Indexes:
-- Trigram GIN indexes on title and content prepare the database for fast ILIKE and fuzzy text search queries
CREATE INDEX IF NOT EXISTS idx_artifacts_title_trgm ON public.artifacts USING GIN (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_artifacts_content_trgm ON public.artifacts USING GIN (content gin_trgm_ops);

-- GIN index on JSONB metadata to enable fast attribute lookups (e.g. metadata->>'mime_type' or metadata->>'thumbnail_url')
CREATE INDEX IF NOT EXISTS idx_artifacts_metadata ON public.artifacts USING GIN (metadata);

-- Tags table indexes
CREATE INDEX IF NOT EXISTS idx_tags_user_id ON public.tags(user_id);

-- Artifact Tags junction indexes
CREATE INDEX IF NOT EXISTS idx_artifact_tags_tag_id ON public.artifact_tags(tag_id);
CREATE INDEX IF NOT EXISTS idx_artifact_tags_artifact_id ON public.artifact_tags(artifact_id);

-- ----------------------------------------------------------------------------
-- 6. Row Level Security (RLS) Policies
-- ----------------------------------------------------------------------------

-- Enable RLS on all public tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_tags ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- RLS Policies: public.profiles
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
CREATE POLICY "Users can read own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "Users can insert own profile" ON public.profiles;
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users can delete own profile" ON public.profiles;
CREATE POLICY "Users can delete own profile"
  ON public.profiles FOR DELETE
  USING (auth.uid() = id);

-- ----------------------------------------------------------------------------
-- RLS Policies: public.artifacts
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own artifacts" ON public.artifacts;
CREATE POLICY "Users can read own artifacts"
  ON public.artifacts FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own artifacts" ON public.artifacts;
CREATE POLICY "Users can insert own artifacts"
  ON public.artifacts FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own artifacts" ON public.artifacts;
CREATE POLICY "Users can update own artifacts"
  ON public.artifacts FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own artifacts" ON public.artifacts;
CREATE POLICY "Users can delete own artifacts"
  ON public.artifacts FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS Policies: public.tags
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own tags" ON public.tags;
CREATE POLICY "Users can read own tags"
  ON public.tags FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own tags" ON public.tags;
CREATE POLICY "Users can insert own tags"
  ON public.tags FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own tags" ON public.tags;
CREATE POLICY "Users can update own tags"
  ON public.tags FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own tags" ON public.tags;
CREATE POLICY "Users can delete own tags"
  ON public.tags FOR DELETE
  USING (auth.uid() = user_id);

-- ----------------------------------------------------------------------------
-- RLS Policies: public.artifact_tags
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read own artifact tags" ON public.artifact_tags;
CREATE POLICY "Users can read own artifact tags"
  ON public.artifact_tags FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.artifacts a
      WHERE a.id = artifact_id AND a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own artifact tags" ON public.artifact_tags;
CREATE POLICY "Users can insert own artifact tags"
  ON public.artifact_tags FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.artifacts a
      WHERE a.id = artifact_id AND a.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can delete own artifact tags" ON public.artifact_tags;
CREATE POLICY "Users can delete own artifact tags"
  ON public.artifact_tags FOR DELETE
  USING (
    EXISTS (
      SELECT 1 FROM public.artifacts a
      WHERE a.id = artifact_id AND a.user_id = auth.uid()
    )
  );

-- ----------------------------------------------------------------------------
-- 7. Supabase Storage Bucket Configuration
-- ----------------------------------------------------------------------------

-- Create 'keepr-artifacts' private storage bucket if it doesn't already exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'keepr-artifacts',
  'keepr-artifacts',
  FALSE, -- Private bucket
  52428800, -- 50 MB limit
  ARRAY['image/*', 'application/pdf', 'text/*', 'application/json', 'audio/*', 'video/*']
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS Policies
-- Users store objects under paths formatted as: {user_id}/{filename}

DROP POLICY IF EXISTS "Authenticated users can upload artifact files" ON storage.objects;
CREATE POLICY "Authenticated users can upload artifact files"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'keepr-artifacts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can read own artifact files" ON storage.objects;
CREATE POLICY "Authenticated users can read own artifact files"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'keepr-artifacts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can update own artifact files" ON storage.objects;
CREATE POLICY "Authenticated users can update own artifact files"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'keepr-artifacts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Authenticated users can delete own artifact files" ON storage.objects;
CREATE POLICY "Authenticated users can delete own artifact files"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'keepr-artifacts' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- ============================================================================
-- End of Schema Definition
-- ============================================================================
