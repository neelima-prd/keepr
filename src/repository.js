import { supabase, isSupabaseConfigured } from './supabase.js';

export const INITIAL_DATA = [
  {
    id: "item-1",
    title: "The Anatomy of a Great Product Spec",
    type: "link",
    content: "A short essay on writing product specs that engineers actually want to read. Start with the context, align on the goal, outline the key metrics, and keep it extremely clear.",
    url: "https://leerob.io/blog/product-spec",
    domain: "leerob.io",
    tags: ["Product", "Reading"],
    createdAt: Date.now() - 2 * 60 * 60 * 1000, // 2 hours ago
    source: "web link"
  },
  {
    id: "item-2",
    title: "@rauchg on shipping",
    type: "quote",
    content: "The best way to make a product feel fast is to make it feel intentional. Every animation, every pause, every empty state is an opportunity to communicate the system's stability and care.",
    url: "https://x.com/rauchg/status/123",
    domain: "x.com",
    tags: ["Design", "Inspiration"],
    createdAt: Date.now() - 5 * 60 * 60 * 1000, // 5 hours ago
    author: "Guillermo Rauch",
    source: "x.com"
  },
  {
    id: "item-3",
    title: "Linear's new project overview",
    type: "image",
    content: "Screenshot from the Linear Feb release notes. Note the density of information with almost no visual noise. Beautiful grid lines and subtle border gradients.",
    url: "",
    imageUrl: "assets/linear_project_overview.png",
    tags: ["Design", "Inspiration"],
    createdAt: Date.now() - 24 * 60 * 60 * 1000, // Yesterday
    source: "upload"
  },
  {
    id: "item-4",
    title: "Attention Is All You Need — annotated",
    type: "pdf",
    content: "Vaswani et al., 2017. My margin notes from re-reading before the transformer refresher session. Covers self-attention mechanisms, multi-head scaling, and positional encodings.",
    url: "",
    tags: ["AI", "Research"],
    createdAt: Date.now() - 3 * 24 * 60 * 60 * 1000, // 3 days ago
    source: "upload",
    fileSize: "1.2 MB"
  },
  {
    id: "item-5",
    title: "Onboarding — what's actually broken",
    type: "note",
    content: "1. First screen has 4 things to click. Confuses the user immediately.\n2. Empty state assumes you've already used the product instead of offering help.\n3. The setup progress bar does not give any indication of estimated time.\n4. No quick-exit option on the introductory slides.",
    url: "",
    tags: ["Product", "Research"],
    createdAt: Date.now() - 4 * 24 * 60 * 60 * 1000, // 4 days ago
    source: "manual"
  },
  {
    id: "item-6",
    title: "How Arc thinks about the browser as an OS",
    type: "link",
    content: "A long piece on treating tabs like conversations and the browser as an ambient environment. How the desktop experience can be decluttered by making elements contextual.",
    url: "https://browsercompany.com/blog/browser-as-an-os",
    domain: "browsercompany.com",
    tags: ["Product", "Inspiration"],
    createdAt: Date.now() - 5 * 24 * 60 * 60 * 1000, // 5 days ago
    source: "web link"
  },
  {
    id: "item-7",
    title: "Kyoto — machiya window frame",
    type: "image",
    content: "Reference photo from the Gion trip. The proportions of the wooden lattice (koshi) — good hero-image inspiration for layout patterns on our marketing page.",
    url: "",
    imageUrl: "assets/kyoto_machiya_window.png",
    tags: ["Travel", "Inspiration"],
    createdAt: Date.now() - 6 * 24 * 60 * 60 * 1000, // 6 days ago
    source: "upload"
  },
  {
    id: "item-8",
    title: "Stripe API Documentation",
    type: "link",
    content: "The reference for Stripe's REST API. Explains the API resources and how to interact with different endpoints, handle errors, and handle webhooks.",
    url: "https://stripe.com/docs/api",
    domain: "stripe.com",
    tags: ["Engineering", "Research"],
    createdAt: Date.now() - 6 * 24 * 60 * 60 * 1000, // 6 days ago
    source: "web link"
  },
  {
    id: "item-9",
    title: "Miso-glazed aubergine — Ottolenghi",
    type: "note",
    content: "White miso 2 tbsp, mirin 2 tbsp, sake 1 tbsp, sugar 1 tsp. Broil skin-side down 8 min, then glaze, 4 min. Serve with toasted sesame seeds and fresh scallions.",
    url: "",
    tags: ["Recipes", "Personal"],
    createdAt: Date.now() - 7 * 24 * 60 * 60 * 1000, // 7 days ago
    source: "manual"
  },
  {
    id: "item-10",
    title: "First-principles thinking for engineers",
    type: "link",
    content: "Patrick Collison's Y Combinator talk transcript. Reduce every decision to the smallest parts possible and build solutions up from core truths rather than analogies.",
    url: "https://stripe.com/blog/first-principles",
    domain: "stripe.com",
    tags: ["Engineering", "Career"],
    createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000, // 8 days ago
    source: "web link"
  }
];

