-- Consultas SOMENTE LEITURA para rodar no Supabase (SQL Editor), antes do evento.
-- Não alteram nada. Se alguma coluna não existir, a consulta acusa o nome: ajuste e rode de novo.
-- Substitua <EVENTO_ID> pelo id do evento real.

-- S1 · Horário de reset dos eventos (se for 00:00:00, o item O2 não se aplica)
select id, nome, status, horario_reset
from eventos
where status = 'ativo';

-- S2 · Pessoas com número de pulseira e SEM vínculo aberto (número "fantasma")
select p.evento_id, p.id, p.nome, p.numero_pulseira, p.status_acesso
from pessoas p
where p.numero_pulseira is not null
  and not exists (
    select 1 from pulseira_vinculos v
    where v.pessoa_id = p.id and v.encerrado_em is null
  );

-- S3 · Vínculos de pulseira ainda abertos (ver se o reset fechou o que devia)
select v.evento_id, v.pessoa_id, v.numero_pulseira, v.entregue_em
from pulseira_vinculos v
where v.encerrado_em is null
order by v.entregue_em;

-- S4 · Pessoas presas em "checkin_feito" sem entrada aberta (última entrada/saída não é check-in)
select p.evento_id, p.id, p.nome, p.status_acesso
from pessoas p
where p.status_acesso = 'checkin_feito'
  and (
    select l.tipo from logs_acesso l
    where l.pessoa_id = p.id and l.evento_id = p.evento_id
      and l.tipo in ('checkin','checkout')
    order by l.created_at desc limit 1
  ) is distinct from 'checkin';

-- S5 · Pessoas com status de bloqueio incoerente (expulso sem bloqueado, ou bloqueado sem motivo)
select id, evento_id, nome, status_acesso, bloqueado, motivo_bloqueio
from pessoas
where (status_acesso = 'expulso' and coalesce(bloqueado,false) = false)
   or (coalesce(bloqueado,false) = true and motivo_bloqueio is null);

-- S6 · CPF com pontuação ou caracteres não numéricos (registros legados; quebram a deduplicação)
select count(*) as cpf_com_mascara
from pessoas
where cpf ~ '[^0-9]';

-- S7 · CPF duplicado dentro do mesmo evento (depois da normalização)
select evento_id, regexp_replace(cpf,'[^0-9]','','g') as cpf_digitos, count(*)
from pessoas
where cpf is not null
group by 1,2
having count(*) > 1;

-- S8 · Snapshots diários duplicados (reset manual + automático no mesmo dia)
select evento_id, data_referencia, tipo_reset, count(*)
from relatorios_diarios_fechados
group by 1,2,3
having count(*) > 1;

-- S9 · Pulseiras numéricas: mesma pulseira em pessoas diferentes no mesmo evento (vínculo aberto)
select evento_id, numero_pulseira, count(*) as pessoas
from pulseira_vinculos
where encerrado_em is null
group by 1,2
having count(*) > 1;

-- S10 · Saídas forçadas do reset (quando e quantas, para conferir o horário de reset)
select date_trunc('minute', created_at) as minuto, count(*)
from logs_acesso
where observacao = 'CHECKOUT_FORCADO_CRON'
group by 1
order by 1 desc
limit 20;

-- M1 · Existência e definição real de tabelas que aparecem duplicadas ou sem CREATE no repositório
select t, to_regclass('public.' || t) as existe
from unnest(array[
  'pessoas','logs_acesso','pessoa_evento_empresa','watchlist','watchlist_alertas','watchlist_contatos',
  'logs_veiculos','logs_acesso_veiculos','transacoes_financeiras','mensagem_templates',
  'biometria_pessoa','snapshots','logs_sync','system_sync_logs','dispositivos','funcionarios'
]) as t;

-- M2 · Colunas reais de pessoas (confirma qual definição está ativa)
select column_name, data_type
from information_schema.columns
where table_schema = 'public' and table_name = 'pessoas'
order by ordinal_position;

-- M3 · Colunas que o código usa e podem não existir (invite_token, invite_expires, trabalha_*)
select table_name, column_name
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'pessoas' and column_name in ('invite_token','invite_expires','status','trabalha_area_tecnica','trabalha_altura','trabalho_area_tecnica','trabalho_altura'))
    or (table_name = 'empresas' and column_name in ('email_convite','responsavel_legal','quota','registration_token_expires_at'))
  );

-- M4 · Migrações registradas (se o projeto usa supabase_migrations)
select version, name
from supabase_migrations.schema_migrations
order by version desc
limit 40;

-- V1 · Veículos: unicidade de placa (global ou por evento?)
select conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid = 'public.veiculos'::regclass and contype = 'u';

-- V2 · Veículos sem evento
select count(*) from veiculos where evento_id is null;

-- R1 · Políticas de RLS de pulseiras_pendencia (checar se compara com o evento certo)
select policyname, qual, with_check
from pg_policies
where tablename = 'pulseiras_pendencia';

-- R2 · Regras de remuneração desativadas ainda em uso por empresas
select e.nome as empresa, r.nome as regra
from empresas e
join regras_remuneracao r on r.id = e.regra_remuneracao_id
where r.ativo = false;

-- R3 · Documento aprovado sem validade em tipo que exige validade
select pd.id, pd.pessoa_id
from pessoa_documentos pd
join evento_tipos_documento t on t.id = pd.tipo_documento_id
where t.exige_validade and pd.status = 'aprovado' and pd.data_validade is null;

-- E1 · Empresas com pessoas ligadas (cuidado ao excluir empresa)
select e.id, e.nome, count(p.id) as pessoas
from empresas e
left join pessoas p on p.empresa_id = e.id
group by 1,2
having count(p.id) > 0;
