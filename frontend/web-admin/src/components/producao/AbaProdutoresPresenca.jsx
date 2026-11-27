import React, { useState } from 'react';
import {
    Box,
    Button,
    Checkbox,
    Chip,
    Dialog,
    DialogActions,
    DialogContent,
    FormControl,
    FormControlLabel,
    Grid,
    IconButton,
    InputAdornment,
    InputLabel,
    MenuItem,
    Select,
    Stack,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    TextField,
    Tooltip,
    Typography
} from '@mui/material';
import {
    PersonAdd as AddProdutorIcon,
    QrCodeScanner as QrIcon,
    Warning as DobraIcon,
    Lock as CadeadoIcon,
    AddLocationAlt as AreaIcon,
    Edit as EditIcon,
    Share as ConviteIcon,
    Shield as LgpdIcon,
    Schedule as EscalaIcon,
    ContentCopy as CopiarIcon,
    VpnKey as ChaveAcessoIcon,
    Visibility as VisivelIcon,
    VisibilityOff as OcultoIcon,
    AutoFixHigh as GerarSenhaIcon
} from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import { useConfirmacao } from '../../contexts/ConfirmacaoContext';
import GlassCard from '../common/GlassCard';
import NeonButton from '../common/NeonButton';
import TituloModal from '../common/TituloModal';
import api from '../../services/api';
import producaoSyncService from '../../services/ProducaoSyncService';
import { acaoTabela, acaoTabelaPerigo, botaoSecundario, cores, funcao, tamanhos, tom } from '../../styles/tokens';
import {
    formatarDataHoraCurta,
    formatarMoedaCentavos,
    obterCorArea,
    obterNomeArea,
    obterNomeProdutor,
    obterRotuloPapel,
    PAPEIS_PRODUCAO
} from './producaoHelpers';