export class LocalStorageArtifactRepository {
  constructor(storageKey = 'keepr_db') {
    this.storageKey = storageKey;
  }

  async getAll() {
    const raw = localStorage.getItem(this.storageKey);
    if (!raw) {
      const items = [...INITIAL_DATA];
      await this.saveAll(items);
      return items;
    }
    try {
      return JSON.parse(raw);
    } catch (e) {
      return [...INITIAL_DATA];
    }
  }

  async getArtifacts() {
    return this.getAll();
  }

  async getById(id) {
    const items = await this.getAll();
    return items.find(item => item.id === id) || null;
  }

  async saveAll(items) {
    localStorage.setItem(this.storageKey, JSON.stringify(items));
    return items;
  }

  async add(item) {
    const items = await this.getAll();
    items.unshift(item);
    await this.saveAll(items);
    return item;
  }

  async createArtifact(item) {
    return this.add(item);
  }

  async update(id, updates) {
    const items = await this.getAll();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updates, updatedAt: Date.now() };
    await this.saveAll(items);
    return items[index];
  }

  async updateArtifact(id, updates) {
    return this.update(id, updates);
  }

  async delete(id) {
    let items = await this.getAll();
    items = items.filter(item => item.id !== id);
    await this.saveAll(items);
    return true;
  }

  async deleteArtifact(id) {
    return this.delete(id);
  }

  async reset() {
    localStorage.removeItem(this.storageKey);
    return this.getAll();
  }

  async clear() {
    localStorage.setItem(this.storageKey, JSON.stringify([]));
    return [];
  }

  async uploadFile(file) {
    const formatFileSize = (bytes) => {
      if (!bytes || isNaN(bytes)) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        storagePath: '',
        fileUrl: reader.result,
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        mimeType: file.type
      });
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

export class SupabaseArtifactRepository {
  constructor() {
    this.bucketName = 'keepr-artifacts';
  }

