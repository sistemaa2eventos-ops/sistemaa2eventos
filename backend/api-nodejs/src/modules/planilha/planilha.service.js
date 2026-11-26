const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { buscarTodos } = require('../../utils/buscarTodos');
const { CAMPOS, sanitizarModelo, montarWorkbook, lerPlanilha } = require('./planilhaModelo');

const CAMPOS_PESSOA = Object.keys(CAMPOS);
const TAMANHO_LOTE = 200;

const erroHttp = (mensagem, status) => Object.assign(new Error(mensagem), { status });

/**
 * Pré-cadastro feito pela empresa (planilha no painel ou inclusão no portal da empresa) e ainda não
 * concluído pelo participante: cadastro externo sem o aceite LGPD. O link público sempre grava o
 * aceite, então só a própria pessoa transforma o pré-cadastro em cadastro concluído.
 */
const ehPreCadastroPendente = (p, empresaId) => !!p
    && p.empresa_id === empresaId
    && p.origem_cadastro === 'externo'
    && p.aceite_lgpd !== true;

class PlanilhaService {
    /** Modelo da planilha do evento (eventos.config.modelo_planilha), com os padrões. */
    async obterModelo(eventoId) {
        const { data, error } = await supabase.from('eventos').select('nome, config').eq('id', eventoId).maybeSingle();
        if (error) throw error;
        if (!data) throw erroHttp('Evento não encontrado.', 404);
        return { modelo: sanitizarModelo(data.config?.modelo_planilha), eventoNome: data.nome };
    }

    async salvarModelo(eventoId, entrada) {
        const modelo = sanitizarModelo(entrada);
        const { data: ev, error } = await supabase.from('eventos').select('config').eq('id', eventoId).single();
        if (error) throw error;
        const up = await supabase.from('eventos').update({ config: { ...(ev?.config || {}), modelo_planilha: modelo } }).eq('id', eventoId);
        if (up.error) throw up.error;
        require('../../middleware/eventMiddleware').invalidarEvento(eventoId);
        return modelo;
    }

    async _empresaDoEvento(eventoId, empresaId) {
        const { data, error } = await supabase.from('empresas')
            .select('id, nome, max_colaboradores').eq('id', empresaId).eq('evento_id', eventoId).maybeSingle();
        if (error) throw error;
        if (!data) throw erroHttp('Empresa não encontrada neste evento.', 404);
        return data;
    }

    /** Planilha em branco do evento (com o nome da empresa no cabeçalho, se informada). */
    async modeloEmBranco(eventoId, empresaId = null) {
        const { modelo, eventoNome } = await this.obterModelo(eventoId);
        const empresa = empresaId ? await this._empresaDoEvento(eventoId, empresaId) : null;
        return montarWorkbook(modelo, { eventoNome, empresaNome: empresa?.nome || '' });
    }

    /** Participantes da empresa, só com as colunas do modelo (pode voltar pela importação). */
    async exportar(eventoId, empresaId) {
        const { modelo, eventoNome } = await this.obterModelo(eventoId);
        const empresa = await this._empresaDoEvento(eventoId, empresaId);
        const colunas = modelo.colunas.map(c => c.campo).join(', ');
        const { data, error } = await buscarTodos(
            supabase.from('pessoas').select(colunas)
                .eq('evento_id', eventoId).eq('empresa_id', empresaId)
                .order('nome_completo', { ascending: true })
        );
        if (error) throw error;
        return { workbook: montarWorkbook(modelo, { eventoNome, empresaNome: empresa.nome, linhas: data || [] }), empresa };
    }

    /**
     * Importa a planilha de uma empresa. Cada CPF:
     * - novo no evento: vira pré-cadastro da empresa (o participante completa pelo link);
     * - já desta empresa e ainda não concluído: os dados da planilha substituem os anteriores;
     * - já desta empresa e concluído pelo participante: só preenche o que estiver vazio (não desfaz correção);
     * - de outra empresa: erro na linha.
     * @returns {Promise<{ total, criados, atualizados, ignorados, erros: Array<{ linha, motivo }> }>}
     */
    async importar({ eventoId, empresaId, buffer, usuarioId }) {
        const { modelo } = await this.obterModelo(eventoId);
        const empresa = await this._empresaDoEvento(eventoId, empresaId);
        const { linhas, erros } = await lerPlanilha(buffer, modelo);
        return this.gravarLinhas({ eventoId, empresa, linhas, erros, usuarioId });
    }

