import React from 'react';
import {
    Dialog, Box, Typography, Stack, Grid, Chip, IconButton, Divider, Button,
    useTheme, useMediaQuery
} from '@mui/material';
import {
    Close as CloseIcon,
    CorporateFare as CompanyIcon,
    Badge as BadgeIcon,
    Fingerprint as CpfIcon,
    AccessTime as TimeIcon,
    Place as AreaIcon,
    CheckCircle as SuccessIcon,
    Cancel as BlockIcon,
    Sensors as PulseiraIcon,
    Phone as PhoneIcon,
    WarningAmber as WarningIcon,
    MeetingRoom as PortariaIcon
} from '@mui/icons-material';
import PessoaFoto from '../common/PessoaFoto';

// Tudo vem da própria resposta da fiscalização (situação de hoje). Não busca o cadastro: lá a pulseira e
// o check-in podem ser de outro dia e misturariam dados antigos com os de agora.

const dataHora = (iso) => {
    if (!iso) return null;
    try {
        return new Date(iso).toLocaleString('pt-BR', {
            timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
    } catch {
        return iso;
    }
};

const horaComSegundos = (iso) => {
    if (!iso) return '—';
    try {
        return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
        return iso;
    }
};

const rotuloCredencial = (status) => ({
    pendente: 'Pendente de credenciamento',
    recusado: 'Recusado',
    verificacao: 'Em verificação',
    bloqueado: 'Bloqueado',
    autorizado: 'Credenciado',
    checkin_feito: 'Credenciado',
    checkout_feito: 'Credenciado',
}[status] || status || '—');

const Secao = ({ titulo, cor = 'rgba(255,255,255,0.5)', children }) => (
    <Box sx={{ mb: 2.5 }}>
        <Typography variant="caption" sx={{ color: cor, fontWeight: 700, letterSpacing: '1px', display: 'block', mb: 1.1 }}>
            {titulo.toUpperCase()}
        </Typography>
        {children}
    </Box>
);

const Linha = ({ rotulo, valor }) => (
    <Box sx={{ mb: 0.75 }}>
        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>{rotulo}</Typography>
        <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 700 }}>{valor}</Typography>
    </Box>
);

