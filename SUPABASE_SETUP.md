# Supabase Setup Guide for PaperSage

## Step 1: Create Supabase Project

1. Go to https://supabase.com and sign up (it's free!)
2. Click "New Project"
3. Fill in:
   - **Project Name**: papersage (or any name you like)
   - **Database Password**: Create a strong password (SAVE THIS!)
   - **Region**: Choose closest to you
4. Click "Create new project"
5. Wait ~2 minutes for initialization

## Step 2: Get Your API Credentials

1. In your Supabase dashboard, go to **Settings** → **API**
2. Find these two values:
   - **Project URL** (looks like: `https://xxxxxxxxxxxxx.supabase.co`)
   - **anon public key** (long string starting with `eyJ...`)
3. Copy both values

## Step 3: Add Credentials to .env.local

Open `/papersage/.env.local` and replace:

```
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url_here
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key_here
```

With your actual values:

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Step 4: Create Database Tables

1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click "New query"
3. Copy ALL the content from `supabase-schema.sql` file in your project root
4. Paste it into the SQL Editor
5. Click "Run" or press Cmd+Enter (Mac) / Ctrl+Enter (Windows)
6. You should see "Success. No rows returned"

## Step 5: Verify Tables Were Created

1. Go to **Table Editor** in Supabase dashboard (left sidebar)
2. You should see three tables:
   - **sessions** - Stores chat sessions
   - **messages** - Stores chat messages
   - **uploaded_files** - Stores file metadata

## Step 6: Test Connection

Restart your dev server:
```bash
# Stop current server (Ctrl+C)
npm run dev
```

The app should now connect to Supabase instead of localStorage!

## What This Fixes:

✅ No more localStorage quota errors
✅ Data persists across browsers and devices
✅ Better performance
✅ Proper data structure with relationships
✅ Automatic backups (Supabase handles this)
✅ Can access your chats from any device

## Database Schema:

- **sessions**: Chat session info (name, created date, user ID)
- **messages**: All chat messages with citations
- **uploaded_files**: PDF metadata (filename, chunks, pages)

All tables have Row Level Security (RLS) enabled, so users can only see their own data!

## Need Help?

- Supabase Docs: https://supabase.com/docs
- Supabase Discord: https://discord.supabase.com

---

Once you've completed these steps, let me know and I'll update the code to use Supabase instead of localStorage!
