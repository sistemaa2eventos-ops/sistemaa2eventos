-- Tempo de cada atendimento do operador (para métricas e orçamento de eventos).
-- O painel marca quando o operador abriu o atendimento (cadastro, credenciamento com pulseira)
-- e o servidor grava ao concluir. Sem políticas RLS: só o servidor lê e grava.

create table if not exists public.atendimentos (
    id uuid primary key default gen_random_uuid(),
    evento_id uuid not null,
    operador_id uuid,                -- auth.users (sem FK: apagar o operador não apaga as métricas)
    pessoa_id uuid,
    tipo varchar(20) not null check (tipo in ('cadastro', 'credenciamento', 'checkin', 'checkout')),
    estacao varchar(100),
    inicio timestamptz not null,
    fim timestamptz not null default now(),
    duracao_seg integer generated always as (greatest(0, extract(epoch from (fim - inicio)))::integer) stored,
    created_at timestamptz not null default now()
);
create index if not exists idx_atendimentos_evento_inicio on public.atendimentos (evento_id, inicio);
create index if not exists idx_atendimentos_operador on public.atendimentos (operador_id, inicio);

alter table public.atendimentos enable row level security;
