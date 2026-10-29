# Migrations antigas (histórico)

Esta pasta guarda as migrations de **antes de out/2026**. Elas já foram aplicadas no Supabase de produção e ficam aqui só como histórico.

**Migrations novas vão em [`supabase/migrations/`](../../supabase/migrations/)**, na raiz do projeto, rodadas no SQL Editor do Supabase.

Não copie estes arquivos para `supabase/migrations/`. O projeto está ligado ao Supabase CLI (`supabase/.temp`), e um `supabase db push` tentaria reaplicar tudo o que estiver lá e ainda não constar no histórico do banco.

Para saber o que está de fato no banco, consulte o próprio banco, não os arquivos. Por exemplo, para os índices:

```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public'
order by 1, 2;
```

A migration [`20261029_desempenho_banco.sql`](../../supabase/migrations/20261029_desempenho_banco.sql) faz isso sozinha: lê os índices e as policies que existem e ajusta só o que precisa.
