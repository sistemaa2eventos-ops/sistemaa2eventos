-- Excluir um login (operador ou conta órfã) sem perder os registros feitos por ele.
-- As colunas "quem fez" (created_by, criado_por, atualizado_por) apontavam para auth.users sem
-- regra de exclusão: o Supabase recusava apagar qualquer login que já tivesse registrado um
-- acesso, um cadastro ou uma empresa ("Database error deleting user").
-- Agora, ao apagar o login, os registros ficam e só o autor vira vazio.

do $$
declare
    r record;
begin
    for r in
        select c.conname, c.conrelid::regclass as tabela, a.attname as coluna
        from pg_constraint c
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
        where c.contype = 'f'
          and c.confrelid = 'auth.users'::regclass
          and c.connamespace = 'public'::regnamespace
          and c.confdeltype = 'a'                       -- sem regra (NO ACTION)
          and a.attname in ('created_by', 'criado_por', 'atualizado_por')
    loop
        execute format('alter table %s drop constraint %I', r.tabela, r.conname);
        execute format('alter table %s add constraint %I foreign key (%I) references auth.users(id) on delete set null',
                       r.tabela, r.conname, r.coluna);
        raise notice 'ajustado: %.%', r.tabela, r.coluna;
    end loop;
end $$;
