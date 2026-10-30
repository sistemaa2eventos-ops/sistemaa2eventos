-- Cópia dos documentos (pessoas e empresas) para o Google Drive da conta conectada no painel.
-- Sem políticas RLS: só o servidor (service role) lê e grava; o refresh_token nunca vai ao navegador.

create table if not exists public.drive_conexao (
    id smallint primary key default 1 check (id = 1),     -- uma conexão para o sistema
    email text not null,
    refresh_token text not null,
    pasta_raiz_id text,                                    -- pasta "NZT - Documentos" criada pelo sistema
    conectado_por uuid,
    conectado_em timestamptz not null default now(),
    ultimo_erro text,
    ultimo_erro_em timestamptz
);

create table if not exists public.drive_copias (
    id uuid primary key default gen_random_uuid(),
    origem varchar(10) not null check (origem in ('pessoa', 'empresa')),
    documento_id uuid not null,
    evento_id uuid,
    drive_file_id text,
    status varchar(10) not null default 'pendente' check (status in ('pendente', 'copiado', 'erro')),
    erro text,
    tentativas integer not null default 0,
    copiado_em timestamptz,
    created_at timestamptz not null default now(),
    unique (origem, documento_id)
);
create index if not exists idx_drive_copias_evento_status on public.drive_copias (evento_id, status);

alter table public.drive_conexao enable row level security;
alter table public.drive_copias enable row level security;
