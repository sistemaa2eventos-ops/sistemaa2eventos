import React, { useCallback, useEffect, useState } from 'react';
import { Box, Button, CircularProgress, Grid, Stack, Typography } from '@mui/material';
import {
    ChevronRight as AbrirIcon, ContentCopy as CopiarIcon, ErrorOutline as AcaoIcon,
    TaskAlt as TudoCertoIcon, WhatsApp as WhatsAppIcon
} from '@mui/icons-material';
import { useNavigate } from 'react-router-dom';
import { useSnackbar } from 'notistack';
import api, { dadosDe, erroDe } from '../services/api';
import PageHeader from '../components/common/PageHeader';
import GlassCard from '../components/common/GlassCard';
import ChecklistObrigatorios from '../components/ChecklistObrigatorios';
import { METRICAS, PRONTIDAO, SITUACAO_OBRIGATORIO, dataBr, dataHora, motivosAcao, prontidao } from '../util';
import { botaoSecundario, cores, fontes, raios, tom } from '../styles/tokens';

/** Indicadores de movimento de hoje (a prontidão fica na barra do topo). */
const MOVIMENTO = ['checkin', 'dentro', 'checkout', 'pulseira'];
const MAX_ACOES = 6;

const Titulo = ({ children, sx }) => (
    <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1, ...sx }}>{children}</Typography>
);

const Cartao = ({ valor, rotulo, cor, onClick }) => (
    <Box component="button" type="button" onClick={onClick}
        sx={{
            width: '100%', height: '100%', textAlign: 'left', cursor: 'pointer', p: 2, borderRadius: raios.cartao, font: 'inherit', color: 'inherit',
            border: `1px solid ${cores.borda}`, bgcolor: cores.superficie, '&:hover': { borderColor: cores.primaria },
            '&:focus-visible': { outline: `2px solid ${cores.primaria}`, outlineOffset: 2 }
        }}>
        <Typography sx={{ color: cor, fontWeight: 700, fontSize: '1.75rem', lineHeight: 1.1 }}>{valor}</Typography>
        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{rotulo}</Typography>
    </Box>
);

/** Barra de prontidão: quantos da equipe já podem entrar, quantos aguardam a organização e quantos dependem da empresa. */
const BarraProntidao = ({ participantes, onFiltrar }) => {
    const total = participantes.length;
    const contagem = { liberado: 0, analise: 0, acao: 0 };
    participantes.forEach(p => { contagem[prontidao(p)] += 1; });
    const pct = total ? Math.round((contagem.liberado / total) * 100) : 0;
    const filtroDe = { liberado: 'liberados', analise: 'analise', acao: 'acao' };

    return (
        <GlassCard sx={{ p: { xs: 2, md: 3 }, mb: 3 }}>
            {total === 0 ? (
                <>
                    <Titulo>Prontidão da equipe</Titulo>
                    <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                        Ninguém cadastrado ainda. Envie o link de cadastro abaixo ou inclua a equipe em Participantes.
                    </Typography>
                </>
            ) : (
                <>
                    <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ sm: 'baseline' }} spacing={0.5} sx={{ mb: 1.5 }}>
                        <Typography sx={{ fontFamily: fontes.titulo, fontWeight: 700, fontSize: { xs: '1.15rem', md: '1.35rem' }, color: cores.textoForte }}>
                            {pct === 100 ? 'Equipe toda liberada para o evento' : `${pct}% da equipe liberada para o evento`}
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                            {contagem.liberado} de {total} {total === 1 ? 'pessoa' : 'pessoas'}
                        </Typography>
                    </Stack>

                    <Box role="img" aria-label={`${contagem.liberado} liberados, ${contagem.analise} em análise, ${contagem.acao} precisam de ação`}
                        sx={{ display: 'flex', height: 10, borderRadius: raios.pilula, overflow: 'hidden', bgcolor: tom(cores.textoSecundario, 0.15), mb: 2 }}>
                        {['liberado', 'analise', 'acao'].map(k => contagem[k] > 0 && (
                            <Box key={k} sx={{ width: `${(contagem[k] / total) * 100}%`, bgcolor: PRONTIDAO[k].cor }} />
                        ))}
                    </Box>

                    <Grid container spacing={1.5}>
                        {['liberado', 'analise', 'acao'].map(k => (
                            <Grid item xs={12} sm={4} key={k}>
                                <Box component="button" type="button" onClick={() => onFiltrar(filtroDe[k])}
                                    sx={{
                                        width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, p: 1.5, cursor: 'pointer', textAlign: 'left',
                                        font: 'inherit', color: 'inherit', borderRadius: raios.controle,
                                        border: `1px solid ${tom(PRONTIDAO[k].cor, 0.35)}`, bgcolor: tom(PRONTIDAO[k].cor, 0.08),
                                        '&:hover': { bgcolor: tom(PRONTIDAO[k].cor, 0.16) },
                                        '&:focus-visible': { outline: `2px solid ${cores.primaria}`, outlineOffset: 2 }
                                    }}>
                                    <Typography sx={{ color: PRONTIDAO[k].cor, fontWeight: 700, fontSize: '1.5rem', lineHeight: 1, minWidth: 32 }}>{contagem[k]}</Typography>
                                    <Box sx={{ minWidth: 0 }}>
                                        <Typography variant="body2" sx={{ color: cores.textoForte, fontWeight: 700 }}>{PRONTIDAO[k].rotulo}</Typography>
                                        <Typography variant="caption" sx={{ color: cores.textoSecundario }}>{PRONTIDAO[k].descricao}</Typography>
                                    </Box>
                                </Box>
                            </Grid>
                        ))}
                    </Grid>
                </>
            )}
        </GlassCard>
    );
};

