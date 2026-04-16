-- Supabase schema inicial para A2 Eventos (NZT)
-- Execute este script no SQL Editor do seu projeto Supabase.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =====================================
-- SCHEMA: A2 Eventos (improved)
-- Idempotente: use IF NOT EXISTS para evitar erros em re-execucoes
-- =====================================

-- EVENTS (tenants)
CREATE TABLE IF NOT EXISTS events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  location text,
  config jsonb DEFAULT '{}'::jsonb, -- armazenamento livre para: dias, reset_hour, check_types, areas, bracelet_types
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- EVENT DATES (montagem / evento / desmontagem) - explícitos por dia
CREATE TABLE IF NOT EXISTS event_dates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  date date NOT NULL,
  phase text CHECK (phase IN ('montagem','evento','desmontagem')) NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- AREAS DO EVENTO (ex: Pista, Backstage, Entrada Principal)
CREATE TABLE IF NOT EXISTS event_areas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  config jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- TIPOS DE PULSEIRA POR EVENTO
CREATE TABLE IF NOT EXISTS event_bracelet_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name text NOT NULL,
  color text,
  attributes jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- EMPRESAS
CREATE TABLE IF NOT EXISTS empresas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cnpj text,
  tipo_servico text,
  responsavel_legal text,
  email text,
  datas_acesso jsonb DEFAULT '[]'::jsonb, -- datas e quotas por dia
  max_colaboradores int DEFAULT 0,
  documentos jsonb DEFAULT '[]'::jsonb,
  evento_id uuid REFERENCES events(id) ON DELETE SET NULL,
  registration_token text,
  registration_token_expires_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Pessoas (colaboradores)
CREATE TABLE IF NOT EXISTS pessoas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  cpf text,
  data_nascimento date,
  nome_mae text,
  telefone text,
  email text,
  foto_url text,
  empresa_id uuid REFERENCES empresas(id) ON DELETE SET NULL,
  evento_id uuid REFERENCES events(id) ON DELETE SET NULL,
  dias_acesso jsonb DEFAULT '[]'::jsonb,
  funcao text,
  qr_code text,
  bracelet_number text,
  status_acesso text DEFAULT 'pendente', -- pendente, autorizado, negado, checkin, checkout, bloqueado
  origem_cadastro text,
  registration_token text,
  registration_token_expires_at timestamptz,
  face_embedding double precision[], -- vetor de embedding (opcional)
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Veículos
CREATE TABLE IF NOT EXISTS veiculos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  marca text,
  modelo text,
  cor text,
  placa text,
  fotos jsonb DEFAULT '[]'::jsonb,
  pessoa_id uuid REFERENCES pessoas(id) ON DELETE CASCADE,
  evento_id uuid REFERENCES events(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Documentos (anexados por empresas/pessoas)
CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_type text CHECK (owner_type IN ('empresa','pessoa')) NOT NULL,
  owner_id uuid NOT NULL,
  doc_type text,
  file_url text,
  status_auditoria text DEFAULT 'pendente', -- pendente, aprovado, reprovado
  uploaded_at timestamptz DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_comment text
);

-- Índice para acelerar busca por dono
CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents (owner_type, owner_id);

-- Dispositivos (leitores, catracas, cameras)
CREATE TABLE IF NOT EXISTS devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  device_type text,
  ip_address text,
  protocol text,
  config jsonb DEFAULT '{}'::jsonb,
  last_seen timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Checkins / Logs de Acesso
CREATE TABLE IF NOT EXISTS checkins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid REFERENCES pessoas(id) ON DELETE SET NULL,
  evento_id uuid REFERENCES events(id) ON DELETE SET NULL,
  type text CHECK (type IN ('checkin','checkout')),
  method text CHECK (method IN ('face','qr','bracelet')),
  terminal_id text,
  terminal_area text,
  timestamp timestamptz DEFAULT now()
);

