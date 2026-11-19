-- =====================================================================================================
-- Módulo de Produção de Eventos — NZT Intelligent Control System (19/11/2026)
--
-- Tabelas aditivas com isolamento multi-tenant por evento_id, constraints de integridade,
-- índices de performance para dashboard/cronograma/planta e Row Level Security (RLS).
-- Idempotente: pode rodar mais de uma vez sem causar erros.
-- =====================================================================================================

-- 1. Áreas de atuação da produção (Infraestrutura, Palco, Som, Luz, A&B, Limpeza, Segurança...)
CREATE TABLE IF NOT EXISTS public.producao_areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL,
    cor VARCHAR(20) DEFAULT '#00D4FF',
    descricao TEXT,
    responsavel_nome VARCHAR(150),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_areas_evento ON public.producao_areas(evento_id);

-- 2. Cadastro de produtores e vínculo evento × área × período × cachê (confidencial)
CREATE TABLE IF NOT EXISTS public.producao_produtores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    pessoa_id UUID REFERENCES public.pessoas(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nome VARCHAR(200) NOT NULL,
    email VARCHAR(200),
    telefone VARCHAR(30),
    documento VARCHAR(30),
    foto_url TEXT,
    area_id UUID REFERENCES public.producao_areas(id) ON DELETE SET NULL,
    papel_producao VARCHAR(30) NOT NULL DEFAULT 'produtor_area'
        CHECK (papel_producao IN ('produtor_geral', 'arquiteto_evento', 'financeiro', 'auditoria', 'produtor_area', 'staff')),
    tipo_cache VARCHAR(20) DEFAULT 'diaria'
        CHECK (tipo_cache IN ('diaria', 'evento_fechado', 'tarefa', 'hora')),
    valor_cache_centavos INTEGER DEFAULT 0 CHECK (valor_cache_centavos >= 0),
    dados_bancarios_cifrados TEXT,
    historico_cache JSONB NOT NULL DEFAULT '[]'::jsonb,
    periodo_inicio DATE,
    periodo_fim DATE,
    termo_lgpd_aceito BOOLEAN DEFAULT false,
    termo_lgpd_data TIMESTAMPTZ,
    status VARCHAR(20) DEFAULT 'ativo' CHECK (status IN ('convidado', 'ativo', 'inativo', 'bloqueado')),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_produtores_evento ON public.producao_produtores(evento_id);
CREATE INDEX IF NOT EXISTS idx_producao_produtores_area ON public.producao_produtores(area_id);
CREATE INDEX IF NOT EXISTS idx_producao_produtores_user ON public.producao_produtores(user_id);

-- 3. Projetos técnicos e arquivos versionados
CREATE TABLE IF NOT EXISTS public.producao_projetos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    area_id UUID REFERENCES public.producao_areas(id) ON DELETE SET NULL,
    titulo VARCHAR(200) NOT NULL,
    categoria VARCHAR(50) NOT NULL DEFAULT 'arquitetura',
    descricao TEXT,
    status VARCHAR(20) DEFAULT 'em_elaboracao'
        CHECK (status IN ('em_elaboracao', 'revisao', 'aprovado', 'obsoleto')),
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_projetos_evento ON public.producao_projetos(evento_id);

CREATE TABLE IF NOT EXISTS public.producao_arquivos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    projeto_id UUID NOT NULL REFERENCES public.producao_projetos(id) ON DELETE CASCADE,
    versao INTEGER NOT NULL DEFAULT 1,
    nome_original VARCHAR(255) NOT NULL,
    extensao VARCHAR(20) NOT NULL,
    tamanho_bytes BIGINT NOT NULL DEFAULT 0,
    url_storage TEXT NOT NULL,
    url_visualizacao_png TEXT,
    observacao TEXT,
    criado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_arquivos_projeto ON public.producao_arquivos(projeto_id, versao DESC);

-- 4. Plantas baixas, versões oficiais, setores poligonais e propostas de alteração
CREATE TABLE IF NOT EXISTS public.producao_plantas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    projeto_id UUID REFERENCES public.producao_projetos(id) ON DELETE SET NULL,
    titulo VARCHAR(200) NOT NULL,
    escala_pixels_por_metro NUMERIC(10, 4) DEFAULT 20.0,
    largura_px INTEGER NOT NULL DEFAULT 1200,
    altura_px INTEGER NOT NULL DEFAULT 750,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_plantas_evento ON public.producao_plantas(evento_id);

CREATE TABLE IF NOT EXISTS public.producao_planta_versoes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planta_id UUID NOT NULL REFERENCES public.producao_plantas(id) ON DELETE CASCADE,
    numero_versao INTEGER NOT NULL DEFAULT 1,
    imagem_fundo_url TEXT,
    elementos_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    publicada_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    publicada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    eh_oficial BOOLEAN DEFAULT true,
    notas_versao TEXT,
    UNIQUE(planta_id, numero_versao)
);