/** O que impede a liberação e depende da empresa: participantes com pendência e documentos da própria empresa. */
const AcoesPendentes = ({ participantes, docsEmpresa, navigate }) => {
    const pessoas = participantes.filter(p => prontidao(p) === 'acao');
    const docs = (docsEmpresa || []).filter(o => o.situacao !== 'ok' && o.situacao !== 'em_analise');
    const total = pessoas.length + docs.length;

    const Linha = ({ titulo, detalhe, cor, onClick }) => (
        <Box component="button" type="button" onClick={onClick}
            sx={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 1.5, py: 1.25, px: 1.5, cursor: 'pointer', textAlign: 'left',
                font: 'inherit', color: 'inherit', bgcolor: 'transparent', border: 'none', borderRadius: raios.controle,
                borderLeft: `3px solid ${cor}`, '&:hover': { bgcolor: cores.superficieElevada },
                '&:focus-visible': { outline: `2px solid ${cores.primaria}`, outlineOffset: 2 }
            }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="body2" noWrap sx={{ color: cores.textoForte, fontWeight: 700 }}>{titulo}</Typography>
                <Typography variant="caption" sx={{ color: cores.textoSecundario, display: 'block' }}>{detalhe}</Typography>
            </Box>
            <AbrirIcon fontSize="small" sx={{ color: cores.textoSecundario, flexShrink: 0 }} />
        </Box>
    );

    return (
        <GlassCard sx={{ p: 3, mb: 3 }}>
            <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
                {total > 0
                    ? <AcaoIcon sx={{ color: cores.erro }} />
                    : <TudoCertoIcon sx={{ color: cores.sucesso }} />}
                <Titulo sx={{ mb: 0 }}>{total > 0 ? `Precisa da sua atenção (${total})` : 'Nada pendente com a sua empresa'}</Titulo>
            </Stack>

            {total === 0 && (
                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                    Nenhum documento ou participante depende de você agora. O que estiver em análise está com a organização.
                </Typography>
            )}

            <Stack spacing={0.5}>
                {docs.map(o => (
                    <Linha key={`doc-${o.id || o.nome}`} cor={cores.erro} onClick={() => navigate('/documentos')}
                        titulo={`Documento da empresa: ${o.nome}`}
                        detalhe={(SITUACAO_OBRIGATORIO[o.situacao] || SITUACAO_OBRIGATORIO.falta_anexar).rotulo} />
                ))}
                {pessoas.slice(0, MAX_ACOES).map(p => (
                    <Linha key={p.id} cor={p.bloqueado || p.expulso ? cores.erro : cores.alerta}
                        onClick={() => navigate(`/participantes?filtro=acao&pessoa=${p.id}`)}
                        titulo={p.nome_completo} detalhe={motivosAcao(p).join(' · ')} />
                ))}
            </Stack>

            {pessoas.length > MAX_ACOES && (
                <Button onClick={() => navigate('/participantes?filtro=acao')} sx={{ mt: 1.5, textTransform: 'none' }}>
                    Ver todos os {pessoas.length} participantes com pendência
                </Button>
            )}
        </GlassCard>
    );
};