  async getCurrentUserId() {
    if (!isSupabaseConfigured()) return null;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      return user ? user.id : null;
    } catch (e) {
      console.warn("Failed to get current user ID from Supabase Auth:", e);
      return null;
    }
  }

  /**
   * Helper to map database row into frontend artifact model.
   */
  async mapRowToArtifact(row) {
    const metadata = row.metadata || {};
    let imageUrl = metadata.image_url || metadata.thumbnail_url || '';
    let externalUrl = row.external_url || metadata.source_url || '';

    // If storage_path is present, generate a fresh signed URL for file previews/downloads
    if (row.storage_path) {
      try {
        const { data: signedData } = await supabase.storage
          .from(this.bucketName)
          .createSignedUrl(row.storage_path, 60 * 60 * 24); // 24-hour expiration
        
        if (signedData && signedData.signedUrl) {
          imageUrl = signedData.signedUrl;
          if (!externalUrl || row.artifact_type === 'pdf' || row.artifact_type === 'file') {
            externalUrl = signedData.signedUrl;
          }
        } else {
          const { data: publicUrlData } = supabase.storage
            .from(this.bucketName)
            .getPublicUrl(row.storage_path);
          if (publicUrlData && publicUrlData.publicUrl) {
            imageUrl = publicUrlData.publicUrl;
            if (!externalUrl || row.artifact_type === 'pdf' || row.artifact_type === 'file') {
              externalUrl = publicUrlData.publicUrl;
            }
          }
        }
      } catch (err) {
        console.warn("Could not generate signed URL for storage path:", row.storage_path, err);
      }
    }

    return {
      id: row.id,
      title: row.title || '',
      type: row.artifact_type || 'note',
      content: row.content || '',
      url: externalUrl,
      domain: metadata.domain || '',
      author: metadata.author || '',
      imageUrl: imageUrl,
      storagePath: row.storage_path || '',
      source: metadata.source || 'upload',
      fileSize: metadata.file_size || '',
      mimeType: metadata.mime_type || '',
      fileName: metadata.file_name || '',
      createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
      updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
      tags: row.artifact_tags ? row.artifact_tags.map(at => at.tags?.name).filter(Boolean) : []
    };
  }

  async getAll() {
    return this.getArtifacts();
  }

  async getArtifacts() {
    if (!isSupabaseConfigured()) {
      console.warn("Supabase is not configured.");
      return [];
    }

    const userId = await this.getCurrentUserId();
    if (!userId) {
      return [];
    }

    try {
      const { data, error } = await supabase
        .from('artifacts')
        .select(`
          *,
          artifact_tags (
            tags (
              name
            )
          )
        `)
        .eq('user_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Error fetching artifacts from Supabase:", error);
        return [];
      }

      if (!data) return [];
      return await Promise.all(data.map(row => this.mapRowToArtifact(row)));
    } catch (err) {
      console.error("Unexpected error fetching artifacts from Supabase:", err);
      return [];
    }
  }

  async getById(id) {
    if (!isSupabaseConfigured()) return null;

    const userId = await this.getCurrentUserId();
    if (!userId) return null;

    try {
      const { data, error } = await supabase
        .from('artifacts')
        .select(`
          *,
          artifact_tags (
            tags (
              name
            )
          )
        `)
        .eq('id', id)
        .eq('user_id', userId)
        .maybeSingle();

      if (error || !data) return null;
      return await this.mapRowToArtifact(data);
    } catch (err) {
      console.error("Error fetching artifact by ID from Supabase:", err);
      return null;
    }
  }

  async add(item) {
    return this.createArtifact(item);
  }

  async createArtifact(item) {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");

    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error("User must be signed in to create an artifact");
    }

    const metadata = {
      domain: item.domain || '',
      author: item.author || '',
      source: item.source || 'upload',
      file_size: item.fileSize || '',
      mime_type: item.mimeType || '',
      file_name: item.fileName || '',
      image_url: item.imageUrl || '',
      thumbnail_url: item.imageUrl || ''
    };

    const validTypes = ['note', 'link', 'image', 'pdf', 'file', 'quote'];
    const artifactType = validTypes.includes(item.type) ? item.type : 'note';

    const payload = {
      user_id: userId,
      artifact_type: artifactType,
      title: item.title || '',
      content: item.content || '',
      external_url: item.url || '',
      storage_path: item.storagePath || '',
      metadata: metadata,
      created_at: item.createdAt ? new Date(item.createdAt).toISOString() : new Date().toISOString(),
      updated_at: item.updatedAt ? new Date(item.updatedAt).toISOString() : new Date().toISOString()
    };

    const { data: artifactData, error: artifactError } = await supabase
      .from('artifacts')
      .insert(payload)
      .select()
      .single();

    if (artifactError) {
      console.error("Error inserting artifact to Supabase:", artifactError);
      throw new Error(`Failed to save artifact: ${artifactError.message}`);
    }

    if (item.tags && Array.isArray(item.tags) && item.tags.length > 0) {
      await this.syncArtifactTags(artifactData.id, userId, item.tags);
    }

    return this.getById(artifactData.id);
  }

  async update(id, updates) {
    return this.updateArtifact(id, updates);
  }

  async updateArtifact(id, updates) {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");

    const userId = await this.getCurrentUserId();
    if (!userId) {
      throw new Error("User must be signed in to update an artifact");
    }

    // Fetch existing row to preserve/merge metadata
    const { data: existing } = await supabase
      .from('artifacts')
      .select('metadata')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle();

    const currentMetadata = (existing && existing.metadata) ? existing.metadata : {};
    const updatedMetadata = { ...currentMetadata };

    const payload = {
      updated_at: new Date().toISOString()
    };

    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.content !== undefined) payload.content = updates.content;
    if (updates.type !== undefined) payload.artifact_type = updates.type;
    if (updates.url !== undefined) payload.external_url = updates.url;
    if (updates.storagePath !== undefined) payload.storage_path = updates.storagePath;

    if (updates.domain !== undefined) updatedMetadata.domain = updates.domain;
    if (updates.author !== undefined) updatedMetadata.author = updates.author;
    if (updates.source !== undefined) updatedMetadata.source = updates.source;
    if (updates.fileSize !== undefined) updatedMetadata.file_size = updates.fileSize;
    if (updates.imageUrl !== undefined) {
      updatedMetadata.image_url = updates.imageUrl;
      updatedMetadata.thumbnail_url = updates.imageUrl;
    }

    payload.metadata = updatedMetadata;

    const { error: updateError } = await supabase
      .from('artifacts')
      .update(payload)
      .eq('id', id)
      .eq('user_id', userId);

    if (updateError) {
      console.error("Error updating artifact in Supabase:", updateError);
      throw new Error(`Failed to update artifact: ${updateError.message}`);
    }

    if (updates.tags !== undefined && Array.isArray(updates.tags)) {
      await this.syncArtifactTags(id, userId, updates.tags);
    }

    return this.getById(id);
  }

  async delete(id) {
    return this.deleteArtifact(id);
  }

  async deleteArtifact(id) {
    if (!isSupabaseConfigured()) {
      return this.localRepo.delete(id);
    }

    const userId = await this.getCurrentUserId();
    if (!userId) {
      return this.localRepo.delete(id);
    }

    // Check if ID is a valid UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    if (!isUuid) {
      return this.localRepo.delete(id);
    }

    try {
      // Soft delete by updating deleted_at timestamp instead of hard deleting
      const { error } = await supabase
        .from('artifacts')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
        .eq('user_id', userId);

      if (error) {
        console.error("Error soft deleting artifact from Supabase:", error);
        return this.localRepo.delete(id);
      }

      await this.localRepo.delete(id);
      return true;
    } catch (err) {
      console.warn("Delete artifact exception, falling back to local repo:", err);
      return this.localRepo.delete(id);
    }
  }

  async syncArtifactTags(artifactId, userId, tagNames) {
    try {
      await supabase.from('artifact_tags').delete().eq('artifact_id', artifactId);

      for (const tagName of tagNames) {
        if (!tagName || !tagName.trim()) continue;
        const cleanTagName = tagName.trim();

        let tagId = null;

        const { data: tagData } = await supabase
          .from('tags')
          .upsert(
            { user_id: userId, name: cleanTagName },
            { onConflict: 'user_id,name' }
          )
          .select('id')
          .maybeSingle();

        if (tagData && tagData.id) {
          tagId = tagData.id;
        } else {
          const { data: existingTag } = await supabase
            .from('tags')
            .select('id')
            .eq('user_id', userId)
            .eq('name', cleanTagName)
            .maybeSingle();

          if (existingTag) {
            tagId = existingTag.id;
          }
        }

        if (tagId) {
          await supabase.from('artifact_tags').insert({
            artifact_id: artifactId,
            tag_id: tagId
          });
        }
      }
    } catch (err) {
      console.warn("Error syncing tags for artifact:", err);
    }
  }

  async reset() {
    if (!isSupabaseConfigured()) return [];
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    await supabase.from('artifacts').delete().eq('user_id', userId);

    for (const item of INITIAL_DATA) {
      await this.createArtifact(item);
    }

    return this.getArtifacts();
  }

  async clear() {
    if (!isSupabaseConfigured()) return [];
    const userId = await this.getCurrentUserId();
    if (!userId) return [];

    await supabase.from('artifacts').delete().eq('user_id', userId);
    return [];
  }

  async uploadFile(file) {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");

    const userId = await this.getCurrentUserId();
    if (!userId) throw new Error("User must be signed in to upload files");

    const fileExt = file.name.split('.').pop() || 'bin';
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `${userId}/${fileName}`;

    const formatFileSize = (bytes) => {
      if (!bytes || isNaN(bytes)) return '';
      if (bytes < 1024) return `${bytes} B`;
      if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
      return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    try {
      const { error: uploadError } = await supabase.storage
        .from(this.bucketName)
        .upload(filePath, file, { upsert: true, contentType: file.type });

      if (uploadError) {
        console.error("Error uploading file to Supabase storage:", uploadError);
        throw uploadError;
      }

      let fileUrl = '';
      try {
        const { data: signedData } = await supabase.storage
          .from(this.bucketName)
          .createSignedUrl(filePath, 60 * 60 * 24);
        if (signedData && signedData.signedUrl) {
          fileUrl = signedData.signedUrl;
        }
      } catch (err) {
        console.warn("Could not create signed URL:", err);
      }

      if (!fileUrl) {
        const { data: publicUrlData } = supabase.storage
          .from(this.bucketName)
          .getPublicUrl(filePath);
        fileUrl = publicUrlData ? publicUrlData.publicUrl : filePath;
      }

      return {
        storagePath: filePath,
        fileUrl: fileUrl,
        fileName: file.name,
        fileSize: formatFileSize(file.size),
        mimeType: file.type
      };
    } catch (err) {
      console.error("Failed to upload file to storage:", err);
      throw err;
    }
  }
}

