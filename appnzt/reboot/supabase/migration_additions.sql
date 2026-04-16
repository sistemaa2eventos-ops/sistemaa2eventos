-- Script complementar para adicionar coluna evento_id na tabela devices
-- Execute este SQL no SQL Editor do Supabase

-- Adicionar coluna evento_id na tabela devices se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'devices' AND column_name = 'evento_id'
  ) THEN
    ALTER TABLE devices ADD COLUMN evento_id uuid REFERENCES events(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Adicionar coluna password_hash na tabela users se não existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'password_hash'
  ) THEN
    ALTER TABLE users ADD COLUMN password_hash text;
  END IF;
END $$;

-- Adicionar coluna password_plain na tabela users (legado, remover depois)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'users' AND column_name = 'password_plain'
  ) THEN
    ALTER TABLE users ADD COLUMN password_plain text;
  END IF;
END $$;

-- Adicionar coluna active na tabela devices
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'devices' AND column_name = 'active'
  ) THEN
    ALTER TABLE devices ADD COLUMN active boolean DEFAULT true;
  END IF;
END $$;

-- Atualizar دستور checkin para adicionar método
-- A tabela checkins já tem a coluna method

-- Adicionar índice para busca por token de convite
CREATE INDEX IF NOT EXISTS idx_user_invites_token ON user_invites(invite_token);
CREATE INDEX IF NOT EXISTS idx_user_invites_email ON user_invites(email);

-- Criar tabela de consentimento LGPD se não existir
CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid REFERENCES pessoas(id) ON DELETE CASCADE,
  evento_id uuid REFERENCES events(id) ON DELETE CASCADE,
  consent_type text NOT NULL,
  consent_data jsonb DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_consent_pessoa ON consent_records(pessoa_id);