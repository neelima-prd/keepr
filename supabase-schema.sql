-- =============================================================
-- Keepr Supabase Initial Schema & Storage Setup
-- =============================================================

-- 1. Artifacts Table
CREATE TABLE IF NOT EXISTS public.artifacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    artifact_type TEXT NOT NULL, -- 'link', 'note', 'quote', 'image', 'pdf'
    note TEXT,
    content TEXT,
    source_url TEXT,
    thumbnail_url TEXT,
    image_url TEXT,
    domain TEXT,
    source TEXT,
    author TEXT,
    file_size TEXT,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Performance indexes for filtering and sorting
CREATE INDEX IF NOT EXISTS idx_artifacts_type ON public.artifacts(artifact_type);
CREATE INDEX IF NOT EXISTS idx_artifacts_created_at ON public.artifacts(created_at DESC);

-- 2. Tags Table
CREATE TABLE IF NOT EXISTS public.tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Index for quick tag lookup
CREATE INDEX IF NOT EXISTS idx_tags_name ON public.tags(name);

-- 3. Artifact Tags Junction Table (Many-to-Many Relationship)
CREATE TABLE IF NOT EXISTS public.artifact_tags (
    artifact_id UUID REFERENCES public.artifacts(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES public.tags(id) ON DELETE CASCADE,
    PRIMARY KEY (artifact_id, tag_id)
);

-- Reverse lookup indexes for junction table
CREATE INDEX IF NOT EXISTS idx_artifact_tags_artifact ON public.artifact_tags(artifact_id);
CREATE INDEX IF NOT EXISTS idx_artifact_tags_tag ON public.artifact_tags(tag_id);

-- 4. Row Level Security (RLS) Policies
ALTER TABLE public.artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artifact_tags ENABLE ROW LEVEL SECURITY;

-- Workspace access policies (Public/Anon access enabled)
CREATE POLICY "Allow public read access to artifacts" ON public.artifacts FOR SELECT USING (true);
CREATE POLICY "Allow public insert to artifacts" ON public.artifacts FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to artifacts" ON public.artifacts FOR UPDATE USING (true);
CREATE POLICY "Allow public delete to artifacts" ON public.artifacts FOR DELETE USING (true);

CREATE POLICY "Allow public read access to tags" ON public.tags FOR SELECT USING (true);
CREATE POLICY "Allow public insert to tags" ON public.tags FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public update to tags" ON public.tags FOR UPDATE USING (true);
CREATE POLICY "Allow public delete to tags" ON public.tags FOR DELETE USING (true);

CREATE POLICY "Allow public read access to artifact_tags" ON public.artifact_tags FOR SELECT USING (true);
CREATE POLICY "Allow public insert to artifact_tags" ON public.artifact_tags FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public delete to artifact_tags" ON public.artifact_tags FOR DELETE USING (true);

-- 5. Supabase Storage Bucket Setup
-- Create 'keepr-artifacts' bucket for uploaded images, PDFs, and files
INSERT INTO storage.buckets (id, name, public)
VALUES ('keepr-artifacts', 'keepr-artifacts', true)
ON CONFLICT (id) DO NOTHING;

-- Storage Policies for 'keepr-artifacts' bucket
CREATE POLICY "Public Read Objects"
ON storage.objects FOR SELECT
USING (bucket_id = 'keepr-artifacts');

CREATE POLICY "Public Insert Objects"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'keepr-artifacts');

CREATE POLICY "Public Update Objects"
ON storage.objects FOR UPDATE
WITH CHECK (bucket_id = 'keepr-artifacts');

CREATE POLICY "Public Delete Objects"
ON storage.objects FOR DELETE
USING (bucket_id = 'keepr-artifacts');