export class RepositoryService {
  constructor() {
    this.localRepo = new LocalStorageArtifactRepository();
    this.supabaseRepo = new SupabaseArtifactRepository();
    
    if (isSupabaseConfigured()) {
      this.activeRepo = this.supabaseRepo;
    } else {
      this.activeRepo = this.localRepo;
    }
  }

  setEngine(engine) {
    if (engine === 'supabase' && isSupabaseConfigured()) {
      this.activeRepo = this.supabaseRepo;
    } else {
      this.activeRepo = this.localRepo;
    }
  }

  getEngine() {
    return this.activeRepo === this.supabaseRepo ? 'supabase' : 'local';
  }

  async getAll() { return this.activeRepo.getAll(); }
  async getArtifacts() { return this.activeRepo.getArtifacts ? this.activeRepo.getArtifacts() : this.activeRepo.getAll(); }
  async getById(id) { return this.activeRepo.getById(id); }
  async add(item) { return this.activeRepo.add(item); }
  async createArtifact(item) { return this.activeRepo.createArtifact ? this.activeRepo.createArtifact(item) : this.activeRepo.add(item); }
  async update(id, updates) { return this.activeRepo.update(id, updates); }
  async updateArtifact(id, updates) { return this.activeRepo.updateArtifact ? this.activeRepo.updateArtifact(id, updates) : this.activeRepo.update(id, updates); }
  async delete(id) {
    try {
      return await this.activeRepo.delete(id);
    } catch (err) {
      console.warn("Primary repo delete failed, falling back to local storage:", err);
      return await this.localRepo.delete(id);
    }
  }
  async deleteArtifact(id) { return this.delete(id); }
  async reset() { return this.activeRepo.reset(); }
  async clear() { return this.activeRepo.clear(); }
  async uploadFile(file) { return this.activeRepo.uploadFile(file); }
}

export const repository = new RepositoryService();
export default repository;