CREATE TABLE IF NOT EXISTS public.producao_setores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planta_versao_id UUID NOT NULL REFERENCES public.producao_planta_versoes(id) ON DELETE CASCADE,
    area_id UUID REFERENCES public.producao_areas(id) ON DELETE SET NULL,
    nome VARCHAR(100) NOT NULL,
    cor_hex VARCHAR(20) DEFAULT '#00D4FF',
    poligono_coordenadas JSONB NOT NULL DEFAULT '[]'::jsonb,
    responsavel_nome VARCHAR(150),
    capacidade_maxima INTEGER
);

CREATE TABLE IF NOT EXISTS public.producao_planta_propostas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    planta_versao_base_id UUID NOT NULL REFERENCES public.producao_planta_versoes(id) ON DELETE CASCADE,
    autor_produtor_id UUID REFERENCES public.producao_produtores(id) ON DELETE SET NULL,
    tarefa_id UUID,
    titulo VARCHAR(200) NOT NULL,
    justificativa TEXT NOT NULL,
    elementos_alterados_json JSONB NOT NULL DEFAULT '[]'::jsonb,
    status VARCHAR(20) DEFAULT 'pendente'
        CHECK (status IN ('pendente', 'em_analise', 'aprovada', 'rejeitada', 'cancelada')),
    analisado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    analisado_em TIMESTAMPTZ,
    parecer_arquiteto TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 5. Tarefas, etapas (checklist), dependências e evidências multimídia
CREATE TABLE IF NOT EXISTS public.producao_tarefas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    area_id UUID NOT NULL REFERENCES public.producao_areas(id) ON DELETE RESTRICT,
    setor_id UUID REFERENCES public.producao_setores(id) ON DELETE SET NULL,
    titulo VARCHAR(200) NOT NULL,
    objetivo TEXT,
    imagem_referencia_url TEXT,
    sugestoes_levar JSONB NOT NULL DEFAULT '[]'::jsonb,
    prioridade VARCHAR(20) DEFAULT 'media' CHECK (prioridade IN ('baixa', 'media', 'alta', 'critica')),
    status VARCHAR(20) DEFAULT 'disponivel'
        CHECK (status IN ('rascunho', 'disponivel', 'em_andamento', 'bloqueada', 'em_revisao', 'concluida', 'reaberta')),
    produtor_atribuido_id UUID REFERENCES public.producao_produtores(id) ON DELETE SET NULL,
    data_inicio_planejada TIMESTAMPTZ,
    data_fim_planejada TIMESTAMPTZ,
    data_inicio_real TIMESTAMPTZ,
    data_fim_real TIMESTAMPTZ,
    tempo_estimado_minutos INTEGER,
    percentual_concluido NUMERIC(5, 2) DEFAULT 0.0,
    motivo_bloqueio TEXT,
    motivo_reabertura TEXT,
    requer_aprovacao_conclusao BOOLEAN DEFAULT true,
    aprovado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    aprovado_em TIMESTAMPTZ,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_tarefas_evento_area ON public.producao_tarefas(evento_id, area_id);
CREATE INDEX IF NOT EXISTS idx_producao_tarefas_status ON public.producao_tarefas(status);

CREATE TABLE IF NOT EXISTS public.producao_etapas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tarefa_id UUID NOT NULL REFERENCES public.producao_tarefas(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL DEFAULT 1,
    descricao VARCHAR(255) NOT NULL,
    obrigatoria BOOLEAN DEFAULT true,
    concluida BOOLEAN DEFAULT false,
    concluida_por UUID REFERENCES public.producao_produtores(id) ON DELETE SET NULL,
    concluida_em TIMESTAMPTZ,
    geolocalizacao JSONB
);
CREATE INDEX IF NOT EXISTS idx_producao_etapas_tarefa ON public.producao_etapas(tarefa_id, ordem);