const FiscalizacaoPessoaModal = ({
    open,
    onClose,
    pessoa,
    resultado = null,
    areaFiscalizada = null
}) => {
    const theme = useTheme();
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    if (!open || !pessoa) return null;

    const autorizado = Boolean(resultado?.autorizado);
    const mensagem = resultado?.mensagem || (autorizado ? 'ACESSO LIBERADO' : 'ACESSO NEGADO');
    const corDecisao = autorizado ? '#00FF88' : '#FF3366';

    const nome = pessoa.nome_completo || pessoa.nome || 'Participante';
    const empresa = pessoa.empresas?.nome || pessoa.empresa_nome || 'Pessoa física';
    const rawCpf = String(pessoa.cpf || '').replace(/\D/g, '');
    const cpfFormatado = rawCpf.length === 11
        ? `${rawCpf.slice(0, 3)}.${rawCpf.slice(3, 6)}.${rawCpf.slice(6, 9)}-${rawCpf.slice(9, 11)}`
        : (pessoa.cpf || 'Não informado');

    const pulseira = pessoa.pulseira;
    const anterior = pessoa.pulseira_anterior;
    const entrada = pessoa.entrada_hoje;
    const historico = pessoa.historico_hoje || [];
    const areas = pessoa.areas_autorizadas || [];
    const areaAtualId = areaFiscalizada?.id;

    const dentro = Boolean(pessoa.dentro_do_evento);
    const ainda = Boolean(anterior?.ainda_dentro);
    const corPresenca = dentro ? '#00FF88' : (ainda ? '#FF3366' : '#FFB800');
    const textoPresenca = dentro
        ? 'DENTRO DO EVENTO'
        : ainda ? 'AINDA DENTRO COM PULSEIRA DE OUTRO DIA'
            : (pessoa.ultimo_evento_hoje === 'checkout' ? 'FORA DO EVENTO (saiu hoje)' : 'SEM CHECK-IN HOJE');

    const textoEntrada = (r) => {
        if (!r) return null;
        return `${dataHora(r.horario) || '—'} · ${r.forma || 'Forma não informada'}${r.usuario_nome ? ` por ${r.usuario_nome}` : ''}`;
    };

    return (
        <Dialog
            open={open}
            onClose={onClose}
            maxWidth="md"
            fullWidth
            PaperProps={{
                sx: {
                    color: '#FFFFFF',
                    maxHeight: { sm: '90dvh' },
                    overflowY: 'auto',
                    '&::-webkit-scrollbar': { width: '6px' },
                    '&::-webkit-scrollbar-thumb': { bgcolor: `${corDecisao}55`, borderRadius: '10px' }
                }
            }}
        >
            <Box sx={{ p: { xs: 2.5, sm: 4 }, position: 'relative' }}>
                <IconButton
                    onClick={onClose}
                    aria-label="Fechar ficha"
                    sx={{ position: 'absolute', top: 16, right: 16, color: 'rgba(255,255,255,0.7)', bgcolor: 'rgba(255,255,255,0.06)', '&:hover': { bgcolor: 'rgba(255,255,255,0.18)', color: '#FFFFFF' } }}
                >
                    <CloseIcon fontSize="small" />
                </IconButton>

                <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: '1.5px', display: 'flex', alignItems: 'center', gap: 1, mb: 3 }}>
                    <PortariaIcon sx={{ fontSize: 18 }} />
                    Ficha do participante · situação de hoje
                </Typography>

                <Grid container spacing={{ xs: 2.5, sm: 3.5 }} alignItems="flex-start">
                    {/* Esquerda: foto, decisão e pulseira */}
                    <Grid item xs={12} sm={4.5} sx={{ textAlign: 'center' }}>
                        <PessoaFoto
                            src={pessoa.foto_url}
                            pessoaId={pessoa.foto_url ? pessoa.id : undefined}
                            nome={nome}
                            width={isMobile ? 130 : 180}
                            borderRadius="16px"
                            accentColor={corDecisao}
                            borderWidth="3px"
                            boxShadow={`0 12px 35px rgba(0,0,0,0.8), 0 0 25px ${corDecisao}40`}
                        />

                        <Box sx={{ mt: 2.5, p: 1.5, borderRadius: 1.5, bgcolor: `${corDecisao}22`, border: `1px solid ${corDecisao}`, display: 'flex', alignItems: 'center', gap: 1, justifyContent: 'center' }}>
                            {autorizado ? <SuccessIcon sx={{ color: corDecisao, fontSize: 22 }} /> : <BlockIcon sx={{ color: corDecisao, fontSize: 22 }} />}
                            <Typography variant="body2" sx={{ color: corDecisao, fontWeight: 800, textAlign: 'left' }}>{mensagem}</Typography>
                        </Box>

                        <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, bgcolor: 'rgba(0, 212, 255, 0.08)', border: '1px solid rgba(0, 212, 255, 0.25)', textAlign: 'center' }}>
                            <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 0.8 }}>
                                <PulseiraIcon sx={{ fontSize: 16, color: '#00D4FF' }} />
                                Pulseira em uso hoje
                            </Typography>
                            {pulseira ? (
                                <>
                                    <Typography variant="h6" sx={{ color: '#00D4FF', fontWeight: 800, letterSpacing: '1px', mt: 0.5 }}>{pulseira.numero}</Typography>
                                    {pulseira.tipo_nome && <Chip size="small" label={pulseira.tipo_nome} sx={{ fontWeight: 700, bgcolor: pulseira.cor_hex ? `${pulseira.cor_hex}33` : 'rgba(255,255,255,0.08)', color: pulseira.cor_hex || '#FFFFFF', border: `1px solid ${pulseira.cor_hex || 'rgba(255,255,255,0.2)'}`, mt: 0.5 }} />}
                                    <Typography variant="caption" sx={{ color: '#CBD5E1', display: 'block', mt: 0.75 }}>
                                        Colocada em {dataHora(pulseira.colocada_em) || '—'}
                                        {pulseira.forma ? ` · ${pulseira.forma}` : ''}
                                        {pulseira.usuario_nome ? ` por ${pulseira.usuario_nome}` : ''}
                                    </Typography>
                                </>
                            ) : (
                                <Typography variant="body2" sx={{ color: '#FFB800', fontWeight: 700, mt: 0.5 }}>Nenhuma pulseira em uso hoje</Typography>
                            )}
                        </Box>

                        {anterior && (
                            <Box sx={{ mt: 2, p: 1.5, borderRadius: 1.5, textAlign: 'left', bgcolor: ainda ? 'rgba(255,51,102,0.08)' : 'rgba(255,184,0,0.08)', border: `1px solid ${ainda ? '#FF3366' : '#FFB800'}88` }}>
                                <Typography variant="caption" sx={{ color: ainda ? '#FF3366' : '#FFB800', fontWeight: 800, letterSpacing: '0.5px', display: 'block', mb: 0.5 }}>
                                    PULSEIRA DE OUTRO DIA — NÃO DEVOLVIDA
                                </Typography>
                                <Typography variant="body2" sx={{ color: '#FFFFFF', fontWeight: 800 }}>
                                    Nº {anterior.numero}{anterior.tipo_nome ? ` · ${anterior.tipo_nome}` : ''}
                                </Typography>
                                <Typography variant="caption" sx={{ color: '#CBD5E1', display: 'block' }}>
                                    Check-in em {dataHora(anterior.colocada_em) || '—'}
                                    {anterior.forma ? ` · ${anterior.forma}` : ''}
                                    {anterior.usuario_nome ? ` por ${anterior.usuario_nome}` : ''}
                                </Typography>
                                <Typography variant="caption" sx={{ color: ainda ? '#FF3366' : '#FFB800', fontWeight: 700, display: 'block', mt: 0.75 }}>
                                    {ainda
                                        ? 'Ainda está no evento com esta pulseira. Dirija-se ao CREDENCIAMENTO para trocar a pulseira e fazer check-in novamente.'
                                        : `Saiu em ${dataHora(anterior.saiu_em) || '—'} (fim de turno). Pulseira ainda não devolvida.`}
                                </Typography>
                            </Box>
                        )}
                    </Grid>

                    {/* Direita: identificação, credencial, presença, movimentos e áreas */}
                    <Grid item xs={12} sm={7.5}>
                        <Typography variant="h4" sx={{ fontWeight: 700, color: '#FFFFFF', fontFamily: '"Space Grotesk", sans-serif', lineHeight: 1.2, mb: 1 }}>
                            {nome}
                        </Typography>
                        <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1, mb: 2.5 }}>
                            <Chip icon={<BadgeIcon sx={{ fontSize: 16, color: '#FFFFFF !important' }} />} label={pessoa.funcao || 'Participante'} sx={{ bgcolor: 'rgba(255,255,255,0.08)', color: '#FFFFFF', fontWeight: 700 }} />
                            <Chip icon={<CompanyIcon sx={{ fontSize: 16, color: '#00D4FF !important' }} />} label={empresa} sx={{ bgcolor: 'rgba(0,212,255,0.08)', color: '#00D4FF', border: '1px solid rgba(0,212,255,0.2)', fontWeight: 700 }} />
                        </Stack>

                        <Divider sx={{ borderColor: 'rgba(255,255,255,0.08)', mb: 2.5 }} />

                        <Secao titulo="Dados cadastrais">
                            <Grid container spacing={2}>
                                <Grid item xs={6}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        <CpfIcon sx={{ color: '#00D4FF', fontSize: 18 }} />
                                        <Linha rotulo="CPF / Documento" valor={cpfFormatado} />
                                    </Box>
                                </Grid>
                                {pessoa.telefone && (
                                    <Grid item xs={6}>
                                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                            <PhoneIcon sx={{ color: '#00D4FF', fontSize: 18 }} />
                                            <Linha rotulo="Telefone" valor={pessoa.telefone} />
                                        </Box>
                                    </Grid>
                                )}
                            </Grid>
                        </Secao>

                        <Secao titulo="Credencial" cor={pessoa.credenciado ? '#00FF88' : '#FF3366'}>
                            <Box sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${pessoa.credenciado ? '#00FF8866' : '#FF336688'}`, bgcolor: pessoa.credenciado ? 'rgba(0,255,136,0.05)' : 'rgba(255,51,102,0.06)' }}>
                                <Typography sx={{ color: pessoa.credenciado ? '#00FF88' : '#FF3366', fontWeight: 800 }}>
                                    {pessoa.credenciado ? 'CREDENCIADO' : 'NÃO CREDENCIADO'}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.7)', display: 'block' }}>
                                    Situação no cadastro: {rotuloCredencial(pessoa.status_acesso)}
                                </Typography>
                                {!pessoa.credenciado && pessoa.motivo_nao_credenciado && pessoa.motivo_nao_credenciado !== `Situação: ${pessoa.status_acesso}` && (
                                    <Typography variant="caption" sx={{ color: '#FFB3C6', display: 'block' }}>{pessoa.motivo_nao_credenciado}</Typography>
                                )}
                            </Box>
                        </Secao>

                        <Secao titulo="Presença de hoje" cor={corPresenca}>
                            <Box sx={{ p: 1.5, borderRadius: 1.5, border: `1px solid ${corPresenca}66`, bgcolor: `${corPresenca}0D` }}>
                                <Stack direction="row" alignItems="center" spacing={1}>
                                    <TimeIcon sx={{ color: corPresenca, fontSize: 18 }} />
                                    <Typography sx={{ color: corPresenca, fontWeight: 800 }}>{textoPresenca}</Typography>
                                </Stack>
                                {entrada ? (
                                    <Typography variant="body2" sx={{ color: '#E2E8F0', mt: 0.75 }}>
                                        Entrada: {textoEntrada(entrada)}
                                    </Typography>
                                ) : (
                                    <Typography variant="body2" sx={{ color: '#94A3B8', mt: 0.75 }}>Nenhuma entrada registrada hoje.</Typography>
                                )}
                            </Box>
                        </Secao>

                        <Secao titulo="Movimentos de hoje">
                            {historico.length > 0 ? (
                                <Stack spacing={0.75}>
                                    {historico.map((h, idx) => {
                                        const entradaHoje = h.tipo === 'checkin';
                                        return (
                                            <Typography key={idx} variant="body2" sx={{ color: '#E2E8F0' }}>
                                                <Box component="span" sx={{ color: entradaHoje ? '#00FF88' : '#FFB800', fontWeight: 800 }}>
                                                    {horaComSegundos(h.horario)} {entradaHoje ? 'ENTRADA' : 'SAÍDA'}
                                                </Box>
                                                {' · '}{h.area_nome || 'Geral'}
                                                {' · '}{h.numero_pulseira ? `pulseira ${h.numero_pulseira}` : 'sem pulseira'}
                                                {' · '}{h.forma || 'forma não informada'}
                                                {h.usuario_nome ? ` por ${h.usuario_nome}` : ''}
                                            </Typography>
                                        );
                                    })}
                                </Stack>
                            ) : (
                                <Typography variant="body2" sx={{ color: '#94A3B8' }}>Nenhuma entrada ou saída hoje.</Typography>
                            )}
                        </Secao>

                        <Secao titulo={`Áreas que pode acessar (${areas.length})`} cor="#00D4FF">
                            {areas.length === 0 ? (
                                <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.6)' }}>Nenhuma área específica cadastrada.</Typography>
                            ) : (
                                <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ gap: 1 }}>
                                    {areas.map((area) => {
                                        const atual = areaAtualId && area.id === areaAtualId;
                                        return (
                                            <Chip
                                                key={area.id}
                                                icon={<AreaIcon sx={{ fontSize: 16 }} />}
                                                label={atual ? `★ ${area.nome_area} (POSTO ATUAL)` : area.nome_area}
                                                size="small"
                                                sx={{
                                                    bgcolor: atual ? 'rgba(0, 255, 136, 0.25)' : 'rgba(255,255,255,0.06)',
                                                    color: atual ? '#00FF88' : '#FFFFFF',
                                                    border: atual ? '1.5px solid #00FF88' : '1px solid rgba(255,255,255,0.15)',
                                                    fontWeight: atual ? 900 : 600,
                                                }}
                                            />
                                        );
                                    })}
                                </Stack>
                            )}
                        </Secao>

                        {!autorizado && resultado?.status === 'area_negada' && (
                            <Stack direction="row" spacing={1} alignItems="center" sx={{ color: '#FFB800' }}>
                                <WarningIcon fontSize="small" />
                                <Typography variant="body2" sx={{ fontWeight: 700 }}>Área restrita para esta pessoa.</Typography>
                            </Stack>
                        )}
                    </Grid>
                </Grid>

                <Box sx={{ mt: 3, pt: 2, borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'flex-end' }}>
                    <Button variant="outlined" onClick={onClose} sx={{ height: 38, color: '#FFFFFF', borderColor: 'rgba(255,255,255,0.2)', fontWeight: 700, borderRadius: '8px', px: 3, '&:hover': { bgcolor: 'rgba(255,255,255,0.08)', borderColor: '#FFFFFF' } }}>
                        Fechar ficha
                    </Button>
                </Box>
            </Box>
        </Dialog>
    );
};

export default FiscalizacaoPessoaModal;