-- Índices importantes para relatórios e buscas de tempo
CREATE INDEX IF NOT EXISTS idx_checkins_evento_timestamp ON checkins (evento_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_checkins_pessoa_timestamp ON checkins (pessoa_id, timestamp DESC);

-- Usuários do sistema (admin / operador)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  role text CHECK (role IN ('admin','operador')) DEFAULT 'operador',
  name text,
  evento_id uuid REFERENCES events(id) ON DELETE SET NULL,
  permissions jsonb DEFAULT '{}'::jsonb,
  active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Índices para busca
CREATE INDEX IF NOT EXISTS idx_pessoas_cpf_evento ON pessoas (evento_id, cpf);
CREATE INDEX IF NOT EXISTS idx_pessoas_nome_lower ON pessoas (lower(nome));

-- Tabela de convites (admin -> usuários)
CREATE TABLE IF NOT EXISTS user_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invite_token text NOT NULL UNIQUE,
  email text NOT NULL,
  role text CHECK (role IN ('admin','operador')) DEFAULT 'operador',
  evento_id uuid REFERENCES events(id) ON DELETE SET NULL,
  permissions jsonb DEFAULT '{}'::jsonb,
  invited_by uuid REFERENCES users(id),
  expires_at timestamptz,
  used boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Consentimentos LGPD (registro por pessoa/evento)
CREATE TABLE IF NOT EXISTS consent_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pessoa_id uuid REFERENCES pessoas(id) ON DELETE CASCADE,
  evento_id uuid REFERENCES events(id) ON DELETE CASCADE,
  consent_data jsonb DEFAULT '{}'::jsonb,
  ip text,
  user_agent text,
  created_at timestamptz DEFAULT now()
);

-- Auditoria de ações
CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES users(id),
  action text,
  resource text,
  resource_id uuid,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- =====================
-- Triggers: Atualizar campo updated_at automaticamente
-- =====================
CREATE OR REPLACE FUNCTION trigger_set_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar triggers para todas as tabelas que possuem updated_at
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'events') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_set_timestamp_events ON events';
    EXECUTE 'CREATE TRIGGER trg_set_timestamp_events BEFORE UPDATE ON events FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'empresas') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_set_timestamp_empresas ON empresas';
    EXECUTE 'CREATE TRIGGER trg_set_timestamp_empresas BEFORE UPDATE ON empresas FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'pessoas') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_set_timestamp_pessoas ON pessoas';
    EXECUTE 'CREATE TRIGGER trg_set_timestamp_pessoas BEFORE UPDATE ON pessoas FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'veiculos') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_set_timestamp_veiculos ON veiculos';
    EXECUTE 'CREATE TRIGGER trg_set_timestamp_veiculos BEFORE UPDATE ON veiculos FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'devices') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_set_timestamp_devices ON devices';
    EXECUTE 'CREATE TRIGGER trg_set_timestamp_devices BEFORE UPDATE ON devices FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class WHERE relname = 'users') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS trg_set_timestamp_users ON users';
    EXECUTE 'CREATE TRIGGER trg_set_timestamp_users BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_timestamp()';
  END IF;
END$$;

-- =====================
-- Constraints e índices adicionais
-- =====================

-- Unicidade do CNPJ (normalizado em números) -- se preenchido
CREATE UNIQUE INDEX IF NOT EXISTS idx_empresas_cnpj_normalized ON empresas (lower(trim(cnpj))) WHERE cnpj IS NOT NULL;

-- Garantir unicidade de CPF por evento
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename='pessoas' AND indexname='pessoas_evento_cpf_key') THEN
    BEGIN
      ALTER TABLE pessoas ADD CONSTRAINT pessoas_evento_cpf_key UNIQUE (evento_id, cpf);
    EXCEPTION WHEN duplicate_object THEN
      -- ignora se já existe (compatibilidade)
      NULL;
    END;
  END IF;
END$$;

-- Índice em placas por evento
CREATE UNIQUE INDEX IF NOT EXISTS idx_veiculos_evento_placa ON veiculos (evento_id, placa) WHERE placa IS NOT NULL;

-- Índices para relatórios frequentes
CREATE INDEX IF NOT EXISTS idx_checkins_method ON checkins (method);
CREATE INDEX IF NOT EXISTS idx_documents_status ON documents (status_auditoria);

-- Fim do esquema