CREATE TABLE IF NOT EXISTS public.producao_tarefas_dependencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tarefa_origem_id UUID NOT NULL REFERENCES public.producao_tarefas(id) ON DELETE CASCADE,
    tarefa_dependente_id UUID NOT NULL REFERENCES public.producao_tarefas(id) ON DELETE CASCADE,
    tipo VARCHAR(25) DEFAULT 'fim_para_inicio' CHECK (tipo IN ('fim_para_inicio', 'inicio_para_inicio')),
    UNIQUE(tarefa_origem_id, tarefa_dependente_id)
);

CREATE TABLE IF NOT EXISTS public.producao_evidencias (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    etapa_id UUID NOT NULL REFERENCES public.producao_etapas(id) ON DELETE CASCADE,
    autor_produtor_id UUID REFERENCES public.producao_produtores(id) ON DELETE SET NULL,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('foto', 'video', 'audio', 'texto')),
    url_arquivo TEXT,
    texto_comentario TEXT,
    transcricao_audio TEXT,
    geolocalizacao JSONB,
    sync_id UUID UNIQUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_evidencias_etapa ON public.producao_evidencias(etapa_id, criado_em DESC);

-- 6. Catálogo de materiais, recebimentos, sessões de contagem IA e movimentação
CREATE TABLE IF NOT EXISTS public.producao_materiais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    codigo_catalogo VARCHAR(50),
    nome VARCHAR(150) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    subtipo VARCHAR(60),
    dimensoes VARCHAR(80),
    peso_kg NUMERIC(8, 2),
    fornecedor_nome VARCHAR(150),
    fornecedor_empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    foto_referencia_url TEXT,
    classe_deteccao_ia VARCHAR(80),
    quantidade_planejada INTEGER DEFAULT 0,
    quantidade_recebida INTEGER DEFAULT 0,
    quantidade_avariada INTEGER DEFAULT 0,
    status_movimentacao VARCHAR(30) DEFAULT 'previsto'
        CHECK (status_movimentacao IN ('previsto', 'recebido', 'em_estoque', 'separado_setor', 'montado', 'desmontado', 'devolvido')),
    ativo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_materiais_evento ON public.producao_materiais(evento_id);

CREATE TABLE IF NOT EXISTS public.producao_recebimentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    fornecedor_nome VARCHAR(150),
    fornecedor_empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    numero_nota_romaneio VARCHAR(100),
    data_hora_chegada TIMESTAMPTZ NOT NULL DEFAULT now(),
    conferente_produtor_id UUID REFERENCES public.producao_produtores(id) ON DELETE SET NULL,
    status VARCHAR(30) DEFAULT 'em_conferencia'
        CHECK (status IN ('em_conferencia', 'aprovado_total', 'aprovado_divergencia', 'rejeitado')),
    observacoes TEXT
);

CREATE TABLE IF NOT EXISTS public.producao_sessoes_contagem (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recebimento_id UUID NOT NULL REFERENCES public.producao_recebimentos(id) ON DELETE CASCADE,
    camera_ip_id UUID,
    origem_midia VARCHAR(30) DEFAULT 'video_gravado' CHECK (origem_midia IN ('celular_live', 'video_gravado', 'camera_rtsp')),
    video_gravado_url TEXT,
    modelo_ia_versao VARCHAR(60) DEFAULT 'rt-detr-apache2-v1',
    modo_contagem VARCHAR(20) DEFAULT 'line_zone' CHECK (modo_contagem IN ('line_zone', 'polygon_zone', 'sahi_estatico')),
    status_processamento VARCHAR(20) DEFAULT 'concluido'
        CHECK (status_processamento IN ('enfileirado', 'processando', 'concluido', 'falha')),
    iniciado_em TIMESTAMPTZ DEFAULT now(),
    finalizado_em TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.producao_itens_contados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sessao_contagem_id UUID NOT NULL REFERENCES public.producao_sessoes_contagem(id) ON DELETE CASCADE,
    material_id UUID REFERENCES public.producao_materiais(id) ON DELETE SET NULL,
    classe_identificada VARCHAR(80) NOT NULL,
    reconhecido_catalogo BOOLEAN DEFAULT true,
    quantidade_esperada INTEGER DEFAULT 0,
    quantidade_ia INTEGER NOT NULL DEFAULT 0,
    quantidade_corrigida_humano INTEGER,
    confianca_media NUMERIC(5, 4),
    quadro_chave_evidencia_url TEXT,
    corrigido_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    justificativa_correcao TEXT
);

