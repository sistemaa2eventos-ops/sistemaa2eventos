-- Migration 09: ECM Document Validity Extensions

-- Adiciona campos de controle de vida útil aos documentos operacionais
ALTER TABLE public.pessoa_documentos
ADD COLUMN IF NOT EXISTS data_emissao DATE,
ADD COLUMN IF NOT EXISTS data_validade DATE;

-- Adiciona os mesmos campos para empresas (certidões, alvarás) se aplicável futuramente
ALTER TABLE public.empresa_documentos
ADD COLUMN IF NOT EXISTS data_emissao DATE,
ADD COLUMN IF NOT EXISTS data_validade DATE;

-- Enumeração e regras no schema para segurança (opcional, garantindo q status obedeça)
-- Aqui garantiremos que toda vez que vencido, ele mude o status.
-- Vamos criar uma Function para expirar automaticamente documentos.

CREATE OR REPLACE FUNCTION public.revogar_documentos_vencidos()
RETURNS void AS $$
BEGIN
  -- Atualizar documentos de Pessoas
  UPDATE public.pessoa_documentos
  SET status = 'rejeitado', notas_auditoria = 'DOCUMENTO VENCIDO AUTOMATICAMENTE'
  WHERE status = 'aprovado' AND data_validade < CURRENT_DATE;

  -- Atualizar documentos de Empresas
  UPDATE public.empresa_documentos
  SET status = 'rejeitado', notas_auditoria = 'DOCUMENTO VENCIDO AUTOMATICAMENTE'
  WHERE status = 'aprovado' AND data_validade < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
