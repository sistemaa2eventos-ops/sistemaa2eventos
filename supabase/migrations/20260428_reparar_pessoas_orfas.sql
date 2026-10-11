-- Migração: Reparar pessoas órfãs (2026-04-28)
-- Encontra pessoas sem vínculo na pivot e cria os registros

-- 1. Ver quantas pessoas órfãs existem
SELECT
    COUNT(*) as total_orfas,
    COUNT(DISTINCT evento_id) as eventos_afetados
FROM pessoas p
WHERE NOT EXISTS (
    SELECT 1 FROM pessoa_evento_empresa pee
    WHERE pee.pessoa_id = p.id
);

-- 2. Listar pessoas órfãs para inspeção
SELECT
    p.id,
    p.nome_completo,
    p.evento_id,
    CASE
        WHEN EXISTS (SELECT 1 FROM empresas e WHERE e.evento_id = p.evento_id LIMIT 1)
        THEN 'tem_empresa'
        ELSE 'sem_empresa'
    END as status_empresa
FROM pessoas p
WHERE NOT EXISTS (
    SELECT 1 FROM pessoa_evento_empresa pee
    WHERE pee.pessoa_id = p.id
);

-- 3. Criar registros de pivot para pessoas órfãs (vincular a primeira empresa do evento)
INSERT INTO pessoa_evento_empresa (pessoa_id, evento_id, empresa_id, status_aprovacao, cargo_funcao, created_at, updated_at)
SELECT DISTINCT
    p.id,
    p.evento_id,
    (
        SELECT e.id FROM empresas e
        WHERE e.evento_id = p.evento_id
        LIMIT 1
    ) as empresa_id,
    'aprovado' as status_aprovacao,
    'Participante' as cargo_funcao,
    CURRENT_TIMESTAMP as created_at,
    CURRENT_TIMESTAMP as updated_at
FROM pessoas p
WHERE NOT EXISTS (
    SELECT 1 FROM pessoa_evento_empresa pee
    WHERE pee.pessoa_id = p.id
)
AND EXISTS (
    SELECT 1 FROM empresas e
    WHERE e.evento_id = p.evento_id
);

-- 4. Verificar resultado
SELECT
    COUNT(*) as total_vinculado,
    COUNT(CASE WHEN status_aprovacao = 'pendente' THEN 1 END) as pendentes,
    COUNT(CASE WHEN status_aprovacao = 'aprovado' THEN 1 END) as aprovados
FROM pessoa_evento_empresa;

-- 5. Confirmar mensagem
DO $$
BEGIN
    RAISE NOTICE '✅ Reparação concluída!';
    RAISE NOTICE 'Pessoas órfãs foram vinculadas à primeira empresa do seu evento';
    RAISE NOTICE 'Aguarde aprovação para gerar QR code';
END $$;