const AbaProdutoresPresenca = ({ eventoId, resumo, headersExtra, aoAtualizar, apiClient }) => {
    const httpClient = apiClient || api;
    const { enqueueSnackbar } = useSnackbar();
    const confirmar = useConfirmacao();
    const areas = resumo?.areas || [];
    const produtores = resumo?.produtores || [];
    const escalas = resumo?.escalas || [];
    const presencas = resumo?.registros_presenca || [];
    const ctx = resumo?.contexto_usuario || {};

    const podeGerenciarEquipe = ['admin_master', 'master', 'produtor_geral'].includes(ctx.papel_producao);
    const podeEditarCache = ['admin_master', 'master', 'produtor_geral', 'financeiro'].includes(ctx.papel_producao);

    const [modalProdutorAberto, setModalProdutorAberto] = useState(false);
    const [produtorEditando, setProdutorEditando] = useState(null);
    const [modalConviteInfo, setModalConviteInfo] = useState(null);
    const [modalAcessoProdutor, setModalAcessoProdutor] = useState(null);
    const [formAcesso, setFormAcesso] = useState({ login_acesso: '', senha_acesso: '', mostrar_senha: false, salvo: null });
    const [mostrarSenhaModalProd, setMostrarSenhaModalProd] = useState(false);
    const [modalEscalaAberto, setModalEscalaAberto] = useState(false);
    const [modalAreaAberto, setModalAreaAberto] = useState(false);
    const [modalPresencaAberto, setModalPresencaAberto] = useState(false);
    const [salvando, setSalvando] = useState(false);

    const [formProdutor, setFormProdutor] = useState({
        nome: '',
        email: '',
        login_acesso: '',
        senha_acesso: '',
        telefone: '',
        documento: '',
        area_id: '',
        papel_producao: 'produtor_area',
        tipo_cache: 'diaria',
        valor_cache_reais: '800',
        chave_pix: '',
        motivo_cache: '',
        termo_lgpd_aceito: true
    });

    const [formEscala, setFormEscala] = useState({
        produtor_id: '',
        area_id: '',
        nome_turno: 'Turno montagem',
        tipo_turno: 'normal',
        data_inicio_turno: new Date().toISOString().slice(0, 16),
        data_fim_turno: new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 16)
    });

    const [formArea, setFormArea] = useState({ nome: '', cor: cores.primaria, responsavel_nome: '', descricao: '' });
    const [formPresenca, setFormPresenca] = useState({
        produtor_id: '',
        qr_code_credencial: '',
        tipo: 'checkin',
        metodo: 'qrcode',
        motivo_ocorrencia: ''
    });

    const gerarSenhaForte = () => {
        const sufixo = Math.floor(1000 + Math.random() * 9000);
        return `Prod@${sufixo}`;
    };

    const abrirModalProdutor = (prod = null) => {
        setProdutorEditando(prod);
        setMostrarSenhaModalProd(false);
        if (prod) {
            setFormProdutor({
                nome: prod.nome || '',
                email: prod.email || '',
                login_acesso: prod.login_acesso || prod.email || '',
                senha_acesso: '',
                telefone: prod.telefone || '',
                documento: prod.documento || '',
                area_id: prod.area_id || '',
                papel_producao: prod.papel_producao || 'produtor_area',
                tipo_cache: prod.tipo_cache || 'diaria',
                valor_cache_reais: prod.cache_restrito ? '' : String((Number(prod.valor_cache_centavos || 0) / 100)),
                chave_pix: prod.cache_restrito ? '' : (prod.chave_pix || ''),
                motivo_cache: '',
                termo_lgpd_aceito: Boolean(prod.termo_lgpd_aceito)
            });
        } else {
            setFormProdutor({
                nome: '', email: '', login_acesso: '', senha_acesso: '', telefone: '', documento: '', area_id: '',
                papel_producao: 'produtor_area', tipo_cache: 'diaria', valor_cache_reais: '800', chave_pix: '', motivo_cache: '', termo_lgpd_aceito: true
            });
        }
        setModalProdutorAberto(true);
    };

    const abrirModalAcesso = (prod) => {
        setModalAcessoProdutor(prod);
        setFormAcesso({
            login_acesso: prod.login_acesso || prod.email || '',
            senha_acesso: '',
            mostrar_senha: false,
            salvo: null
        });
    };

    const handleSalvarProdutor = async () => {
        if (!formProdutor.nome.trim()) {
            enqueueSnackbar('Informe o nome do produtor.', { variant: 'warning' });
            return;
        }
        const loginLimpo = String(formProdutor.login_acesso || formProdutor.email || '').trim().toLowerCase();
        const senhaLimpa = String(formProdutor.senha_acesso || '').trim();
        if (senhaLimpa) {
            if (!loginLimpo || loginLimpo.length < 3 || /\s/.test(loginLimpo)) {
                enqueueSnackbar('Informe um login ou e-mail válido para o portal (mín. 3 dígitos, sem espaços).', { variant: 'warning' });
                return;
            }
            if (senhaLimpa.length < 6) {
                enqueueSnackbar('A senha de acesso deve ter no mínimo 6 caracteres.', { variant: 'warning' });
                return;
            }
        }
        try {
            setSalvando(true);
            const centavos = Math.round(Number(String(formProdutor.valor_cache_reais || '0').replace(',', '.')) * 100);
            const payload = {
                ...formProdutor,
                login_acesso: loginLimpo || undefined,
                email: formProdutor.email || (loginLimpo.includes('@') ? loginLimpo : ''),
                senha_acesso: senhaLimpa || undefined,
                valor_cache_centavos: Number.isFinite(centavos) ? centavos : 0
            };
            if (produtorEditando) {
                await httpClient.put(`/producao/produtores/${produtorEditando.id}`, payload, { headers: headersExtra });
                enqueueSnackbar(
                    senhaLimpa ? 'Produtor, cachê e acesso ao portal atualizados.' : 'Produtor e histórico de cachê atualizados.',
                    { variant: 'success' }
                );
            } else {
                await httpClient.post('/producao/produtores', payload, { headers: headersExtra });
                enqueueSnackbar(
                    senhaLimpa ? 'Produtor cadastrado com acesso liberado no Portal dos Produtores.' : 'Produtor cadastrado com criptografia de dados bancários.',
                    { variant: 'success' }
                );
            }
            setModalProdutorAberto(false);
            setProdutorEditando(null);
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao salvar produtor.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleDefinirAcesso = async () => {
        if (!modalAcessoProdutor) return;
        const loginLimpo = String(formAcesso.login_acesso || '').trim().toLowerCase();
        const senhaLimpa = String(formAcesso.senha_acesso || '').trim();
        if (!loginLimpo || loginLimpo.length < 3 || /\s/.test(loginLimpo)) {
            enqueueSnackbar('Informe um login ou e-mail válido (mínimo 3 caracteres, sem espaços).', { variant: 'warning' });
            return;
        }
        if (senhaLimpa.length < 6) {
            enqueueSnackbar('A senha de acesso deve ter no mínimo 6 caracteres.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            const resp = await producaoSyncService.definirAcessoProdutor(
                eventoId,
                modalAcessoProdutor.id,
                { login_acesso: loginLimpo, senha_acesso: senhaLimpa },
                headersExtra,
                httpClient
            );
            const linkPortal = resp?.link_portal || (window.location.hostname.endsWith('nzt.app.br')
                ? `https://produtor.nzt.app.br/?evento_id=${eventoId}`
                : `${window.location.origin}/portal-produtor?evento_id=${eventoId}`);
            const textoCredenciais = `Olá ${modalAcessoProdutor.nome}! Seu acesso ao Portal Exclusivo de Produção está ativo.\nLink do portal: ${linkPortal}\nLogin: ${loginLimpo}\nSenha: ${senhaLimpa}`;
            setFormAcesso((prev) => ({
                ...prev,
                salvo: {
                    ...resp,
                    login_acesso: loginLimpo,
                    senha: senhaLimpa,
                    link_portal: linkPortal,
                    mensagem_whatsapp: textoCredenciais,
                    telefone: modalAcessoProdutor.telefone || ''
                }
            }));
            enqueueSnackbar('Login e senha salvos no Portal dos Produtores.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao definir login e senha do produtor.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleGerarConvite = async (prod) => {
        try {
            const res = await httpClient.post(`/producao/produtores/${prod.id}/convite`, {}, { headers: headersExtra });
            setModalConviteInfo({ ...res.data?.data, telefone: prod.telefone || '' });
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao gerar convite.', { variant: 'error' });
        }
    };

    const handleAnonimizarLgpd = async (prod) => {
        const ok = await confirmar({
            titulo: 'Anonimizar dados pessoais (LGPD)',
            mensagem: `Remover CPF, telefone, e-mail e PIX de "${prod.nome}" mantendo apenas o histórico operacional? Esta ação não pode ser desfeita.`,
            textoConfirmar: 'Anonimizar'
        });
        if (!ok) return;
        try {
            await httpClient.post(`/producao/produtores/${prod.id}/lgpd-anonimizar`, {}, { headers: headersExtra });
            enqueueSnackbar('Dados pessoais anonimizados conforme LGPD.', { variant: 'success' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao anonimizar dados.', { variant: 'error' });
        }
    };

    const handleSalvarEscala = async () => {
        const pid = formEscala.produtor_id || produtores[0]?.id;
        if (!pid) {
            enqueueSnackbar('Selecione o produtor para a escala.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/escalas', {
                ...formEscala,
                produtor_id: pid,
                data_inicio_turno: new Date(formEscala.data_inicio_turno).toISOString(),
                data_fim_turno: new Date(formEscala.data_fim_turno).toISOString()
            }, { headers: headersExtra });
            enqueueSnackbar('Escala registrada no painel do dia.', { variant: 'success' });
            setModalEscalaAberto(false);
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao criar escala.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleSalvarArea = async () => {
        if (!formArea.nome.trim()) {
            enqueueSnackbar('Informe o nome da área.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            await httpClient.post('/producao/areas', formArea, { headers: headersExtra });
            enqueueSnackbar('Área criada com sucesso.', { variant: 'success' });
            setModalAreaAberto(false);
            setFormArea({ nome: '', cor: cores.primaria, responsavel_nome: '', descricao: '' });
            await aoAtualizar();
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao criar área.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const handleRegistrarPresenca = async () => {
        const codigo = formPresenca.qr_code_credencial?.trim();
        const pid = codigo ? '' : (formPresenca.produtor_id || produtores[0]?.id);
        if (!pid && !codigo) {
            enqueueSnackbar('Selecione o produtor ou informe o QR Code ou CPF.', { variant: 'warning' });
            return;
        }
        try {
            setSalvando(true);
            const res = await producaoSyncService.enviarComSuporteOffline(
                eventoId,
                '/producao/presenca/registrar',
                'presenca',
                {
                    produtor_id: pid || undefined,
                    qr_code_credencial: codigo || undefined,
                    tipo: formPresenca.tipo,
                    metodo: formPresenca.metodo,
                    motivo_ocorrencia: formPresenca.motivo_ocorrencia
                },
                headersExtra,
                httpClient
            );
            setModalPresencaAberto(false);
            setFormPresenca({ produtor_id: '', qr_code_credencial: '', tipo: 'checkin', metodo: 'qrcode', motivo_ocorrencia: '' });
            if (res.status === 'offline') {
                enqueueSnackbar('Presença salva na fila offline e será sincronizada ao voltar o sinal.', { variant: 'warning' });
            } else {
                const ehDobra = res.data?.eh_dobra_detectada;
                enqueueSnackbar(
                    ehDobra ? 'Presença registrada com alerta automático de dobra detectada.' : 'Presença registrada com sucesso.',
                    { variant: ehDobra ? 'warning' : 'success' }
                );
                await aoAtualizar();
            }
        } catch (err) {
            enqueueSnackbar(err.response?.data?.error || 'Erro ao registrar presença.', { variant: 'error' });
        } finally {
            setSalvando(false);
        }
    };

    const escaladosPresentes = escalas.filter((e) => e.status === 'presente').length;
    const escaladosAusentes = escalas.filter((e) => ['falta', 'expulso'].includes(e.status)).length;
    const escaladosDobra = escalas.filter((e) => e.tipo_turno === 'dobra_planejada').length;

    return (
        <Stack spacing={3}>
            {/* Barra de ações */}
            <GlassCard sx={{ p: 2.25 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5 }}>
                    <Box>
                        <Typography variant="h6" sx={{ color: cores.textoForte }}>
                            Equipe de produção, cachês e controle de presença
                        </Typography>
                        <Typography variant="body2" sx={{ color: cores.textoSecundario }}>
                            Cachês e PIX protegidos no servidor. Check-in de campo offline e detecção automática de dobras.
                        </Typography>
                    </Box>
                    <Stack direction="row" spacing={1.5} flexWrap="wrap">
                        {podeGerenciarEquipe && (
                            <>
                                <Button variant="outlined" startIcon={<AreaIcon />} onClick={() => setModalAreaAberto(true)} sx={botaoSecundario}>
                                    Nova área
                                </Button>
                                <Button variant="outlined" startIcon={<EscalaIcon />} onClick={() => setModalEscalaAberto(true)} sx={botaoSecundario}>
                                    Nova escala
                                </Button>
                                <Button variant="outlined" startIcon={<AddProdutorIcon />} onClick={() => abrirModalProdutor(null)} sx={botaoSecundario}>
                                    Cadastrar produtor
                                </Button>
                            </>
                        )}
                        <NeonButton startIcon={<QrIcon />} onClick={() => setModalPresencaAberto(true)}>
                            Registrar presença
                        </NeonButton>
                    </Stack>
                </Box>
            </GlassCard>

            {/* Tabela de Produtores com Segregação de Cachê */}
            <GlassCard sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1.5 }}>
                    Produtores vinculados ao evento ({produtores.length})
                </Typography>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Nome</TableCell>
                                <TableCell>Perfil de acesso</TableCell>
                                <TableCell>Área</TableCell>
                                <TableCell>Login de acesso</TableCell>
                                <TableCell>Contato</TableCell>
                                <TableCell>Cachê e modelo</TableCell>
                                <TableCell>Chave PIX</TableCell>
                                <TableCell>LGPD</TableCell>
                                {(podeGerenciarEquipe || podeEditarCache) && <TableCell align="right">Ações</TableCell>}
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {produtores.map((p) => {
                                const areaCor = obterCorArea(areas, p.area_id);
                                const temLogin = Boolean(p.possui_login || p.user_id);
                                return (
                                    <TableRow key={p.id}>
                                        <TableCell>
                                            <Typography sx={{ fontWeight: 700, fontSize: tamanhos.sm, color: cores.textoForte }}>
                                                {p.nome}
                                            </Typography>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                {p.documento || 'Sem documento'}
                                            </Typography>
                                        </TableCell>
                                        <TableCell>
                                            <Chip size="small" label={obterRotuloPapel(p.papel_producao)} sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 600 }} />
                                        </TableCell>
                                        <TableCell>
                                            {p.area_id ? (
                                                <Chip size="small" label={obterNomeArea(areas, p.area_id)} sx={{ bgcolor: tom(areaCor, 0.14), color: areaCor, fontWeight: 600 }} />
                                            ) : 'Todas as áreas'}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                icon={<ChaveAcessoIcon sx={{ fontSize: 13 }} />}
                                                label={temLogin ? 'Portal ativo' : 'Sem login'}
                                                sx={{
                                                    bgcolor: tom(temLogin ? funcao.liberado : funcao.alerta, 0.14),
                                                    color: temLogin ? funcao.liberado : funcao.alerta,
                                                    fontWeight: 600
                                                }}
                                            />
                                            {(p.login_acesso || p.email) && (
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mt: 0.25 }}>
                                                    {p.login_acesso || p.email}
                                                </Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Typography sx={{ fontSize: tamanhos.xs }}>{p.email || '—'}</Typography>
                                            <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>{p.telefone || ''}</Typography>
                                        </TableCell>
                                        <TableCell>
                                            {p.cache_restrito ? (
                                                <Chip
                                                    size="small"
                                                    icon={<CadeadoIcon sx={{ fontSize: 13 }} />}
                                                    label="Restrito"
                                                    sx={{ bgcolor: tom(funcao.neutro, 0.14), color: cores.textoSecundario }}
                                                />
                                            ) : (
                                                <Box>
                                                    <Typography sx={{ fontWeight: 700, color: funcao.liberado, fontSize: tamanhos.sm }}>
                                                        {formatarMoedaCentavos(p.valor_cache_centavos)}
                                                    </Typography>
                                                    <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                                        {p.tipo_cache} {p.historico_cache?.length > 0 ? `(${p.historico_cache.length} alt.)` : ''}
                                                    </Typography>
                                                </Box>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {p.cache_restrito ? (
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoFraco }}>Confidencial</Typography>
                                            ) : (
                                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSuave }}>{p.chave_pix || '—'}</Typography>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Chip
                                                size="small"
                                                label={p.termo_lgpd_aceito ? 'Aceito' : 'Pendente'}
                                                sx={{
                                                    bgcolor: tom(p.termo_lgpd_aceito ? funcao.liberado : funcao.alerta, 0.14),
                                                    color: p.termo_lgpd_aceito ? funcao.liberado : funcao.alerta
                                                }}
                                            />
                                        </TableCell>
                                        {(podeGerenciarEquipe || podeEditarCache) && (
                                            <TableCell align="right">
                                                <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                                                    <Tooltip title="Editar produtor e cachê">
                                                        <IconButton size="small" aria-label="Editar produtor" onClick={() => abrirModalProdutor(p)} sx={acaoTabela}>
                                                            <EditIcon fontSize="small" />
                                                        </IconButton>
                                                    </Tooltip>
                                                    {podeGerenciarEquipe && (
                                                        <>
                                                            <Tooltip title="Definir login e senha">
                                                                <IconButton size="small" aria-label="Definir login e senha" onClick={() => abrirModalAcesso(p)} sx={acaoTabela}>
                                                                    <ChaveAcessoIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Enviar convite de acesso">
                                                                <IconButton size="small" aria-label="Enviar convite" onClick={() => handleGerarConvite(p)} sx={acaoTabela}>
                                                                    <ConviteIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                            <Tooltip title="Anonimizar dados (LGPD)">
                                                                <IconButton size="small" aria-label="Anonimizar LGPD" onClick={() => handleAnonimizarLgpd(p)} sx={acaoTabelaPerigo}>
                                                                    <LgpdIcon fontSize="small" />
                                                                </IconButton>
                                                            </Tooltip>
                                                        </>
                                                    )}
                                                </Stack>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            {/* Painel de escalas programadas do dia */}
            <GlassCard sx={{ p: 2.5 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1.5, mb: 2 }}>
                    <Typography variant="h6" sx={{ color: cores.textoForte }}>
                        Painel de escalas do dia
                    </Typography>
                    <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
                        <Chip size="small" label={`Escalados: ${escalas.length}`} sx={{ bgcolor: tom(funcao.acao, 0.14), color: funcao.acao, fontWeight: 600 }} />
                        <Chip size="small" label={`Presentes: ${escaladosPresentes}`} sx={{ bgcolor: tom(funcao.liberado, 0.14), color: funcao.liberado, fontWeight: 600 }} />
                        <Chip size="small" label={`Faltas ou expulsões: ${escaladosAusentes}`} sx={{ bgcolor: tom(funcao.negado, 0.14), color: funcao.negado, fontWeight: 600 }} />
                        <Chip size="small" label={`Dobras programadas: ${escaladosDobra}`} sx={{ bgcolor: tom(funcao.alerta, 0.14), color: funcao.alerta, fontWeight: 600 }} />
                    </Stack>
                </Box>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Turno</TableCell>
                                <TableCell>Produtor</TableCell>
                                <TableCell>Área</TableCell>
                                <TableCell>Horário previsto</TableCell>
                                <TableCell>Tipo</TableCell>
                                <TableCell>Situação</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {escalas.map((esc) => (
                                <TableRow key={esc.id}>
                                    <TableCell sx={{ fontWeight: 600 }}>{esc.nome_turno || 'Turno'}</TableCell>
                                    <TableCell>{obterNomeProdutor(produtores, esc.produtor_id)}</TableCell>
                                    <TableCell>{obterNomeArea(areas, esc.area_id)}</TableCell>
                                    <TableCell>{formatarDataHoraCurta(esc.data_inicio_turno)} até {formatarDataHoraCurta(esc.data_fim_turno)}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={esc.tipo_turno === 'dobra_planejada' ? 'Dobra programada' : esc.tipo_turno === 'plantao' ? 'Plantão' : 'Normal'}
                                            sx={{ bgcolor: tom(esc.tipo_turno === 'dobra_planejada' ? funcao.alerta : funcao.neutro, 0.14), color: esc.tipo_turno === 'dobra_planejada' ? funcao.alerta : cores.textoSuave }}
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={esc.status}
                                            sx={{
                                                bgcolor: tom(esc.status === 'presente' ? funcao.liberado : ['falta', 'expulso'].includes(esc.status) ? funcao.negado : funcao.acao, 0.14),
                                                color: esc.status === 'presente' ? funcao.liberado : ['falta', 'expulso'].includes(esc.status) ? funcao.negado : funcao.acao,
                                                fontWeight: 600
                                            }}
                                        />
                                    </TableCell>
                                </TableRow>
                            ))}
                            {escalas.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={6} align="center">Nenhuma escala programada ainda.</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            {/* Registros de presença e alertas de dobra */}
            <GlassCard sx={{ p: 2.5 }}>
                <Typography variant="h6" sx={{ color: cores.textoForte, mb: 1.5 }}>
                    Registro de ponto, faltas, expulsões e dobras
                </Typography>
                <TableContainer>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>Data e hora</TableCell>
                                <TableCell>Produtor</TableCell>
                                <TableCell>Evento de ponto</TableCell>
                                <TableCell>Método</TableCell>
                                <TableCell>Dobra / Alerta</TableCell>
                                <TableCell>Observação</TableCell>
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {presencas.map((r) => (
                                <TableRow key={r.id}>
                                    <TableCell>{formatarDataHoraCurta(r.data_hora)}</TableCell>
                                    <TableCell sx={{ fontWeight: 600 }}>{obterNomeProdutor(produtores, r.produtor_id)}</TableCell>
                                    <TableCell>
                                        <Chip
                                            size="small"
                                            label={r.tipo}
                                            sx={{
                                                bgcolor: tom(r.tipo === 'checkin' ? funcao.liberado : r.tipo === 'expulsao' || r.tipo === 'falta' ? funcao.negado : funcao.saida, 0.14),
                                                color: r.tipo === 'checkin' ? funcao.liberado : r.tipo === 'expulsao' || r.tipo === 'falta' ? funcao.negado : funcao.saida,
                                                fontWeight: 600
                                            }}
                                        />
                                    </TableCell>
                                    <TableCell>{r.metodo}</TableCell>
                                    <TableCell>
                                        {r.eh_dobra_detectada ? (
                                            <Chip size="small" icon={<DobraIcon />} label="Dobra detectada" sx={{ bgcolor: tom(funcao.alerta, 0.18), color: funcao.alerta, fontWeight: 700 }} />
                                        ) : 'Normal'}
                                    </TableCell>
                                    <TableCell>{r.motivo_ocorrencia || '—'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </TableContainer>
            </GlassCard>

            {/* Modal cadastrar ou editar produtor */}
            <Dialog open={modalProdutorAberto} onClose={() => { setModalProdutorAberto(false); setProdutorEditando(null); }} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo={produtorEditando ? 'Editar produtor e cachê' : 'Cadastrar produtor'}
                    subtitulo="Defina área, papel de acesso, cachê confidencial e consentimento LGPD."
                    onFechar={() => { setModalProdutorAberto(false); setProdutorEditando(null); }}
                />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField fullWidth label="Nome completo" value={formProdutor.nome} onChange={(e) => setFormProdutor({ ...formProdutor, nome: e.target.value })} />
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="Telefone ou WhatsApp" value={formProdutor.telefone} onChange={(e) => setFormProdutor({ ...formProdutor, telefone: e.target.value })} />
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" label="CPF ou documento" value={formProdutor.documento} onChange={(e) => setFormProdutor({ ...formProdutor, documento: e.target.value })} />
                            </Grid>
                        </Grid>

                        {podeGerenciarEquipe && (
                            <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: tom(cores.primaria, 0.06), border: `1px solid ${tom(cores.primaria, 0.25)}` }}>
                                <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: cores.textoForte, mb: 0.5 }}>
                                    Acesso exclusivo ao portal dos produtores (sem usuário no painel NZT)
                                </Typography>
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mb: 1.5 }}>
                                    Não cria usuário operador no sistema principal. O produtor entra pelo link separado /portal-produtor.
                                </Typography>
                                <Grid container spacing={1.5}>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            label="Login do portal (e-mail ou usuário)"
                                            value={formProdutor.login_acesso}
                                            onChange={(e) => setFormProdutor({
                                                ...formProdutor,
                                                login_acesso: e.target.value,
                                                email: e.target.value.includes('@') ? e.target.value : formProdutor.email
                                            })}
                                        />
                                    </Grid>
                                    <Grid item xs={12} sm={6}>
                                        <TextField
                                            fullWidth
                                            size="small"
                                            type={mostrarSenhaModalProd ? 'text' : 'password'}
                                            label={produtorEditando ? 'Nova senha do portal (opcional)' : 'Senha do portal (mín. 6 dígitos)'}
                                            value={formProdutor.senha_acesso}
                                            onChange={(e) => setFormProdutor({ ...formProdutor, senha_acesso: e.target.value })}
                                            InputProps={{
                                                endAdornment: (
                                                    <InputAdornment position="end">
                                                        <IconButton
                                                            size="small"
                                                            aria-label="Alternar visibilidade da senha"
                                                            onClick={() => setMostrarSenhaModalProd((v) => !v)}
                                                            edge="end"
                                                        >
                                                            {mostrarSenhaModalProd ? <OcultoIcon fontSize="small" /> : <VisivelIcon fontSize="small" />}
                                                        </IconButton>
                                                    </InputAdornment>
                                                )
                                            }}
                                        />
                                    </Grid>
                                </Grid>
                                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'flex-end' }}>
                                    <Button
                                        size="small"
                                        variant="outlined"
                                        startIcon={<GerarSenhaIcon />}
                                        onClick={() => {
                                            setFormProdutor((prev) => ({ ...prev, senha_acesso: gerarSenhaForte() }));
                                            setMostrarSenhaModalProd(true);
                                        }}
                                        sx={botaoSecundario}
                                    >
                                        Gerar senha automática
                                    </Button>
                                </Box>
                            </Box>
                        )}
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Perfil na produção</InputLabel>
                                    <Select label="Perfil na produção" value={formProdutor.papel_producao} onChange={(e) => setFormProdutor({ ...formProdutor, papel_producao: e.target.value })}>
                                        {PAPEIS_PRODUCAO.filter((p) => p.valor !== 'admin_master').map((p) => (
                                            <MenuItem key={p.valor} value={p.valor}>{p.rotulo}</MenuItem>
                                        ))}
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Área de atuação</InputLabel>
                                    <Select label="Área de atuação" value={formProdutor.area_id} onChange={(e) => setFormProdutor({ ...formProdutor, area_id: e.target.value })}>
                                        <MenuItem value="">Geral (todas)</MenuItem>
                                        {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                                    </Select>
                                </FormControl>
                            </Grid>
                        </Grid>
                        <Grid container spacing={1.5}>
                            <Grid item xs={12} sm={6}>
                                <FormControl fullWidth size="small">
                                    <InputLabel>Modelo de cachê</InputLabel>
                                    <Select label="Modelo de cachê" value={formProdutor.tipo_cache} onChange={(e) => setFormProdutor({ ...formProdutor, tipo_cache: e.target.value })}>
                                        <MenuItem value="diaria">Por diária</MenuItem>
                                        <MenuItem value="evento_fechado">Por evento fechado</MenuItem>
                                        <MenuItem value="tarefa">Por tarefa</MenuItem>
                                        <MenuItem value="hora">Por hora</MenuItem>
                                    </Select>
                                </FormControl>
                            </Grid>
                            <Grid item xs={12} sm={6}>
                                <TextField fullWidth size="small" type="number" label="Valor do cachê (R$)" value={formProdutor.valor_cache_reais} onChange={(e) => setFormProdutor({ ...formProdutor, valor_cache_reais: e.target.value })} />
                            </Grid>
                        </Grid>
                        <TextField fullWidth size="small" label="Chave PIX ou dados bancários (será criptografado)" value={formProdutor.chave_pix} onChange={(e) => setFormProdutor({ ...formProdutor, chave_pix: e.target.value })} />
                        {produtorEditando && (
                            <TextField fullWidth size="small" label="Motivo da alteração de cachê" value={formProdutor.motivo_cache} onChange={(e) => setFormProdutor({ ...formProdutor, motivo_cache: e.target.value })} />
                        )}
                        {produtorEditando?.historico_cache?.length > 0 && (
                            <Box sx={{ p: 1.25, borderRadius: 1.5, bgcolor: cores.fundo, border: `1px solid ${cores.borda}` }}>
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario, mb: 0.5 }}>
                                    Histórico de alterações de cachê:
                                </Typography>
                                {produtorEditando.historico_cache.map((h, i) => (
                                    <Typography key={i} sx={{ fontSize: tamanhos.xs, color: cores.textoSuave }}>
                                        • {formatarDataHoraCurta(h.data)}: {formatarMoedaCentavos(h.valor_centavos)} ({h.motivo || 'Reajuste'})
                                    </Typography>
                                ))}
                            </Box>
                        )}
                        <FormControlLabel
                            control={<Checkbox checked={formProdutor.termo_lgpd_aceito} onChange={(e) => setFormProdutor({ ...formProdutor, termo_lgpd_aceito: e.target.checked })} />}
                            label="Consentimento LGPD para uso de imagem e voz em evidências"
                        />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => { setModalProdutorAberto(false); setProdutorEditando(null); }} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleSalvarProdutor}>
                        Salvar produtor
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal nova área */}
            <Dialog open={modalAreaAberto} onClose={() => setModalAreaAberto(false)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Nova área de produção" subtitulo="Ex.: Palco, Som, Luz, A e B, Limpeza." onFechar={() => setModalAreaAberto(false)} />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField fullWidth label="Nome da área" value={formArea.nome} onChange={(e) => setFormArea({ ...formArea, nome: e.target.value })} />
                        <TextField fullWidth label="Responsável principal" value={formArea.responsavel_nome} onChange={(e) => setFormArea({ ...formArea, responsavel_nome: e.target.value })} />
                        <TextField fullWidth label="Cor de identificação (hex)" value={formArea.cor} onChange={(e) => setFormArea({ ...formArea, cor: e.target.value })} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalAreaAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleSalvarArea}>
                        Salvar área
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal registrar presença */}
            <Dialog open={modalPresencaAberto} onClose={() => setModalPresencaAberto(false)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Registrar presença da equipe" subtitulo="Funciona offline e detecta dobras automaticamente." onFechar={() => setModalPresencaAberto(false)} />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <TextField
                            fullWidth
                            size="small"
                            label="QR Code da credencial ou CPF (opcional)"
                            value={formPresenca.qr_code_credencial}
                            onChange={(e) => setFormPresenca({ ...formPresenca, qr_code_credencial: e.target.value })}
                        />
                        <FormControl fullWidth size="small">
                            <InputLabel>Ou selecione o produtor</InputLabel>
                            <Select label="Ou selecione o produtor" value={formPresenca.produtor_id || produtores[0]?.id || ''} onChange={(e) => setFormPresenca({ ...formPresenca, produtor_id: e.target.value })}>
                                {produtores.map((p) => <MenuItem key={p.id} value={p.id}>{p.nome}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Tipo de registro</InputLabel>
                            <Select label="Tipo de registro" value={formPresenca.tipo} onChange={(e) => setFormPresenca({ ...formPresenca, tipo: e.target.value })}>
                                <MenuItem value="checkin">Check-in (entrada)</MenuItem>
                                <MenuItem value="checkout">Check-out (saída)</MenuItem>
                                <MenuItem value="falta">Falta</MenuItem>
                                <MenuItem value="atraso">Atraso</MenuItem>
                                <MenuItem value="expulsao">Expulsão ou desligamento</MenuItem>
                                <MenuItem value="substituicao">Substituição</MenuItem>
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Método</InputLabel>
                            <Select label="Método" value={formPresenca.metodo} onChange={(e) => setFormPresenca({ ...formPresenca, metodo: e.target.value })}>
                                <MenuItem value="qrcode">QR Code da credencial</MenuItem>
                                <MenuItem value="manual">Lançamento manual</MenuItem>
                                <MenuItem value="facial_cftv">Reconhecimento facial</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField fullWidth size="small" label="Motivo ou observação" value={formPresenca.motivo_ocorrencia} onChange={(e) => setFormPresenca({ ...formPresenca, motivo_ocorrencia: e.target.value })} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalPresencaAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleRegistrarPresenca}>
                        Confirmar registro
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal nova escala */}
            <Dialog open={modalEscalaAberto} onClose={() => setModalEscalaAberto(false)} maxWidth="xs" fullWidth>
                <TituloModal titulo="Nova escala de equipe" subtitulo="Defina turno programado e alerta de dobra planejada." onFechar={() => setModalEscalaAberto(false)} />
                <DialogContent dividers>
                    <Stack spacing={2} sx={{ pt: 0.5 }}>
                        <FormControl fullWidth size="small">
                            <InputLabel>Produtor</InputLabel>
                            <Select label="Produtor" value={formEscala.produtor_id || produtores[0]?.id || ''} onChange={(e) => setFormEscala({ ...formEscala, produtor_id: e.target.value })}>
                                {produtores.map((p) => <MenuItem key={p.id} value={p.id}>{p.nome}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <FormControl fullWidth size="small">
                            <InputLabel>Área</InputLabel>
                            <Select label="Área" value={formEscala.area_id || areas[0]?.id || ''} onChange={(e) => setFormEscala({ ...formEscala, area_id: e.target.value })}>
                                {areas.map((a) => <MenuItem key={a.id} value={a.id}>{a.nome}</MenuItem>)}
                            </Select>
                        </FormControl>
                        <TextField fullWidth size="small" label="Nome do turno" value={formEscala.nome_turno} onChange={(e) => setFormEscala({ ...formEscala, nome_turno: e.target.value })} />
                        <FormControl fullWidth size="small">
                            <InputLabel>Tipo de turno</InputLabel>
                            <Select label="Tipo de turno" value={formEscala.tipo_turno} onChange={(e) => setFormEscala({ ...formEscala, tipo_turno: e.target.value })}>
                                <MenuItem value="normal">Turno normal</MenuItem>
                                <MenuItem value="dobra_planejada">Dobra programada</MenuItem>
                                <MenuItem value="plantao">Plantão</MenuItem>
                            </Select>
                        </FormControl>
                        <TextField fullWidth size="small" type="datetime-local" label="Início do turno" InputLabelProps={{ shrink: true }} value={formEscala.data_inicio_turno} onChange={(e) => setFormEscala({ ...formEscala, data_inicio_turno: e.target.value })} />
                        <TextField fullWidth size="small" type="datetime-local" label="Fim do turno" InputLabelProps={{ shrink: true }} value={formEscala.data_fim_turno} onChange={(e) => setFormEscala({ ...formEscala, data_fim_turno: e.target.value })} />
                    </Stack>
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalEscalaAberto(false)} sx={botaoSecundario}>
                        Cancelar
                    </Button>
                    <NeonButton loading={salvando} onClick={handleSalvarEscala}>
                        Salvar escala
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal convite WhatsApp e primeiro acesso */}
            <Dialog open={Boolean(modalConviteInfo)} onClose={() => setModalConviteInfo(null)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Convite de acesso ao portal da produção"
                    subtitulo={modalConviteInfo ? `Link exclusivo gerado para ${modalConviteInfo.nome}` : ''}
                    onFechar={() => setModalConviteInfo(null)}
                />
                <DialogContent dividers>
                    {modalConviteInfo && (
                        <Stack spacing={2} sx={{ pt: 0.5, alignItems: 'center' }}>
                            {modalConviteInfo.qr_code_url && (
                                <Box sx={{ p: 1.5, bgcolor: '#FFFFFF', borderRadius: 2, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                    <img
                                        src={modalConviteInfo.qr_code_url}
                                        alt="QR Code de Acesso"
                                        style={{ width: 180, height: 180, display: 'block' }}
                                    />
                                    <Typography variant="caption" sx={{ color: '#031018', mt: 0.5, fontWeight: 600 }}>
                                        Aponte a câmera do celular para entrar
                                    </Typography>
                                </Box>
                            )}
                            <TextField fullWidth size="small" label="Link de primeiro acesso (sem senha)" value={modalConviteInfo.link} InputProps={{ readOnly: true }} />
                            <TextField fullWidth multiline rows={3} size="small" label="Mensagem pronta para envio" value={modalConviteInfo.mensagem_whatsapp} InputProps={{ readOnly: true }} />
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalConviteInfo(null)} sx={botaoSecundario}>
                        Fechar
                    </Button>
                    <Button
                        variant="outlined"
                        startIcon={<CopiarIcon />}
                        onClick={() => {
                            navigator.clipboard?.writeText(modalConviteInfo?.link || '');
                            enqueueSnackbar('Link copiado para a área de transferência.', { variant: 'success' });
                        }}
                        sx={botaoSecundario}
                    >
                        Copiar link
                    </Button>
                    <NeonButton
                        onClick={() => {
                            const fone = String(modalConviteInfo?.telefone || '').replace(/\D/g, '');
                            const urlWa = `https://wa.me/${fone ? `55${fone}` : ''}?text=${encodeURIComponent(modalConviteInfo?.mensagem_whatsapp || '')}`;
                            window.open(urlWa, '_blank', 'noopener,noreferrer');
                        }}
                    >
                        Enviar por WhatsApp
                    </NeonButton>
                </DialogActions>
            </Dialog>

            {/* Modal definir login e senha do produtor */}
            <Dialog open={Boolean(modalAcessoProdutor)} onClose={() => setModalAcessoProdutor(null)} maxWidth="sm" fullWidth>
                <TituloModal
                    titulo="Definir login e senha do portal"
                    subtitulo={modalAcessoProdutor ? `Acesso isolado para ${modalAcessoProdutor.nome}` : ''}
                    onFechar={() => setModalAcessoProdutor(null)}
                />
                <DialogContent dividers>
                    {modalAcessoProdutor && (
                        <Stack spacing={2} sx={{ pt: 0.5 }}>
                            <TextField
                                fullWidth
                                size="small"
                                label="Login de acesso (e-mail ou usuário)"
                                value={formAcesso.login_acesso}
                                onChange={(e) => setFormAcesso((prev) => ({ ...prev, login_acesso: e.target.value, salvo: null }))}
                            />
                            <TextField
                                fullWidth
                                size="small"
                                type={formAcesso.mostrar_senha ? 'text' : 'password'}
                                label="Senha de acesso (mínimo 6 caracteres)"
                                value={formAcesso.senha_acesso}
                                onChange={(e) => setFormAcesso((prev) => ({ ...prev, senha_acesso: e.target.value, salvo: null }))}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                size="small"
                                                aria-label="Alternar visibilidade da senha"
                                                onClick={() => setFormAcesso((prev) => ({ ...prev, mostrar_senha: !prev.mostrar_senha }))}
                                                edge="end"
                                            >
                                                {formAcesso.mostrar_senha ? <OcultoIcon fontSize="small" /> : <VisivelIcon fontSize="small" />}
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                                <Typography sx={{ fontSize: tamanhos.xs, color: cores.textoSecundario }}>
                                    Acesso exclusivo no portal separado (/portal-produtor), sem criar usuário no painel NZT.
                                </Typography>
                                <Button
                                    size="small"
                                    variant="outlined"
                                    startIcon={<GerarSenhaIcon />}
                                    onClick={() => setFormAcesso((prev) => ({
                                        ...prev,
                                        senha_acesso: gerarSenhaForte(),
                                        mostrar_senha: true,
                                        salvo: null
                                    }))}
                                    sx={botaoSecundario}
                                >
                                    Gerar senha
                                </Button>
                            </Box>

                            {formAcesso.salvo && (
                                <Box sx={{ p: 1.5, borderRadius: 1.5, bgcolor: tom(funcao.liberado, 0.1), border: `1px solid ${tom(funcao.liberado, 0.35)}` }}>
                                    <Typography sx={{ fontSize: tamanhos.sm, fontWeight: 700, color: funcao.liberado, mb: 0.75 }}>
                                        Login ativado com sucesso
                                    </Typography>
                                    <TextField
                                        fullWidth
                                        multiline
                                        rows={4}
                                        size="small"
                                        label="Dados prontos para enviar ao produtor"
                                        value={formAcesso.salvo.mensagem_whatsapp}
                                        InputProps={{ readOnly: true }}
                                    />
                                </Box>
                            )}
                        </Stack>
                    )}
                </DialogContent>
                <DialogActions sx={{ px: 3, py: 2 }}>
                    <Button variant="outlined" onClick={() => setModalAcessoProdutor(null)} sx={botaoSecundario}>
                        Fechar
                    </Button>
                    {formAcesso.salvo ? (
                        <>
                            <Button
                                variant="outlined"
                                startIcon={<CopiarIcon />}
                                onClick={() => {
                                    navigator.clipboard?.writeText(formAcesso.salvo?.mensagem_whatsapp || '');
                                    enqueueSnackbar('Dados de login copiados para a área de transferência.', { variant: 'success' });
                                }}
                                sx={botaoSecundario}
                            >
                                Copiar dados de acesso
                            </Button>
                            <NeonButton
                                onClick={() => {
                                    const fone = String(formAcesso.salvo?.telefone || '').replace(/\D/g, '');
                                    const urlWa = `https://wa.me/${fone ? `55${fone}` : ''}?text=${encodeURIComponent(formAcesso.salvo?.mensagem_whatsapp || '')}`;
                                    window.open(urlWa, '_blank', 'noopener,noreferrer');
                                }}
                            >
                                Enviar acesso por WhatsApp
                            </NeonButton>
                        </>
                    ) : (
                        <NeonButton loading={salvando} onClick={handleDefinirAcesso}>
                            Salvar login e senha
                        </NeonButton>
                    )}
                </DialogActions>
            </Dialog>
        </Stack>
    );
};

export default AbaProdutoresPresenca;
