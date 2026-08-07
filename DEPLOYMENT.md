# Keepr Deployment Guide

This guide provides step-by-step instructions for deploying Keepr to production from scratch using **Supabase** (Database, Authentication, Storage) and **Vercel** (Hosting & CDN).

---

## Prerequisites

Before starting, ensure you have access to:
- A [Supabase](https://supabase.com/) account
- A [Google Cloud Console](https://console.cloud.google.com/) project (for Google OAuth)
- A [Vercel](https://vercel.com/) account
- A [GitHub](https://github.com/) repository containing the Keepr codebase

---

## Step-by-Step Deployment Flow

### A. Create Supabase Project
1. Log in to your [Supabase Dashboard](https://supabase.com/dashboard).
2. Click **New Project** and select your Organization.
3. Provide project details:
   - **Name**: `keepr-production`
   - **Database Password**: Generate and store a strong password securely.
   - **Region**: Choose a region closest to your primary target users.
4. Click **Create new project** and wait for database provisioning (~2 minutes).
5. Once created, navigate to **Project Settings** -> **API** to locate:
   - **Project URL** (`https://<project-ref>.supabase.co`)
   - **Anon / Public Key** (`eyJ...`)

---

### B. Run Database Schema
1. Open your Supabase Dashboard and go to the **SQL Editor**.
2. Click **New query**.
3. Copy the entire contents of `supabase-schema.sql` from the root of this repository.
4. Paste the SQL script into the editor and click **Run**.
5. Verify that all tables (`profiles`, `artifacts`, `tags`, `artifact_tags`), triggers, indexes, and Row Level Security (RLS) policies were created successfully.

---

### C. Create Storage Bucket
1. In Supabase Dashboard, navigate to **Storage**.
2. If the SQL script ran successfully, a bucket named `keepr-artifacts` should already exist under **Buckets**.
3. If not, click **New Bucket**:
   - **Name**: `keepr-artifacts`
   - **Public Bucket**: Toggle **OFF** (Keepr uses signed URLs for maximum privacy and security).
   - **Allowed MIME types**: `image/*`, `application/pdf`, `text/*`, `application/json`
   - **File Size Limit**: `50MB`
4. Verify RLS policies are active under **Storage Policies** for `keepr-artifacts`.

---

### D. Enable Google Authentication
1. Go to [Google Cloud Console](https://console.cloud.google.com/).
2. Create a new project or select an existing project.
3. Go to **APIs & Services** -> **OAuth consent screen**:
   - Set User Type to **External**.
   - Fill in App Name (`Keepr`), Support Email, and Developer Contact Information.
   - Save and continue.
4. Go to **APIs & Services** -> **Credentials**:
   - Click **Create Credentials** -> **OAuth client ID**.
   - Select Application Type: **Web application**.
   - Name: `Keepr OAuth Client`.
   - Under **Authorized JavaScript origins**, add:
     - `https://<your-project-ref>.supabase.co`
     - `https://your-app.vercel.app` (your production Vercel URL)
   - Under **Authorized redirect URIs**, add:
     - `https://<your-project-ref>.supabase.co/auth/v1/callback`
   - Click **Create** and save your **Client ID** and **Client Secret**.
5. Back in **Supabase Dashboard**, go to **Authentication** -> **Providers** -> **Google**:
   - Toggle **Enable Google provider**.
   - Paste your **Client ID** and **Client Secret**.
   - Click **Save**.

---

### E. Configure Redirect URLs
1. In Supabase Dashboard, navigate to **Authentication** -> **URL Configuration**.
2. Set **Site URL** to your production domain:
   - `https://your-app.vercel.app`
3. Under **Redirect URLs**, add the following allowed redirect patterns:
   - `https://your-app.vercel.app/*`
   - `https://your-app.vercel.app/#home`
   - `http://localhost:3000/*` (for local development testing)
4. Click **Save**.

---

### F. Configure Environment Variables
Prepare your production environment variables:

| Variable Name | Required | Description | Example Value |
|---|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Your Supabase Project API URL | `https://xyz.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Yes | Your Supabase Anon / Public API key | `eyJhbGci...` |
| `GEMINI_API_KEY` | Optional | API Key for Gemini features (server-side) | `AIzaSy...` |

---

### G. Connect GitHub Repository
1. Push your audited Keepr code to your GitHub repository:
   ```bash
   git add .
   git commit -m "Prepare Keepr for Vercel deployment"
   git push origin main
   ```

---

### H. Deploy to Vercel
1. Log in to [Vercel](https://vercel.com/) and click **Add New** -> **Project**.
2. Import your `keepr` GitHub repository.
3. In **Configure Project**:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
4. Expand **Environment Variables** and add:
   - `VITE_SUPABASE_URL` = `<your-supabase-url>`
   - `VITE_SUPABASE_ANON_KEY` = `<your-supabase-anon-key>`
5. Click **Deploy**.
6. Vercel will clone, install dependencies, build assets, and deploy to a global edge CDN.

---

### I. Verify Production Deployment
1. Open your Vercel production URL (e.g., `https://your-app.vercel.app`).
2. **Smoke Test Checklist**:
   - [ ] Page loads cleanly without console errors or missing assets.
   - [ ] Click **Sign In with Google** or **Continue as Guest**.
   - [ ] Confirm OAuth completes and redirects back to `#home`.
   - [ ] Create a Note, Link, and Quote. Confirm instant persistence.
   - [ ] Upload an Image or PDF file and verify signed preview loads properly.
   - [ ] Perform a global search in Search tab.
   - [ ] Toggle Dark/Light themes and view settings in Settings tab.
   - [ ] Sign out and log back in to verify session persistence.

---

### J. Common Troubleshooting Steps

#### 1. OAuth Redirect Mismatch Error (`redirect_uri_mismatch`)
- **Cause**: The OAuth redirect URI in Google Cloud Console doesn't match Supabase's callback URL.
- **Fix**: Verify Google Cloud Console has `https://<your-project-ref>.supabase.co/auth/v1/callback` added under Authorized Redirect URIs.

#### 2. Supabase Storage Upload Fails (403 Forbidden / Permission Denied)
- **Cause**: Missing bucket or incorrect RLS policies on `storage.objects`.
- **Fix**: Re-run the Storage section of `supabase-schema.sql` or confirm in Supabase Dashboard that the `keepr-artifacts` bucket exists and has RLS policies for `authenticated` users.

#### 3. Blank Screen on Vercel After Deployment
- **Cause**: Build output path misconfigured or routing fallback issue.
- **Fix**: Ensure Vercel Framework preset is set to **Vite** with Output Directory set to `dist`.

---