/** Link de cadastro da equipe: copiar ou mandar pelo WhatsApp com as instruções. */
const LinkCadastro = ({ perfil, nomeEmpresa, nomeEvento, onCopiar }) => {
    const { cota, link_cadastro: link, link_cadastro_expira_em: expira } = perfil;
    const mensagem = link
        ? `Olá! Este é o link para o seu credenciamento pela ${nomeEmpresa} no evento ${nomeEvento}: ${link}\n\n`
          + 'Tenha em mãos o seu CPF e os seus documentos. Na foto, fique de frente, sem óculos escuros nem boné, em lugar bem iluminado.'
        : '';

    return (
        <GlassCard sx={{ p: 3, height: '100%' }}>
            <Titulo>Cadastro da equipe</Titulo>
            <Typography variant="body2" sx={{ color: cores.texto }}>
                Vagas usadas: <b>{cota.usados}</b>{cota.limite > 0 ? <> de <b>{cota.limite}</b></> : ' (sem limite)'}
            </Typography>
            {cota.limite > 0 && (
                <Box sx={{ height: 6, borderRadius: raios.pilula, bgcolor: tom(cores.textoSecundario, 0.15), mt: 1, overflow: 'hidden' }}>
                    <Box sx={{
                        height: '100%', width: `${Math.min(100, (cota.usados / cota.limite) * 100)}%`,
                        bgcolor: cota.usados >= cota.limite ? cores.alerta : cores.primaria
                    }} />
                </Box>
            )}
            <Typography variant="body2" sx={{ color: cores.textoSecundario, mt: 2, mb: 1 }}>
                Envie este link aos colaboradores. Cada um informa o CPF e completa o próprio cadastro (foto e documentos).
            </Typography>
            {link ? (
                <>
                    <Typography variant="body2" sx={{ color: cores.textoForte, wordBreak: 'break-all', mb: 1.5 }}>{link}</Typography>
                    <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
                        <Button variant="outlined" startIcon={<CopiarIcon />} onClick={() => onCopiar(link)} sx={botaoSecundario}>Copiar link</Button>
                        <Button variant="outlined" startIcon={<WhatsAppIcon sx={{ color: cores.whatsapp }} />} sx={botaoSecundario}
                            component="a" href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noopener noreferrer">
                            Enviar pelo WhatsApp
                        </Button>
                    </Stack>
                    {expira && <Typography variant="caption" component="p" sx={{ color: cores.textoSecundario, mt: 1 }}>Vale até {dataHora(expira)}.</Typography>}
                </>
            ) : (
                <Typography variant="body2" sx={{ color: cores.alerta }}>A organização ainda não gerou o link de cadastro da equipe.</Typography>
            )}
        </GlassCard>
    );
};

/** Dias em que a equipe trabalha (os da empresa ou, sem eles, os do evento), com hoje em destaque. */
const DiasDaEquipe = ({ perfil }) => {
    const daEmpresa = (perfil.empresa?.datas_presenca || []).map(d => String(d?.data || d).slice(0, 10)).filter(Boolean);
    const dias = [...new Set(daEmpresa.length ? daEmpresa : (perfil.evento?.datas || []))].sort();
    const hoje = new Date().toLocaleDateString('sv-SE');
    const proximo = dias.find(d => d >= hoje);

    return (
        <Box>
            <Titulo>{daEmpresa.length ? 'Dias da sua equipe' : 'Dias do evento'}</Titulo>
            {dias.length === 0 ? (
                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>A organização ainda não informou as datas.</Typography>
            ) : (
                <>
                    <Stack direction="row" spacing={0.75} useFlexGap sx={{ flexWrap: 'wrap' }}>
                        {dias.map(d => {
                            const ehHoje = d === hoje;
                            const passou = d < hoje;
                            return (
                                <Box key={d} sx={{
                                    px: 1.25, py: 0.5, borderRadius: raios.controle, fontSize: '0.8125rem', fontWeight: ehHoje ? 700 : 500,
                                    border: `1px solid ${ehHoje ? cores.primaria : cores.borda}`,
                                    bgcolor: ehHoje ? tom(cores.primaria, 0.12) : 'transparent',
                                    color: ehHoje ? cores.primaria : passou ? cores.textoFraco : cores.texto
                                }}>
                                    {ehHoje ? 'Hoje' : dataBr(d).slice(0, 5)}
                                </Box>
                            );
                        })}
                    </Stack>
                    <Typography variant="caption" component="p" sx={{ color: cores.textoSecundario, mt: 1 }}>
                        {proximo === hoje ? 'A equipe trabalha hoje.' : proximo ? `Próximo dia: ${dataBr(proximo)}.` : 'Todas as datas já passaram.'}
                    </Typography>
                </>
            )}
        </Box>
    );
};

