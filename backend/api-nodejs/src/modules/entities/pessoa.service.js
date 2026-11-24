const { supabase } = require('../../config/supabase');
const logger = require('../../services/logger');
const { caminhoDeStorage, BUCKETS_DOCUMENTO, BUCKETS_FOTO, fotoUrlAceitavel, arquivoUsadoPorOutraPessoa, formaCanonica } = require('../../services/storageSeguro');
const qrGenerator = require('../../utils/qrGenerator');
const syncService = require('../devices/sync.service');
const { v4: uuidv4 } = require('uuid');
const emailService = require('../../services/emailService');
const { buscarTodos, buscarPorIdsEmLotes } = require('../../utils/buscarTodos');

// ---------------------------------------------------------------------------
// Busca de pessoas por qualquer dado do cadastro (check-in, check-out, fiscalização, lista de pessoas)
// ---------------------------------------------------------------------------
const LIMITE_BUSCA = 200;
const CAMPOS_PESSOA_BUSCA = 'id, nome_completo, nome_credencial, cpf, email, telefone, documento, passaporte, funcao, tipo_pessoa, status_acesso, foto_url, qr_code, ativo, created_at, numero_pulseira';
// Banco sem alguma coluna opcional (passaporte etc.): a busca continua com o básico em vez de falhar
const CAMPOS_PESSOA_BASICOS = 'id, nome_completo, nome_credencial, cpf, email, funcao, status_acesso, foto_url, qr_code, ativo, created_at, numero_pulseira';
const CAMPOS_TEXTO = ['nome_completo', 'nome_credencial', 'email', 'funcao', 'tipo_pessoa', 'documento', 'passaporte', 'numero_pulseira'];
const CAMPOS_TEXTO_BASICOS = ['nome_completo', 'nome_credencial', 'email', 'funcao', 'numero_pulseira'];
const CAMPOS_NUMERO = ['cpf', 'telefone', 'documento', 'numero_pulseira'];
const CAMPOS_NUMERO_BASICOS = ['cpf', 'numero_pulseira'];

const normalizarTexto = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const soDigitos = (v) => String(v ?? '').replace(/\D/g, '');
const textoDaEmpresa = (e) => (e ? normalizarTexto(`${e.nome || ''} ${e.cnpj || ''}`) : '');

/** "  João  ELETRICISTA " → { tokens: ['joao', 'eletricista'], brutos: ['joão', 'eletricista'] }; menos de 2 letras = sem busca */
function prepararBusca(queryText) {
    const bruto = String(queryText ?? '').toLowerCase().trim();
    if (normalizarTexto(bruto).length < 2) return null;
    const brutos = bruto.split(/\s+/).filter(Boolean);
    const tokens = brutos.map(normalizarTexto);
    return tokens.length ? { tokens, brutos } : null;
}

