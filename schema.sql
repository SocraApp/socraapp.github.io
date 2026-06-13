-- ============================================
-- Socra Database Schema
-- Run this in the Supabase SQL Editor
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- User Profiles
-- ============================================
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'doxa' CHECK (plan IN ('doxa', 'elenchus', 'nous')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- Chats
-- ============================================
CREATE TABLE public.chats (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT 'New Chat',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Messages
-- ============================================
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content TEXT NOT NULL,
  metrics JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Workspace Documents
-- ============================================
CREATE TABLE public.workspace_documents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  chat_id UUID REFERENCES public.chats(id) ON DELETE CASCADE NOT NULL UNIQUE,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL DEFAULT 'Untitled Document',
  content TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================
-- Cognitive Metrics (daily aggregates)
-- ============================================
CREATE TABLE public.cognitive_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
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
  UNIQUE(user_id, date)
);

-- ============================================
-- Row Level Security (RLS)
-- ============================================

-- Profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);

-- Chats
ALTER TABLE public.chats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own chats" ON public.chats FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own chats" ON public.chats FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own chats" ON public.chats FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own chats" ON public.chats FOR DELETE USING (auth.uid() = user_id);

-- Messages
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own messages" ON public.messages FOR SELECT USING (
  chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid())
);
CREATE POLICY "Users can create own messages" ON public.messages FOR INSERT WITH CHECK (
  chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete own messages" ON public.messages FOR DELETE USING (
  chat_id IN (SELECT id FROM public.chats WHERE user_id = auth.uid())
);

-- Workspace Documents
ALTER TABLE public.workspace_documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own workspace docs" ON public.workspace_documents FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own workspace docs" ON public.workspace_documents FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own workspace docs" ON public.workspace_documents FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own workspace docs" ON public.workspace_documents FOR DELETE USING (auth.uid() = user_id);

-- Cognitive Metrics
ALTER TABLE public.cognitive_metrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own metrics" ON public.cognitive_metrics FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can create own metrics" ON public.cognitive_metrics FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own metrics" ON public.cognitive_metrics FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- Indexes for performance
-- ============================================
CREATE INDEX idx_chats_user_id ON public.chats(user_id);
CREATE INDEX idx_chats_updated_at ON public.chats(updated_at DESC);
CREATE INDEX idx_messages_chat_id ON public.messages(chat_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at);
CREATE INDEX idx_workspace_documents_chat_id ON public.workspace_documents(chat_id);
CREATE INDEX idx_cognitive_metrics_user_date ON public.cognitive_metrics(user_id, date DESC);