    /**
     * Grava linhas já validadas (planilha ou inclusão no portal) com as regras de `importar`.
     * @param {{ eventoId, empresa: { id, nome, max_colaboradores }, linhas: Array<{ linha, dados }>, erros?: Array, usuarioId? }} p
     */
    async gravarLinhas({ eventoId, empresa, linhas, erros = [], usuarioId = null }) {
        const empresaId = empresa.id;

        // Quem já existe no evento com esses CPFs
        const existentes = new Map();
        const cpfs = linhas.map(l => l.dados.cpf);
        const colunasLidas = ['id', 'cpf', 'empresa_id', 'origem_cadastro', 'aceite_lgpd', 'created_by', ...CAMPOS_PESSOA.filter(c => c !== 'cpf')];
        for (let i = 0; i < cpfs.length; i += TAMANHO_LOTE) {
            const { data, error } = await supabase.from('pessoas').select([...new Set(colunasLidas)].join(', '))
                .eq('evento_id', eventoId).in('cpf', cpfs.slice(i, i + TAMANHO_LOTE));
            if (error) throw error;
            for (const p of data || []) existentes.set(p.cpf, p);
        }

        // Cota da empresa (0 = sem limite)
        let vagas = Infinity;
        if (empresa.max_colaboradores > 0) {
            const { count } = await supabase.from('pessoas').select('id', { count: 'exact', head: true })
                .eq('empresa_id', empresaId).eq('evento_id', eventoId);
            vagas = empresa.max_colaboradores - (count || 0);
        }

        const resultado = { total: linhas.length + erros.length, criados: 0, atualizados: 0, ignorados: 0, erros: [...erros] };

        for (const { linha, dados } of linhas) {
            const atual = existentes.get(dados.cpf);
            try {
                if (atual && atual.empresa_id !== empresaId) {
                    resultado.erros.push({ linha, motivo: 'CPF já cadastrado em outra empresa deste evento' });
                    continue;
                }

                if (atual) {
                    // Pré-cadastro pendente: a planilha manda. Concluído pelo participante: só completa o vazio.
                    const pendente = ehPreCadastroPendente(atual, empresaId);
                    const mudancas = {};
                    for (const [campo, valor] of Object.entries(dados)) {
                        if (campo === 'cpf' || valor === null || valor === undefined || valor === '') continue;
                        if (pendente ? atual[campo] !== valor : !atual[campo]) mudancas[campo] = valor;
                    }
                    if (!Object.keys(mudancas).length) { resultado.ignorados++; continue; }
                    const { error } = await supabase.from('pessoas')
                        .update({ ...mudancas, updated_at: new Date().toISOString() }).eq('id', atual.id);
                    if (error) throw error;
                    resultado.atualizados++;
                    continue;
                }

                if (vagas <= 0) {
                    resultado.erros.push({ linha, motivo: `Cota da empresa atingida (${empresa.max_colaboradores}). Aumente a cota para importar.` });
                    continue;
                }

                const { data: nova, error } = await supabase.from('pessoas').insert([{
                    ...dados,
                    nome_credencial: dados.nome_credencial || dados.nome_completo,
                    evento_id: eventoId,
                    empresa_id: empresaId,
                    status_acesso: 'pendente',
                    origem_cadastro: 'externo',
                    aceite_lgpd: false,
                    created_by: usuarioId || null
                }]).select('id').single();
                if (error) throw error;

                const pivo = await supabase.from('pessoa_evento_empresa').insert([{
                    pessoa_id: nova.id, empresa_id: empresaId, evento_id: eventoId,
                    status_aprovacao: 'pendente', cargo_funcao: dados.funcao || 'Participante'
                }]);
                if (pivo.error) logger.warn(`[Planilha] Vínculo da pessoa ${nova.id} não criado: ${pivo.error.message}`);

                vagas--;
                resultado.criados++;
            } catch (e) {
                const motivo = e.code === '23505' ? 'CPF já cadastrado neste evento' : (e.message || 'Erro ao gravar');
                resultado.erros.push({ linha, motivo });
            }
        }

        resultado.erros.sort((a, b) => a.linha - b.linha);
        logger.info(`[Planilha] Empresa ${empresa.nome}: ${resultado.criados} criados, ${resultado.atualizados} atualizados, ${resultado.ignorados} sem mudança, ${resultado.erros.length} com erro`);
        return resultado;
    }

    /**
     * Link público da empresa: dados que a empresa já mandou na planilha para este CPF, para o
     * participante conferir. Só pré-cadastro desta empresa ainda não concluído; nada além dos campos do modelo.
     * @returns {Promise<object|null>}
     */
    async buscarPreCadastro({ eventoId, empresaId, cpf }) {
        const digitos = String(cpf || '').replace(/\D/g, '');
        if (digitos.length !== 11) return null;
        const { data, error } = await supabase.from('pessoas')
            .select(`id, empresa_id, origem_cadastro, aceite_lgpd, created_by, ${CAMPOS_PESSOA.join(', ')}`)
            .eq('evento_id', eventoId).eq('cpf', digitos).maybeSingle();
        if (error) throw error;
        if (!ehPreCadastroPendente(data, empresaId)) return null;

        const { modelo } = await this.obterModelo(eventoId);
        const dados = {};
        for (const { campo } of modelo.colunas) {
            if (campo !== 'cpf' && data[campo]) dados[campo] = data[campo];
        }
        return dados;
    }
}

module.exports = new PlanilhaService();
module.exports.ehPreCadastroPendente = ehPreCadastroPendente;
