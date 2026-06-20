-- Socra Database Schema
-- Run this in the Supabase SQL Editor

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Profiles
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'doxa' CHECK (plan IN ('doxa', 'elenchus', 'nous')),
  theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark')),
  accent_color TEXT,
  dark_mode BOOLEAN DEFAULT false, -- deprecated, kept for back-compat
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Chats
CREATE TABLE public.chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Messages
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Workspace Documents
CREATE TABLE public.workspace_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Document',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Cognitive Metrics
CREATE TABLE public.cognitive_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  reasoning_quality NUMERIC(3,1) DEFAULT 0,
  logical_consistency NUMERIC(3,1) DEFAULT 0,
  completeness NUMERIC(3,1) DEFAULT 0,
  originality NUMERIC(3,1) DEFAULT 0,
  confidence_alignment NUMERIC(3,1) DEFAULT 0,
  session_count INTEGER DEFAULT 0,
  avg_struggle_level NUMERIC(3,1) DEFAULT 0,
  interventions_used JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, chat_id, date)
);

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);

ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own chats" ON public.chats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own chats" ON public.chats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own chats" ON public.chats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own chats" ON public.chats FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT USING (chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid()));
CREATE POLICY "Users can create own messages" ON public.messages FOR INSERT WITH CHECK (chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid()));

ALTER TABLE public.workspace_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own workspace docs" ON public.workspace_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own workspace docs" ON public.workspace_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workspace docs" ON public.workspace_documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workspace docs" ON public.workspace_documents FOR DELETE USING (auth.uid() = user_id);

ALTER TABLE public.cognitive_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own metrics" ON public.cognitive_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own metrics" ON public.cognitive_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own metrics" ON public.cognitive_metrics FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own metrics" ON public.cognitive_metrics FOR DELETE USING (auth.uid() = user_id);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_chats_user_id ON public.chats(user_id);
CREATE INDEX IF NOT EXISTS idx_chats_updated_at ON public.chats(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON public.messages(created_at);
CREATE INDEX IF NOT EXISTS idx_workspace_documents_chat_id ON public.workspace_documents(chat_id);
CREATE INDEX IF NOT EXISTS idx_cognitive_metrics_user_date ON public.cognitive_metrics(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_cognitive_metrics_chat_id ON public.cognitive_metrics(chat_id);

-- ============================================
-- MIGRATION (run these if your database already exists)
-- ============================================
-- Run these statements in the Supabase SQL Editor to add the new columns
-- to your existing profiles table.

-- 1. Add the theme column (system/light/dark, default 'system')
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'system' CHECK (theme IN ('system', 'light', 'dark'));

-- 2. Add the accent_color column (nullable — null means use the default)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS accent_color TEXT;

-- 3. (Optional) Migrate old dark_mode boolean values to the new theme column
--    Only run this if you have existing users with dark_mode = true
UPDATE public.profiles SET theme = 'dark' WHERE dark_mode = true AND theme = 'system';
