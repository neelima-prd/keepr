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

  async update(id, updates) {
    const items = await this.getAll();
    const index = items.findIndex(item => item.id === id);
    if (index === -1) return null;
    items[index] = { ...items[index], ...updates, updatedAt: Date.now() };
    await this.saveAll(items);
    return items[index];
  }

  async delete(id) {
    let items = await this.getAll();
    items = items.filter(item => item.id !== id);
    await this.saveAll(items);
    return true;
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
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }
}

export class SupabaseArtifactRepository {
  constructor() {
    this.bucketName = 'keepr-artifacts';
  }

  async getAll() {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");

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
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error fetching artifacts from Supabase:", error);
      throw error;
    }

    return data.map(row => ({
      id: row.id,
      title: row.title,
      type: row.artifact_type,
      content: row.content || row.note || '',
      url: row.source_url || '',
      imageUrl: row.thumbnail_url || row.image_url || '',
      domain: row.domain || '',
      author: row.author || '',
      source: row.source || '',
      fileSize: row.file_size || '',
      createdAt: new Date(row.created_at).getTime(),
      updatedAt: new Date(row.updated_at).getTime(),
      tags: row.artifact_tags ? row.artifact_tags.map(at => at.tags?.name).filter(Boolean) : []
    }));
  }

  async getById(id) {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
    const items = await this.getAll();
    return items.find(item => item.id === id) || null;
  }

  async add(item) {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");

    const { data: artifactData, error: artifactError } = await supabase
      .from('artifacts')
      .insert({
        title: item.title,
        artifact_type: item.type,
        note: item.content,
        content: item.content,
        source_url: item.url,
        thumbnail_url: item.imageUrl,
        image_url: item.imageUrl,
        domain: item.domain,
        author: item.author,
        source: item.source,
        file_size: item.fileSize,
        created_at: new Date(item.createdAt || Date.now()).toISOString(),
        updated_at: new Date(item.updatedAt || Date.now()).toISOString()
      })
      .select()
      .single();

    if (artifactError) {
      console.error("Error inserting artifact to Supabase:", artifactError);
      throw artifactError;
    }

    if (item.tags && item.tags.length > 0) {
      for (const tagName of item.tags) {
        const { data: tagData } = await supabase
          .from('tags')
          .upsert({ name: tagName }, { onConflict: 'name' })
          .select()
          .single();

        if (tagData) {
          await supabase.from('artifact_tags').insert({
            artifact_id: artifactData.id,
            tag_id: tagData.id
          });
        }
      }
    }

    return { ...item, id: artifactData.id };
  }

  async update(id, updates) {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");

    const payload = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.content !== undefined) {
      payload.note = updates.content;
      payload.content = updates.content;
    }
    if (updates.url !== undefined) payload.source_url = updates.url;
    if (updates.imageUrl !== undefined) {
      payload.thumbnail_url = updates.imageUrl;
      payload.image_url = updates.imageUrl;
    }
    if (updates.domain !== undefined) payload.domain = updates.domain;
    payload.updated_at = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('artifacts')
      .update(payload)
      .eq('id', id);

    if (updateError) {
      console.error("Error updating artifact in Supabase:", updateError);
      throw updateError;
    }

    if (updates.tags !== undefined) {
      await supabase.from('artifact_tags').delete().eq('artifact_id', id);
      for (const tagName of updates.tags) {
        const { data: tagData } = await supabase
          .from('tags')
          .upsert({ name: tagName }, { onConflict: 'name' })
          .select()
          .single();

        if (tagData) {
          await supabase.from('artifact_tags').insert({
            artifact_id: id,
            tag_id: tagData.id
          });
        }
      }
    }

    return true;
  }

  async delete(id) {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
    const { error } = await supabase.from('artifacts').delete().eq('id', id);
    if (error) {
      console.error("Error deleting artifact from Supabase:", error);
      throw error;
    }
    return true;
  }

  async reset() {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
    await supabase.from('artifacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    for (const item of INITIAL_DATA) {
      await this.add(item);
    }
    return this.getAll();
  }

  async clear() {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
    await supabase.from('artifacts').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    return [];
  }

  async uploadFile(file) {
    if (!isSupabaseConfigured()) throw new Error("Supabase is not configured");
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { error } = await supabase.storage
      .from(this.bucketName)
      .upload(filePath, file);

    if (error) {
      console.error("Error uploading file to Supabase storage:", error);
      throw error;
    }

    const { data: publicUrlData } = supabase.storage
      .from(this.bucketName)
      .getPublicUrl(filePath);

    return publicUrlData.publicUrl;
  }
}

class RepositoryService {
  constructor() {
    this.localRepo = new LocalStorageArtifactRepository();
    this.supabaseRepo = new SupabaseArtifactRepository();
    // Default to LocalStorage repository for current sprint as instructed
    this.activeRepo = this.localRepo;
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

  async getAll() {
    return this.activeRepo.getAll();
  }

  async getById(id) {
    return this.activeRepo.getById(id);
  }

  async add(item) {
    return this.activeRepo.add(item);
  }

  async update(id, updates) {
    return this.activeRepo.update(id, updates);
  }

  async delete(id) {
    return this.activeRepo.delete(id);
  }

  async reset() {
    return this.activeRepo.reset();
  }

  async clear() {
    return this.activeRepo.clear();
  }

  async uploadFile(file) {
    return this.activeRepo.uploadFile(file);
  }
}

export const repository = new RepositoryService();
export default repository;