// Tira o que quebra o filtro do PostgREST (vírgula, parênteses, aspas, curingas)
const seguroParaFiltro = (token) => token.replace(/[,()"'\\*%:]/g, '_');
/**
 * Padrão largo: vogais e "c" viram "_" (qualquer letra), então "joao" acha "JOÃO" e "acougue" acha "AÇOUGUE".
 * Traz candidatos a mais; a conferência exata (sem acento) é feita depois em pessoaAtendeBusca.
 */
const padraoLargo = (token) => token.replace(/[aeiouc]/g, '_').replace(/[^a-z0-9_@.-]/g, '_');
const MAX_CANDIDATOS_SEM_ACENTO = 2000;

function montarConsultaPessoas(client, campos, statusParam) {
    let q = client.from('pessoas').select(campos);
    if (statusParam) q = q.eq('status_acesso', String(statusParam).toLowerCase());
    return q;
}

async function buscarPessoasPorTexto(client, eventoId, busca, statusParam) {
    // O banco filtra pela palavra mais longa (a mais seletiva); as outras são conferidas em memória
    const i = busca.tokens.reduce((melhor, t, idx) => (t.length > busca.tokens[melhor].length ? idx : melhor), 0);
    const token = busca.tokens[i];
    const bruto = busca.brutos[i];
    const digitos = soDigitos(token);
    const soNumero = /^[\d.\-/()]+$/.test(token);

    const filtroExato = (camposTexto, camposNumero) => {
        const textos = [...new Set([seguroParaFiltro(bruto), seguroParaFiltro(token)])];
        const partes = camposTexto.flatMap(c => textos.map(t => `${c}.ilike.%${t}%`));
        if (soNumero && digitos.length >= 2) {
            // CPF gravado só com dígitos; telefone/documento podem ter pontuação: "%1%1%9%..." casa com "(11) 9..."
            partes.push(...camposNumero.map(c => `${c}.ilike.%${c === 'cpf' || c === 'numero_pulseira' ? digitos : digitos.split('').join('%')}%`));
        }
        return partes.join(',');
    };
    const filtroSemAcento = (camposTexto) => camposTexto.map(c => `${c}.ilike.%${padraoLargo(token)}%`).join(',');
    const base = (campos) => montarConsultaPessoas(client, campos, statusParam).eq('evento_id', eventoId);

    const consultar = async (campos, camposTexto, camposNumero) => {
        const tarefas = [buscarTodos(base(campos).or(filtroExato(camposTexto, camposNumero)), { paralelo: 2 })];
        // Só vale a consulta sem acento quando a palavra tem letra que pode ter acento
        if (!soNumero && /[aeiouc]/.test(token)) {
            tarefas.push(base(campos).or(filtroSemAcento(camposTexto)).order('id').limit(MAX_CANDIDATOS_SEM_ACENTO));
        }
        const respostas = await Promise.all(tarefas);
        const erro = respostas.find(r => r.error)?.error;
        return erro ? { data: null, error: erro } : { data: respostas.flatMap(r => r.data || []), error: null };
    };

    let { data, error } = await consultar(CAMPOS_PESSOA_BUSCA, CAMPOS_TEXTO, CAMPOS_NUMERO);
    if (error && (error.code === '42703' || /column|coluna/i.test(error.message || ''))) {
        logger.warn('[PessoaService.searchPessoas] coluna opcional ausente, buscando com os campos básicos', { code: error.code });
        ({ data, error } = await consultar(CAMPOS_PESSOA_BASICOS, CAMPOS_TEXTO_BASICOS, CAMPOS_NUMERO_BASICOS));
    }
    if (error) throw error;
    return data || [];
}

/** Cada palavra da busca precisa aparecer em algum dado da pessoa ou da empresa dela */
function pessoaAtendeBusca(pessoa, empresas, busca) {
    const texto = normalizarTexto([
        pessoa.nome_completo, pessoa.nome_credencial, pessoa.email, pessoa.funcao, pessoa.tipo_pessoa,
        pessoa.documento, pessoa.passaporte, pessoa.numero_pulseira, pessoa.cpf, pessoa.telefone,
        ...empresas.map(e => e && `${e.nome || ''} ${e.cnpj || ''}`)
    ].filter(Boolean).join(' | '));
    const numeros = [pessoa.cpf, pessoa.telefone, pessoa.documento, pessoa.numero_pulseira, ...empresas.map(e => e?.cnpj)]
        .map(soDigitos).filter(Boolean);
    return busca.tokens.every((t) => {
        if (texto.includes(t)) return true;
        const d = soDigitos(t);
        // "123.456.789-00" acha o CPF gravado só com dígitos (o token precisa ser só número e pontuação)
        return d.length >= 2 && /^[\d.\-/()]+$/.test(t) && numeros.some(n => n.includes(d));
    });
}


class PessoaService {

    /**
     * Sanitiza dados PII para consistência e segurança.
     * - Nomes: MAIÚSCULAS, sem espaços duplos, trimmed
     * - Emails: minúsculas, trimmed
     * - CPF: somente dígitos
     */
    sanitizePII(data) {
        const sanitized = { ...data };

        // Normalizar nomes para MAIÚSCULAS (crachás, dashboards)
        if (sanitized.nome_completo) {
            sanitized.nome_completo = sanitized.nome_completo.trim().replace(/\s+/g, ' ').toUpperCase();
        } else if (sanitized.nome) {
            // Fallback para quando o frontend envia 'nome'
            sanitized.nome_completo = sanitized.nome.trim().replace(/\s+/g, ' ').toUpperCase();
        }
        if (sanitized.nome_credencial) {
            sanitized.nome_credencial = sanitized.nome_credencial.trim().replace(/\s+/g, ' ').toUpperCase();
        }

        // Email sempre em lowercase
        if (sanitized.email) {
            sanitized.email = sanitized.email.trim().toLowerCase();
        }

        // CPF: somente dígitos
        if (sanitized.cpf) {
            sanitized.cpf = sanitized.cpf.replace(/[^\d]/g, '');
        }

        // Função/Cargo: capitalizada
        if (sanitized.funcao) {
            sanitized.funcao = sanitized.funcao.trim().replace(/\s+/g, ' ').toUpperCase();
        }

        return sanitized;
    }

    /**
     * Lista pessoas de um evento específico usando View Otimizada e Paginação.
     */
    async listByEvent(supabaseClient, eventoId, filters = {}) {
        const { page = 1, limit = 50, busca, empresa_id, since } = filters;
        const offset = (page - 1) * limit;

        // Usamos a View para trazer tudo em um único JOIN (O(1) no db)
        let query = supabaseClient
            .from('view_pessoas_listagem')
            .select('*', { count: 'exact' })
            .eq('evento_id', eventoId)
            .order('nome', { ascending: true });

        // Se houver paginação e busca, aplicamos range. 
        // OBS: Para Sync Mobile (delta), geralmente pullamos tudo que mudou, 
        // mas limitamos pra evitar estouro de memória no app.
        if (!since) {
            query = query.range(offset, offset + limit - 1);
        }

        // Mapeamento de grupos de status para as abas do painel de pessoas
        const STATUS_GROUPS = {
            ativos:    ['autorizado', 'checkin_feito', 'checkout_feito'],
            pendentes: ['pendente', 'verificacao'],
            bloqueados: ['bloqueado', 'expulso']
        };

        // Filtros Adicionais
        if (filters.status) {
            const statusKey = filters.status.toLowerCase();
            const group = STATUS_GROUPS[statusKey];
            if (group) {
                query = query.in('status_acesso', group);
            } else {
                query = query.eq('status_acesso', statusKey);
            }
        }
        if (busca) {
            query = query.or(`nome.ilike.%${busca}%,cpf.ilike.%${busca}%,email.ilike.%${busca}%`);
        }
        if (empresa_id) {
            query = query.eq('empresa_id', empresa_id);
        }
        if (since) {
             query = query.or(`updated_at.gte.${since},pivot_updated_at.gte.${since}`);
        }

        let { data, count, error } = await query;

        // --- FALLBACK ESTRATÉGICO: Se a View falhar, tentamos a tabela base ---
        if (error) {
            logger.error(`[PessoaService.listByEvent] View falhou (provável schema drift), tentando fallback para tabela 'pessoas':`, error);

            let fallbackQuery = supabaseClient
                .from('pessoas')
                .select('id, nome_completo, cpf, email, status_acesso, created_at, empresa_id', { count: 'exact' })
                .eq('evento_id', eventoId)
                .order('nome_completo', { ascending: true });

            if (!since) {
                fallbackQuery = fallbackQuery.range(offset, offset + limit - 1);
            }
            if (filters.status) {
                const statusKey = filters.status.toLowerCase();
                const group = STATUS_GROUPS[statusKey];
                if (group) {
                    fallbackQuery = fallbackQuery.in('status_acesso', group);
                } else {
                    fallbackQuery = fallbackQuery.eq('status_acesso', statusKey);
                }
            }
            if (busca) {
                fallbackQuery = fallbackQuery.or(`nome_completo.ilike.%${busca}%,cpf.ilike.%${busca}%,email.ilike.%${busca}%`);
            }

            const fb = await fallbackQuery;
            if (fb.error) {
                logger.error(`[PessoaService.listByEvent] Fallback também falhou:`, fb.error);
                throw fb.error;
            }
            
            data = fb.data?.map(p => ({ ...p, nome: p.nome_completo })) || [];
            count = fb.count;
            error = null;
        }

        return {
            data: data || [],
            total: count || 0,
            page: parseInt(page),
            limit: parseInt(limit),
            pages: Math.ceil((count || 0) / limit)
        };
    }

    /**
     * Busca pessoas com filtros por nome, CPF ou empresa
     */
    async searchPessoas(supabaseClient, eventoId, queryText, empresaId, statusParam = null) {
        const busca = prepararBusca(queryText);

        // Passo 1: vínculos do evento (todas as páginas: o Supabase corta em 1000 sem avisar)
        let pivotQuery = supabaseClient.from('pessoa_evento_empresa')
            .select('id, pessoa_id, empresa_id, status_aprovacao')
            .eq('evento_id', eventoId);
        if (empresaId) pivotQuery = pivotQuery.eq('empresa_id', empresaId);
        const { data: pivots, error: pError } = await buscarTodos(pivotQuery);
        if (pError) throw pError;
        if (!pivots || pivots.length === 0) return [];

        const pivotsPorPessoa = new Map();
        for (const p of pivots) {
            if (!pivotsPorPessoa.has(p.pessoa_id)) pivotsPorPessoa.set(p.pessoa_id, []);
            pivotsPorPessoa.get(p.pessoa_id).push(p);
        }

        // Passo 2: empresas do evento (nome/CNPJ também são buscáveis)
        const eIds = [...new Set(pivots.map(p => p.empresa_id).filter(Boolean))];
        const { data: empresas } = eIds.length
            ? await buscarPorIdsEmLotes(eIds, (lote) => supabaseClient.from('empresas').select('id, nome, cnpj').in('id', lote))
            : { data: [] };
        const empMap = new Map((empresas || []).map(e => [e.id, e]));

        // Passo 3: pessoas candidatas
        let candidatas;
        if (!busca) {
            // Sem texto: as pessoas dos vínculos (ex.: filtro só por empresa)
            const { data, error } = await buscarPorIdsEmLotes([...pivotsPorPessoa.keys()].slice(0, LIMITE_BUSCA),
                (lote) => montarConsultaPessoas(supabaseClient, CAMPOS_PESSOA_BUSCA, statusParam).in('id', lote));
            if (error) throw error;
            candidatas = data || [];
        } else {
            // a) Pelo texto em qualquer campo do cadastro (filtro largo no banco, conferência exata abaixo)
            const porTexto = await buscarPessoasPorTexto(supabaseClient, eventoId, busca, statusParam);

            // b) Pela empresa: digitar o nome da empresa traz todos os funcionários dela
            const empresasQueBatem = new Set((empresas || [])
                .filter(e => busca.tokens.some(t => normalizarTexto(`${e.nome || ''} ${e.cnpj || ''}`).includes(t)
                    || (soDigitos(t) && soDigitos(e.cnpj).includes(soDigitos(t)))))
                .map(e => e.id));
            const jaTemos = new Set(porTexto.map(p => p.id));
            const idsDaEmpresa = empresasQueBatem.size
                ? pivots.filter(p => empresasQueBatem.has(p.empresa_id) && !jaTemos.has(p.pessoa_id)).map(p => p.pessoa_id)
                : [];
            let porEmpresa = [];
            if (idsDaEmpresa.length) {
                const { data, error } = await buscarPorIdsEmLotes(idsDaEmpresa.slice(0, 1000),
                    (lote) => montarConsultaPessoas(supabaseClient, CAMPOS_PESSOA_BUSCA, statusParam).in('id', lote));
                if (error) throw error;
                porEmpresa = data || [];
            }
            candidatas = [...porTexto, ...porEmpresa];
        }

        // Passo 4: só quem é do evento; com várias palavras, TODAS precisam aparecer (ex.: "eletricista dakota")
        const vistos = new Set();
        const resultado = [];
        for (const pessoa of candidatas) {
            if (vistos.has(pessoa.id) || !pivotsPorPessoa.has(pessoa.id)) continue;
            const vinculos = pivotsPorPessoa.get(pessoa.id);
            // Com mais de um vínculo, prefere a empresa que bate com a busca
            const vinculo = (busca && vinculos.find(v => textoDaEmpresa(empMap.get(v.empresa_id)) &&
                busca.tokens.some(t => textoDaEmpresa(empMap.get(v.empresa_id)).includes(t)))) || vinculos[0];
            if (busca && !pessoaAtendeBusca(pessoa, vinculos.map(v => empMap.get(v.empresa_id)), busca)) continue;
            vistos.add(pessoa.id);
            resultado.push({ pessoa, vinculo });
        }

        // Ordem alfabética (ignora acentos e maiúsculas), depois limita
        resultado.sort((a, b) => String(a.pessoa.nome_completo || '').localeCompare(String(b.pessoa.nome_completo || ''), 'pt-BR', { sensitivity: 'base' }));
        const finais = resultado.slice(0, LIMITE_BUSCA);
        if (!finais.length) return [];

        // Passo 5: áreas autorizadas só de quem vai na resposta
        const { data: areas } = await buscarPorIdsEmLotes(finais.map(r => r.pessoa.id), (lote) =>
            supabaseClient.from('pessoa_areas_acesso').select('pessoa_id, area_id').in('pessoa_id', lote).eq('evento_id', eventoId));
        const areasMap = (areas || []).reduce((acc, a) => {
            (acc[a.pessoa_id] = acc[a.pessoa_id] || []).push(a.area_id);
            return acc;
        }, {});

        return finais.map(({ pessoa, vinculo }) => {
            const empresa = empMap.get(vinculo.empresa_id);
            return {
                ...pessoa,
                nome: pessoa.nome_completo,
                status: pessoa.status_acesso,
                empresa_nome: empresa?.nome || null,
                empresas: empresa ? { id: empresa.id, nome: empresa.nome } : { nome: 'Sem Empresa' },
                vinculo_id: vinculo.id,
                status_pivot: vinculo.status_aprovacao,
                areas_autorizadas: areasMap[pessoa.id] || []
            };
        });
    }

    /**
     * Cria uma nova pessoa, gera QR Code, valida limites da empresa e insere pivot
     */
    async createPessoa(supabaseClient, pessoaData, originUser = null) {
        // --- SANITIZAÇÃO PII (Hardening) ---
        const sanitized = this.sanitizePII(pessoaData);
        
        // 🛡️ Descartamos explicitamente 'empresa_direta_id' (campo órfão do frontend sem coluna no DB)
        // para evitar o erro de schema cache (PGRST204) na hora do spread.
        const { 
            empresa_id, 
            cpf, 
            nome_credencial, 
            nome_completo, 
            parecer_documentos,
            empresa_direta_id, 
            ...otherData 
        } = sanitized;

        // 🛡️ WHITELIST: filtrar campos extras vindos do frontend
        const ALLOWED_INSERT = new Set([
            'email', 'funcao', 'tipo_pessoa', 'nome_mae', 'data_nascimento',
            'telefone', 'documento', 'dias_trabalho', 'dias_acesso', 'foto_url', 'face_encoding',
            'numero_pulseira', 'tipo_fluxo', 'fase_montagem', 'fase_showday',
            'fase_desmontagem', 'observacao', 'nome_credencial', 'passaporte',
            'trabalho_area_tecnica', 'trabalho_altura', 'pagamento_validado',
            'aceite_lgpd', 'parecer_documentos'
        ]);
        const safeOtherData = Object.fromEntries(
            Object.entries(otherData).filter(([key]) => ALLOWED_INSERT.has(key))
        );
        this.validarFotoUrl(safeOtherData.foto_url);
        // Foto nova do storage gravada na forma canônica (URL pública, sem query)
        if (safeOtherData.foto_url) safeOtherData.foto_url = formaCanonica(safeOtherData.foto_url);

        if (!nome_completo || !empresa_id) {
            throw new Error('Nome Completo e Empresa são obrigatórios.');
        }

        const cpfLimpo = cpf || null;

        // VERIFICAÇÃO DE BLOQUEIO GLOBAL NA WATCHLIST (MULTI-EVENTO)
        if (cpfLimpo) {
            const { data: bloqueioAtivo } = await supabaseClient
                .from('watchlist')
                .select('*')
                .eq('cpf', cpfLimpo)
                .eq('ativo', true)
                .limit(1);

            if (bloqueioAtivo && bloqueioAtivo.length > 0) {
                throw new Error(`Cadastro Negado: CPF [${cpfLimpo}] possui BLOQUEIO ATIVO em todos os eventos da organização (Motivo: ${bloqueioAtivo[0].motivo || 'Restrição de Segurança na Watchlist'}).`);
            }
        }

        // 1. Verificar limite da empresa e evento
        const { data: empresa, error: empError } = await supabaseClient
            .from('empresas')
            .select('max_colaboradores, evento_id')
            .eq('id', empresa_id)
            .single();

        if (empError) throw empError;

        const { count, error: countError } = await supabaseClient
            .from('pessoa_evento_empresa')
            .select('*', { count: 'exact', head: true })
            .eq('empresa_id', empresa_id)
            .eq('evento_id', empresa.evento_id);

        if (countError) throw countError;

        if (empresa.max_colaboradores > 0 && (count || 0) >= empresa.max_colaboradores) {
            throw new Error(`Limite de participantes atingido para esta empresa (${empresa.max_colaboradores}).`);
        }

        // 1.1 Validar Cotas Diárias (Se houver dias_trabalho no payload)
        const diasTrabalho = otherData.dias_trabalho || [];
        if (diasTrabalho.length > 0) {
            // Buscar todas as quotas da empresa para este evento
            const { data: quotasAtivas } = await supabaseClient
                .from('quotas_diarias')
                .select('*')
                .eq('empresa_id', empresa_id)
                .eq('evento_id', empresa.evento_id);

            if (quotasAtivas && quotasAtivas.length > 0) {
                for (const dia of diasTrabalho) {
                    const quotaDia = quotasAtivas.find(q => q.data === dia);
                    if (quotaDia && quotaDia.quota > 0) {
                        // Contar pessoas já cadastradas para este dia específico
                        // Usamos a sintaxe de filtro JSON do Supabase/Postgres
                        const { count: countDia, error: countDiaErr } = await supabaseClient
                            .from('pessoas')
                            .select('*', { count: 'exact', head: true })
                            .eq('empresa_id', empresa_id)
                            .eq('evento_id', empresa.evento_id)
                            .contains('dias_trabalho', [dia]);

                        if (countDiaErr) throw countDiaErr;

                        if ((countDia || 0) >= quotaDia.quota) {
                            throw new Error(`Cota diária excedida para o dia ${dia}. Limite: ${quotaDia.quota}. Já cadastrados: ${countDia}`);
                        }
                    }
                }
            }
        }

        // 2. QR Code NÃO é gerado aqui - apenas após aprovação
        // O QR Code será gerado no endpoint POST /:id/approve
        let qrCode = null;

        // 3. Determinar Status Inicial e Geração de Token de Convite
        const origenCadastroStr = originUser ? 'interno' : 'externo';
        let statusAcesso = 'pendente'; 
        let registrationToken = null;
        let registrationTokenExpiresAt = null;

        if (origenCadastroStr === 'interno') {
            if (parecer_documentos === 'completo') {
                statusAcesso = 'autorizado';
            } else if (parecer_documentos === 'incorreto') {
                statusAcesso = 'recusado';
            }

            // Se for Cadastro via Empresa, geramos o token de convite para complementação
            if (originUser && originUser.nivel_acesso === 'empresa' && sanitized.email) {
                registrationToken = uuidv4();
                registrationTokenExpiresAt = new Date();
                registrationTokenExpiresAt.setDate(registrationTokenExpiresAt.getDate() + 7); // 7 dias
                statusAcesso = 'pendente'; // Força pendente para convites
            }
        }

        // 4. Inserção na Tabela Pessoas (sem QR Code - será gerado após aprovação)
        const { data: newPessoa, error: insertError } = await supabaseClient
            .from('pessoas')
            .insert([{
                ...safeOtherData,
                nome_completo: nome_completo,
                nome_credencial: nome_credencial || nome_completo,
                cpf: cpfLimpo,
                empresa_id,
                evento_id: empresa.evento_id,
                qr_code: qrCode,  // null inicialmente - gerado após aprovação
                status_acesso: statusAcesso,
                // Cadastro pelo operador não exige documento no sistema (conferido no atendimento)
                ...(origenCadastroStr === 'interno' ? { status_documentos: 'aprovado' } : {}),
                origem_cadastro: origenCadastroStr,
                registration_token: registrationToken,
                registration_token_expires_at: registrationTokenExpiresAt,
                created_by: originUser?.id
            }])
            .select()
            .single();

        if (insertError) throw insertError;

        // 5. Inserção na Pivot Table N:N
        const { error: pivotErr } = await supabaseClient.from('pessoa_evento_empresa').insert([{
            pessoa_id: newPessoa.id,
            empresa_id: empresa_id,
            evento_id: empresa.evento_id,
            status_aprovacao: originUser ? 'aprovado' : 'pendente',
            cargo_funcao: otherData.funcao || 'Participante'
        }]);

        if (pivotErr) {
            logger.error('Erro ao salvar vinculo Pivot de pessoa', pivotErr);
        }

        // 6. Disparar E-mail de Convite se houver token
        if (registrationToken && sanitized.email) {
            const { data: empresaData } = await supabaseClient
                .from('empresas')
                .select('nome')
                .eq('id', empresa_id)
                .single();
            
            const portalUrl = process.env.PUBLIC_PORTAL_URL || 'https://cadastro.nzt.app.br';
            const inviteLink = `${portalUrl}/register/${registrationToken}`;
            
            emailService.sendEmployeeInvite(
                sanitized.email,
                nome_completo,
                empresaData?.nome || 'Sua Empresa',
                inviteLink
            ).catch(err => logger.error('Falha ao enviar e-mail de convite na criação:', err));
        }

        return {
            pessoa: newPessoa,
            message: 'Pessoa criada. Aguarde aprovação para gerar QR Code.'
        };
    }

    /**
     * Alterna o estado de bloqueio de uma pessoa e sincroniza com terminais
     */
    async toggleBlock(supabaseClient, id, isBlocking, motivo, operatorId, tenantId) {
        if (isBlocking && !motivo) {
            throw new Error('Justificativa de bloqueio é obrigatória.');
        }

        const updateData = {
            bloqueado: !!isBlocking,
            motivo_bloqueio: isBlocking ? (motivo || null) : null,
            status_acesso: isBlocking ? 'bloqueado' : 'autorizado',
            updated_at: new Date()
        };

        const { data, error } = await supabaseClient
            .from('pessoas')
            .update(updateData)
            .eq('id', id)
            .eq('evento_id', tenantId)
            .select()
            .single();

        if (error) throw error;

        logger.info(`🚫 Pessoa [${id}] ${isBlocking ? 'BLOQUEADA' : 'DESBLOQUEADA'} por ${operatorId}. Motivo: ${motivo}`);

        // Notificar painéis em tempo real
        try {
            const websocketService = require('../../services/websocketService');
            websocketService.emit('pessoa_status_alterado', {
                pessoa_id: id,
                bloqueado: !!isBlocking,
                status_acesso: updateData.status_acesso,
                motivo: motivo,
                operador: operatorId
            }, tenantId);
        } catch (_) {}

        // Sincronização Assíncrona com Hardware
        if (isBlocking) {
            syncService.deleteUserFromAllDevices(id, data.evento_id)
                .catch(e => logger.error(`[AutoDelete] Erro no Bloqueio via Service:`, e));
        } else if (data.foto_url) {
            syncService.syncUserToAllDevices(data)
                .catch(e => logger.error(`[AutoDelete] Erro Re-sync via Service:`, e));
        }

        return data;
    }

    async getById(supabaseClient, id, tenantId) {
        const { data: pessoa, error } = await supabaseClient
            .from('pessoas')
            .select('*')
            .eq('id', id)
            .eq('evento_id', tenantId)
            .single();

        if (error || !pessoa) throw new Error('Pessoa não encontrada ou acesso negado.');

        // Buscar empresa, áreas de acesso e último check-in
        const [empresaRes, paaRes, papRes, checkinRes] = await Promise.all([
            supabaseClient
                .from('empresas')
                .select('nome')
                .eq('id', pessoa.empresa_id)
                .maybeSingle(),
            supabaseClient
                .from('pessoa_areas_acesso')
                .select('area_id, evento_areas(id, nome_area)')
                .eq('pessoa_id', id),
            pessoa.tipo_pulseira_id
                ? supabaseClient
                    .from('pulseira_areas_permitidas')
                    .select('area_id, evento_areas(id, nome_area)')
                    .eq('tipo_pulseira_id', pessoa.tipo_pulseira_id)
                : Promise.resolve({ data: [] }),
            supabaseClient
                .from('logs_acesso')
                .select('created_at, area_id, metodo, evento_areas(nome_area)')
                .eq('pessoa_id', id)
                .in('tipo', ['checkin', 'entrada'])
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle()
        ]);

        const areasMap = new Map();
        (paaRes.data || []).forEach(item => {
            if (item.area_id) {
                areasMap.set(item.area_id, item.evento_areas?.nome_area || 'Área');
            }
        });
        (papRes.data || []).forEach(item => {
            if (item.area_id) {
                areasMap.set(item.area_id, item.evento_areas?.nome_area || 'Área');
            }
        });

        const areasAutorizadas = Array.from(areasMap.entries()).map(([areaId, nome]) => ({ id: areaId, nome_area: nome }));
        const ultimoCheckin = checkinRes.data;

        return {
            ...pessoa,
            empresas: empresaRes.data || { nome: 'Sem Empresa' },
            empresa_nome: empresaRes.data?.nome || 'Sem Empresa',
            areas_autorizadas: areasAutorizadas,
            horario_checkin: ultimoCheckin?.created_at || null,
            area_checkin: ultimoCheckin?.evento_areas?.nome_area || null,
            metodo_checkin: ultimoCheckin?.metodo || null
        };
    }

    /**
     * foto_url vinda do cliente: vazio, data URI de imagem, ou arquivo do storage deste projeto em
     * bucket de foto (selfies, avatars, fotos-perfil). Outro endereço → 400.
     */
    validarFotoUrl(fotoUrl) {
        if (!fotoUrlAceitavel(fotoUrl)) {
            throw Object.assign(new Error('Foto inválida: envie a foto pelo próprio sistema (upload de selfie).'), { status: 400 });
        }
    }

    async update(supabaseClient, id, updateData, tenantId) {
        // --- SANITIZAÇÃO PII ---
        const sanitizedData = this.sanitizePII(updateData);

        // 🛡️ WHITELIST: Apenas colunas que existem na tabela pessoas.
        // O frontend envia o objeto completo da view (com joins como empresa_nome,
        // empresas, etc). Filtramos aqui para evitar erro PGRST204.
        const ALLOWED_COLUMNS = new Set([
            'nome_completo', 'cpf', 'email', 'funcao', 'tipo_pessoa',
            'nome_mae', 'data_nascimento', 'telefone', 'documento',
            'dias_trabalho', 'dias_acesso', 'foto_url', 'face_encoding', 'qr_code',
            'numero_pulseira', 'tipo_fluxo', 'fase_montagem',
            'fase_showday', 'fase_desmontagem', 'bloqueado',
            'motivo_bloqueio', 'observacao', 'ativo', 'nome_credencial',
            'passaporte', 'trabalho_area_tecnica', 'trabalho_altura',
            'pagamento_validado', 'aceite_lgpd', 'parecer_documentos'
            // Campos imunes a update rápido (gerenciados pelo sistema):
            // id, evento_id, empresa_id, status_acesso, origem_cadastro,
            // created_by, created_at, updated_at, atualizado_em
        ]);

        const safeData = Object.fromEntries(
            Object.entries(sanitizedData).filter(([key]) => ALLOWED_COLUMNS.has(key))
        );

        if (Object.keys(safeData).length === 0) {
            throw new Error('Nenhum campo válido para atualizar.');
        }
        // O painel reenvia o objeto inteiro: foto igual à gravada (inclusive endereço antigo) passa;
        // só a foto nova é validada
        if (safeData.foto_url !== undefined) {
            const { data: atual } = await supabaseClient
                .from('pessoas')
                .select('foto_url')
                .eq('id', id)
                .eq('evento_id', tenantId)
                .maybeSingle();
            if (!atual || safeData.foto_url !== atual.foto_url) {
                this.validarFotoUrl(safeData.foto_url);
                // Foto nova do storage gravada na forma canônica (URL pública, sem query)
                safeData.foto_url = formaCanonica(safeData.foto_url);
            }
        }

        const { data, error } = await supabaseClient
            .from('pessoas')
            .update({ ...safeData, atualizado_em: new Date() })
            .eq('id', id)
            .eq('evento_id', tenantId)
            .select()
            .single();

        if (error) throw error;

        // Sincronizar com hardwares caso dados biométricos tenham mudado
        if (safeData.foto_url || safeData.cpf || safeData.nome_completo) {
            syncService.syncUserToAllDevices(data)
                .catch(e => logger.error(`[AutoSync] Erro Re-sync via Service após update:`, e));
        }

        return data;
    }

    async delete(supabaseClient, id, tenantId) {
        const { deleteImage } = require('../../config/supabase');

        // 1. Buscar dados necessários para cleanup ANTES de deletar
        const { data: pessoa, error: getErr } = await supabaseClient
            .from('pessoas')
            .select('id, cpf, nome_completo, evento_id, foto_url, documento_foto, face_encoding')
            .eq('id', id)
            .eq('evento_id', tenantId)
            .single();
        if (getErr) throw new Error('Pessoa não encontrada ou você não tem permissão para removê-la.');

        // 1.1 Limpeza de Documentos (PDF/Arquivos) no Storage
        try {
            const { data: docs } = await supabaseClient
                .from('pessoa_documentos')
                .select('url_arquivo')
                .eq('pessoa_id', id);

            if (docs && docs.length > 0) {
                for (const doc of docs) {
                    const ref = caminhoDeStorage(doc.url_arquivo, { buckets: BUCKETS_DOCUMENTO });
                    if (ref) await deleteImage(ref.bucket, ref.path);
                }
                // Limpar registros do DB
                await supabaseClient.from('pessoa_documentos').delete().eq('pessoa_id', id);
                logger.info(`🗑️ Documents associated with person ${id} removed from Storage and DB`);
            }
        } catch (docErr) {
            logger.error(`[LGPD] Error cleaning documents for person ${id}:`, docErr);
        }

        // 2. LGPD: Apagar do Storage a foto biométrica e a foto do documento.
        // Se outro cadastro usa o mesmo arquivo, ele fica (a linha desta pessoa é excluída de qualquer forma).
        const arquivos = [
            { valor: pessoa.foto_url, buckets: BUCKETS_FOTO, nome: 'Foto biométrica' },
            { valor: pessoa.documento_foto, buckets: [...BUCKETS_FOTO, ...BUCKETS_DOCUMENTO], nome: 'Foto do documento' }
        ];
        for (const arq of arquivos) {
            if (!arq.valor) continue;
            try {
                // Caminho do Storage a partir da URL (public, sign ou authenticated); ex.: "selfies/event_xxx/cpf_123.jpg"
                const ref = caminhoDeStorage(arq.valor, { buckets: arq.buckets });
                if (!ref) continue;
                if (await arquivoUsadoPorOutraPessoa(arq.valor, id)) {
                    logger.warn(`[LGPD] ${arq.nome} da pessoa ${id} é usada por outro cadastro; arquivo mantido no Storage`);
                    continue;
                }
                await deleteImage(ref.bucket, ref.path);
                logger.info(`🗑️ [LGPD] ${arq.nome} removida do Storage para pessoa ${id}`);
            } catch (storageErr) {
                logger.error(`[LGPD] Falha ao remover ${arq.nome.toLowerCase()} do Storage para ${id}:`, storageErr);
                // Continua a deleção mesmo se o Storage falhar
            }
        }

        // 3. Deletar pivot N:N primeiro (integridade referencial)
        await supabaseClient.from('pessoa_evento_empresa').delete().eq('pessoa_id', id);

        // 4. Deletar registro principal
        const { error } = await supabaseClient.from('pessoas').delete().eq('id', id);
        if (error) throw error;

        // 5. Cleanup nos terminais de hardware (Intelbras/Hikvision)
        // Passa o objeto (com CPF): o registro já foi apagado do banco
        syncService.deleteUserFromAllDevices(pessoa, pessoa.evento_id)
            .catch(e => logger.error(`[DeleteService] Falha ao remover do terminal:`, e));

        logger.info(`🗑️ [LGPD] Pessoa ${id} completamente removida (DB + Storage + Terminais)`);
        return true;
    }

    /**
     * Recupera ou Gera um QR Code para o participante APROVADO
     * QR Code só é gerado para pessoas com status_aprovacao = 'aprovado'
     */
    async generateQRCode(supabaseClient, id, tenantId) {
        // Buscar pessoa com status da pivot
        const { data: pessoa, error } = await supabaseClient
            .from('pessoas')
            .select('id, cpf, qr_code, evento_id, status_acesso, ativo, bloqueado')
            .eq('id', id)
            .eq('evento_id', tenantId)
            .single();

        if (error || !pessoa) throw new Error('Pessoa não encontrada ou acesso negado.');

        // Verificar se está ativa
        if (pessoa.ativo === false) {
            throw new Error('Pessoa inativa. Não é possível gerar QR code.');
        }

        // Verificar se está bloqueada
        if (pessoa.bloqueado === true) {
            throw new Error('Pessoa bloqueada. Não é possível gerar QR code.');
        }

        // Aprovação: status de acesso autorizado OU vínculo aprovado na pivot
        let aprovada = pessoa.status_acesso === 'autorizado';

        if (!aprovada) {
            const { data: pivot } = await supabaseClient
                .from('pessoa_evento_empresa')
                .select('status_aprovacao')
                .eq('pessoa_id', id)
                .eq('evento_id', tenantId)
                .in('status_aprovacao', ['aprovado'])
                .limit(1)
                .maybeSingle();

            aprovada = !!(pivot && pivot.status_aprovacao === 'aprovado');
        }

        if (!aprovada) {
            if (pessoa.status_acesso !== 'autorizado' && pessoa.status_acesso !== 'pendente') {
                throw new Error('Pessoa não está autorizada. Status: ' + pessoa.status_acesso);
            }
            throw new Error('Pessoa pendente de aprovação. Aguarde a confirmação.');
        }

        // Se já tem um código, retorna. Se não tem, gera novo.
        const qrSource = pessoa.qr_code || pessoa.cpf || pessoa.id;
        const qrData = await qrGenerator.generate(qrSource);

        // Se a pessoa não tinha qr_code, salva o novo código gerado
        if (!pessoa.qr_code) {
            await supabaseClient.from('pessoas').update({ qr_code: qrData.code }).eq('id', id);
        }

        return qrData;
    }
}

module.exports = new PessoaService();