CREATE TABLE IF NOT EXISTS public.producao_movimentacoes_materiais (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    material_id UUID NOT NULL REFERENCES public.producao_materiais(id) ON DELETE CASCADE,
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    estagio_anterior VARCHAR(30),
    estagio_novo VARCHAR(30) NOT NULL,
    setor_destino VARCHAR(100),
    quantidade INTEGER NOT NULL DEFAULT 0,
    observacao TEXT,
    registrado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 7. Orçamentos e custos da produção (confidencial)
CREATE TABLE IF NOT EXISTS public.producao_orcamentos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    area_id UUID REFERENCES public.producao_areas(id) ON DELETE SET NULL,
    fornecedor_nome VARCHAR(150),
    fornecedor_empresa_id UUID REFERENCES public.empresas(id) ON DELETE SET NULL,
    titulo VARCHAR(200) NOT NULL,
    valor_previsto_centavos BIGINT NOT NULL DEFAULT 0,
    valor_realizado_centavos BIGINT NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'rascunho'
        CHECK (status IN ('rascunho', 'enviado', 'aprovado', 'recusado', 'liquidado')),
    url_anexo_orcamento TEXT,
    aprovado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_orcamentos_evento ON public.producao_orcamentos(evento_id);

-- 8. Escalas, presença de equipe e detecção de dobras
CREATE TABLE IF NOT EXISTS public.producao_escalas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    area_id UUID NOT NULL REFERENCES public.producao_areas(id) ON DELETE CASCADE,
    produtor_id UUID NOT NULL REFERENCES public.producao_produtores(id) ON DELETE CASCADE,
    data_inicio_turno TIMESTAMPTZ NOT NULL,
    data_fim_turno TIMESTAMPTZ NOT NULL,
    tipo_turno VARCHAR(30) DEFAULT 'normal' CHECK (tipo_turno IN ('normal', 'dobra_planejada', 'plantao')),
    status VARCHAR(20) DEFAULT 'agendado' CHECK (status IN ('agendado', 'presente', 'falta', 'atraso', 'substituido', 'expulso'))
);

CREATE TABLE IF NOT EXISTS public.producao_registros_presenca (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    escala_id UUID REFERENCES public.producao_escalas(id) ON DELETE SET NULL,
    produtor_id UUID NOT NULL REFERENCES public.producao_produtores(id) ON DELETE CASCADE,
    tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('checkin', 'checkout', 'falta', 'atraso', 'expulsao', 'substituicao')),
    data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
    metodo VARCHAR(25) DEFAULT 'qrcode' CHECK (metodo IN ('qrcode', 'manual', 'facial_cftv')),
    geolocalizacao JSONB,
    foto_comprovante_url TEXT,
    eh_dobra_detectada BOOLEAN DEFAULT false,
    motivo_ocorrencia TEXT,
    substituto_produtor_id UUID REFERENCES public.producao_produtores(id) ON DELETE SET NULL,
    registrado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    sync_id UUID UNIQUE
);
CREATE INDEX IF NOT EXISTS idx_producao_presenca_evento_data ON public.producao_registros_presenca(evento_id, data_hora DESC);

-- 9. Templates de relatórios PDF e histórico de relatórios gerados
CREATE TABLE IF NOT EXISTS public.producao_templates_relatorios (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    nome VARCHAR(100) NOT NULL DEFAULT 'Padrão NZT',
    logo_personalizado_url TEXT,
    cor_cabecalho_hex VARCHAR(20) DEFAULT '#0A1628',
    rodape_personalizado TEXT DEFAULT 'Relatório oficial de produção • NZT Eventos',
    marca_dagua_texto VARCHAR(100) DEFAULT 'USO INTERNO • PRODUÇÃO',
    marca_dagua_opacidade NUMERIC(3, 2) DEFAULT 0.08,
    horario_diario_automatico TIME DEFAULT '22:00:00',
    exibir_fotos_evidencia BOOLEAN DEFAULT true,
    exibir_financeiro BOOLEAN DEFAULT false
);