/** Visão geral: prontidão da equipe, o que precisa de ação, link de cadastro, movimento de hoje e pendências da empresa. */
const VisaoGeral = () => {
    const { enqueueSnackbar } = useSnackbar();
    const navigate = useNavigate();
    const [dados, setDados] = useState(null);

    const carregar = useCallback(async () => {
        try {
            const [perfil, resumo, docs, solicitacoes] = await Promise.all([
                api.get('/perfil'), api.get('/resumo'), api.get('/documentos'), api.get('/solicitacoes')
            ]);
            setDados({ perfil: dadosDe(perfil), resumo: dadosDe(resumo), docs: dadosDe(docs), solicitacoes: dadosDe(solicitacoes) || [] });
        } catch (err) {
            enqueueSnackbar(erroDe(err, 'Erro ao carregar o portal.'), { variant: 'error' });
        }
    }, [enqueueSnackbar]);

    useEffect(() => { carregar(); }, [carregar]);

    if (!dados) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 6 }}><CircularProgress /></Box>;

    const participantes = dados.resumo?.participantes || [];
    const pedidosAbertos = dados.solicitacoes.filter(s => s.status === 'pendente').length;
    const respondidos = dados.solicitacoes.filter(s => ['aprovada', 'recusada'].includes(s.status)).slice(0, 3);
    const filtrar = (key) => navigate(key === 'todos' ? '/participantes' : `/participantes?filtro=${key}`);

    const copiarLink = async (link) => {
        try { await navigator.clipboard.writeText(link); enqueueSnackbar('Link de cadastro copiado.', { variant: 'success' }); }
        catch { enqueueSnackbar('Não foi possível copiar.', { variant: 'error' }); }
    };

    return (
        <>
            <PageHeader title="Visão geral" subtitle="Quem da sua equipe já pode entrar no evento, o que falta resolver e o movimento de hoje." />

            <BarraProntidao participantes={participantes} onFiltrar={filtrar} />
            <AcoesPendentes participantes={participantes} docsEmpresa={dados.docs?.obrigatorios} navigate={navigate} />

            <Typography variant="subtitle1" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1 }}>Movimento de hoje</Typography>
            <Grid container spacing={1.5} sx={{ mb: 3 }}>
                {METRICAS.filter(m => MOVIMENTO.includes(m.key)).map(m => (
                    <Grid item xs={6} md={3} key={m.key}>
                        <Cartao valor={participantes.filter(m.filtro).length} rotulo={m.rotulo} cor={m.cor} onClick={() => filtrar(m.key)} />
                    </Grid>
                ))}
            </Grid>

            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <LinkCadastro perfil={dados.perfil} nomeEmpresa={dados.perfil.empresa?.nome || ''} nomeEvento={dados.perfil.evento?.nome || ''} onCopiar={copiarLink} />
                </Grid>

                <Grid item xs={12} md={6}>
                    <GlassCard sx={{ p: 3, height: '100%' }}>
                        <DiasDaEquipe perfil={dados.perfil} />

                        <Titulo sx={{ mt: 3 }}>Documentos da empresa</Titulo>
                        {(dados.docs?.obrigatorios || []).length > 0
                            ? <ChecklistObrigatorios obrigatorios={dados.docs.obrigatorios} titulo="Exigidos pela organização" />
                            : <Typography variant="body2" sx={{ color: cores.textoSecundario }}>A organização não exigiu documentos específicos da empresa.</Typography>}
                        <Button onClick={() => navigate('/documentos')} sx={{ mt: 1, textTransform: 'none' }}>Ver e enviar documentos</Button>

                        <Titulo sx={{ mt: 2 }}>Solicitações</Titulo>
                        <Typography variant="body2" sx={{ color: cores.texto }}>
                            {pedidosAbertos ? `${pedidosAbertos} aguardando a organização.` : 'Nenhum pedido aguardando.'}
                        </Typography>
                        {respondidos.map(s => (
                            <Typography key={s.id} variant="caption" sx={{ display: 'block', color: s.status === 'aprovada' ? cores.sucesso : cores.erro }}>
                                {s.status === 'aprovada' ? 'Aprovado' : 'Recusado'}: {s.alvo_resumo || 'pedido'} ({dataHora(s.decidida_em)})
                            </Typography>
                        ))}
                        <Button onClick={() => navigate('/solicitacoes')} sx={{ mt: 1, textTransform: 'none' }}>Ver solicitações</Button>
                    </GlassCard>
                </Grid>
            </Grid>
        </>
    );
};

export default VisaoGeral;