CREATE TABLE IF NOT EXISTS public.producao_relatorios_gerados (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    template_id UUID REFERENCES public.producao_templates_relatorios(id) ON DELETE SET NULL,
    tipo VARCHAR(35) NOT NULL CHECK (tipo IN ('diario_automatico', 'tarefas_area', 'materiais_conferencia', 'presenca_dobras', 'financeiro_executivo', 'historico_planta')),
    data_referencia DATE NOT NULL DEFAULT CURRENT_DATE,
    url_pdf_storage TEXT,
    tamanho_bytes BIGINT,
    gerado_por_nome VARCHAR(150),
    gerado_por UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    gerado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 10. Trilha de auditoria dedicada da Produção
CREATE TABLE IF NOT EXISTS public.producao_auditoria (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evento_id UUID NOT NULL REFERENCES public.eventos(id) ON DELETE CASCADE,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    usuario_nome VARCHAR(150),
    acao VARCHAR(80) NOT NULL,
    entidade VARCHAR(80) NOT NULL,
    entidade_id UUID,
    antes JSONB,
    depois JSONB,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_producao_auditoria_evento ON public.producao_auditoria(evento_id, criado_em DESC);

-- =====================================================================================================
-- RLS (Row Level Security): Service role da API tem acesso completo; acesso direto pelo browser restrito
-- =====================================================================================================
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY[
        'producao_areas', 'producao_produtores', 'producao_projetos', 'producao_arquivos',
        'producao_plantas', 'producao_planta_versoes', 'producao_setores', 'producao_planta_propostas',
        'producao_tarefas', 'producao_etapas', 'producao_tarefas_dependencias', 'producao_evidencias',
        'producao_materiais', 'producao_recebimentos', 'producao_sessoes_contagem', 'producao_itens_contados',
        'producao_movimentacoes_materiais', 'producao_orcamentos', 'producao_escalas',
        'producao_registros_presenca', 'producao_templates_relatorios', 'producao_relatorios_gerados',
        'producao_auditoria'
    ]
    LOOP
        EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
        EXECUTE format('DROP POLICY IF EXISTS "service_role_full_%s" ON public.%I;', t, t);
        EXECUTE format('CREATE POLICY "service_role_full_%s" ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true);', t, t);
    END LOOP;
END $$;

-- =====================================================================================================
-- DOWN / ROLLBACK (Descomente e execute apenas se precisar reverter completamente o Módulo de Produção)
-- =====================================================================================================
/*
DROP TABLE IF EXISTS public.producao_auditoria CASCADE;
DROP TABLE IF EXISTS public.producao_relatorios_gerados CASCADE;
DROP TABLE IF EXISTS public.producao_templates_relatorios CASCADE;
DROP TABLE IF EXISTS public.producao_registros_presenca CASCADE;
DROP TABLE IF EXISTS public.producao_escalas CASCADE;
DROP TABLE IF EXISTS public.producao_orcamentos CASCADE;
DROP TABLE IF EXISTS public.producao_movimentacoes_materiais CASCADE;
DROP TABLE IF EXISTS public.producao_itens_contados CASCADE;
DROP TABLE IF EXISTS public.producao_sessoes_contagem CASCADE;
DROP TABLE IF EXISTS public.producao_recebimentos CASCADE;
DROP TABLE IF EXISTS public.producao_materiais CASCADE;
DROP TABLE IF EXISTS public.producao_evidencias CASCADE;
DROP TABLE IF EXISTS public.producao_tarefas_dependencias CASCADE;
DROP TABLE IF EXISTS public.producao_etapas CASCADE;
DROP TABLE IF EXISTS public.producao_tarefas CASCADE;
DROP TABLE IF EXISTS public.producao_planta_propostas CASCADE;
DROP TABLE IF EXISTS public.producao_setores CASCADE;
DROP TABLE IF EXISTS public.producao_planta_versoes CASCADE;
DROP TABLE IF EXISTS public.producao_plantas CASCADE;
DROP TABLE IF EXISTS public.producao_arquivos CASCADE;
DROP TABLE IF EXISTS public.producao_projetos CASCADE;
DROP TABLE IF EXISTS public.producao_produtores CASCADE;
DROP TABLE IF EXISTS public.producao_areas CASCADE;
*/
