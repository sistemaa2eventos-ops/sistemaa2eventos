import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Stack,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Button,
  Grid,
  Stepper,
  Step,
  StepLabel,
  MenuItem,
  Alert
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Search as SearchIcon,
  Business as BusinessIcon,
  Link as LinkIcon,
  ContentCopy as CopyIcon,
  Assessment as QuotaIcon,
  InsertDriveFile as FileIcon,
  FileUpload as UploadIcon,
  CameraAlt as CameraIcon,
  WhatsApp as WhatsAppIcon,
  Email as EmailIcon,
  Check as CheckIcon,
  Tune as RegrasIcon
} from '@mui/icons-material';
import GlassCard from '../components/common/GlassCard';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import DataTable from '../components/common/DataTable';
import ConfirmDialog from '../components/common/ConfirmDialog';
import PhotoCapture from '../components/common/PhotoCapture';
import ListaDocumentos from '../components/documentos/ListaDocumentos';
import { useSearchParams } from 'react-router-dom';
import { format } from 'date-fns';
import { useSnackbar } from 'notistack';
import { useEmpresas } from '../hooks/useEmpresas';
import api from '../services/api';
import { useConfirmacao } from '../contexts/ConfirmacaoContext';
import TituloModal from '../components/common/TituloModal';
import { acaoTabela, acaoTabelaPerigo, botaoSecundario } from '../styles/tokens';
import { formatarCnpj } from '../utils/formatadores';
import { useRemuneracao } from '../hooks/useRemuneracao';
import RegrasRemuneracaoDialog from '../components/remuneracao/RegrasRemuneracaoDialog';
import RemuneracaoEmpresa from '../components/remuneracao/RemuneracaoEmpresa';

const TIPOS_DOC_EMPRESA = [
  { valor: 'Cartão CNPJ', tipo: 'CNPJ' },
  { valor: 'Contrato Social / Ato Constitutivo', tipo: 'CONTRATO_SOCIAL' },
  { valor: 'Alvará de Funcionamento', tipo: 'ALVARA' },
  { valor: 'PGR / PPRA', tipo: 'PGR' },
  { valor: 'PCMSO', tipo: 'PCMSO' },
  { valor: 'ART / RRT / Laudo Técnico', tipo: 'ART_RRT' },
  { valor: 'Apólice de Seguro', tipo: 'SEGURO' },
  { valor: 'GFIP / FGTS / Relação de Funcionários', tipo: 'GFIP_FGTS' },
  { valor: 'Outro documento', tipo: 'CORPORATIVO' }
];

const Empresas = () => {
    const confirmar = useConfirmacao();
  const { enqueueSnackbar } = useSnackbar();
  const [searchParams] = useSearchParams();
  const eventoIdParam = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [empresaToDelete, setEmpresaToDelete] = useState(null);
  const [openQuotaDialog, setOpenQuotaDialog] = useState(false);
  const [openInviteDialog, setOpenInviteDialog] = useState(false);
  const [inviteResult, setInviteResult] = useState({ link: '', linkDocumentos: '', empresa: null });
  const [enviandoEmailConvite, setEnviandoEmailConvite] = useState(false);
  const [activePhaseTabEmpresa, setActivePhaseTabEmpresa] = useState('todas');
  const [openRegras, setOpenRegras] = useState(false);
  const [openDocsEmpresaDialog, setOpenDocsEmpresaDialog] = useState(false);
  const [empresaDocsAlvo, setEmpresaDocsAlvo] = useState(null);
  const [openCameraDocEmpresa, setOpenCameraDocEmpresa] = useState(false);
  const [docTipoSelecionado, setDocTipoSelecionado] = useState('Cartão CNPJ');
  const [docTituloCustom, setDocTituloCustom] = useState('');
  const [docValidade, setDocValidade] = useState('');
  const remuneracao = useRemuneracao();
  // Só manda os campos de remuneração quando a tabela existe (antes da migration o update falharia)
  const camposRemuneracao = (empresa = {}) => remuneracao.disponivel
    ? { regra_remuneracao_id: empresa.regra_remuneracao_id || null, regras_por_funcao: empresa.regras_por_funcao || {} }
    : {};

  useEffect(() => {
    if (eventoIdParam && eventoIdParam !== 'undefined' && eventoIdParam !== 'null') {
      localStorage.setItem('active_evento_id', eventoIdParam);
    }
  }, [eventoIdParam]);

  const {
      empresas, loading, saving, search, setSearch,
      page, setPage, rowsPerPage, setRowsPerPage, total,
      openDialog, setOpenDialog, selectedEmpresa, setSelectedEmpresa,
      activeEvent, dailyQuotas, setDailyQuotas,
      activeStep, setActiveStep, documentos,
      formData, setFormData, handleSave, handleDelete, handleSaveQuotas,
      handleAuditDocument, handleUploadDocumentoEmpresa, handleUploadWebcamEmpresa,
      handleSelectAllDatesEmpresa, handleClearAllDatesEmpresa,
      handleSelectAllPhaseEmpresa, handleClearPhaseEmpresa, loadDocumentos, loadEmpresas
  } = useEmpresas(eventoIdParam);

  // Ao criar nova empresa não exige documentação (2 etapas); ao editar empresa exibe as 3 etapas
  const steps = selectedEmpresa
    ? ['Dados cadastrais', 'Configurações', 'Documentos']
    : ['Dados cadastrais', 'Configurações'];

  const obterMetadadosDocEmpresa = () => {
    const item = TIPOS_DOC_EMPRESA.find(t => t.valor === docTipoSelecionado) || TIPOS_DOC_EMPRESA[0];
    const titulo = docTipoSelecionado === 'Outro documento'
      ? (docTituloCustom.trim() || 'Documento da Empresa')
      : item.valor;
    return { titulo, tipo_doc: item.tipo, data_validade: docValidade || '' };
  };

  const handleOpenDocsEmpresa = (empresa) => {
    setEmpresaDocsAlvo(empresa);
    setDocTipoSelecionado('Cartão CNPJ');
    setDocTituloCustom('');
    setDocValidade('');
    loadDocumentos(empresa.id);
    setOpenDocsEmpresaDialog(true);
  };

  const handleSelecionarArquivoEmpresa = (empresaId) => {
    if (!empresaId) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/pdf,image/jpeg,image/png';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const ok = await handleUploadDocumentoEmpresa(empresaId, file, obterMetadadosDocEmpresa());
      if (ok) {
        setDocTituloCustom('');
        setDocValidade('');
      }
    };
    input.click();
  };

  const renderPainelDocumentosEmpresa = (empresaAlvo) => {
    if (!empresaAlvo?.id) {
      return (
        <Typography color="text.secondary" sx={{ py: 4 }}>
          Salve a empresa primeiro para gerenciar os documentos.
        </Typography>
      );
    }

    const docsFormatados = (Array.isArray(documentos) ? documentos : []).map(d => ({
      ...d,
      tipo_entidade: 'empresa',
      entidade_nome: empresaAlvo.nome,
      entidade_doc: empresaAlvo.cnpj
    }));

    return (
      <Box sx={{ textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 2.5 }}>
        <Alert severity="info" sx={{ bgcolor: 'rgba(0, 212, 255, 0.08)', color: '#E2E8F0', border: '1px solid rgba(0, 212, 255, 0.25)' }}>
          Os documentos anexados aqui ou enviados pelo responsável através do link da empresa entram na fila de <strong>Auditoria documental</strong> e são salvos automaticamente na pasta <strong>{empresaAlvo.nome} / Documentos da empresa</strong> no Google Drive.
        </Alert>

        <Box sx={{ p: { xs: 2, sm: 2.5 }, border: '1px dashed rgba(0, 212, 255, 0.35)', borderRadius: 2, bgcolor: 'rgba(0,0,0,0.2)' }}>
          <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 700, mb: 2 }}>
            Anexar novo documento da empresa
          </Typography>

          <Grid container spacing={2} sx={{ mb: 2 }}>
            <Grid item xs={12} sm={docTipoSelecionado === 'Outro documento' ? 4 : 7}>
              <TextField
                select
                size="small"
                label="Tipo de documento"
                fullWidth
                value={docTipoSelecionado}
                onChange={(e) => setDocTipoSelecionado(e.target.value)}
              >
                {TIPOS_DOC_EMPRESA.map((t) => (
                  <MenuItem key={t.valor} value={t.valor}>{t.valor}</MenuItem>
                ))}
              </TextField>
            </Grid>

            {docTipoSelecionado === 'Outro documento' && (
              <Grid item xs={12} sm={4}>
                <TextField
                  size="small"
                  label="Nome do documento"
                  placeholder="Ex: Certidão Negativa"
                  fullWidth
                  value={docTituloCustom}
                  onChange={(e) => setDocTituloCustom(e.target.value)}
                />
              </Grid>
            )}

            <Grid item xs={12} sm={docTipoSelecionado === 'Outro documento' ? 4 : 5}>
              <TextField
                size="small"
                type="date"
                label="Validade (opcional)"
                InputLabelProps={{ shrink: true }}
                fullWidth
                value={docValidade}
                onChange={(e) => setDocValidade(e.target.value)}
              />
            </Grid>
          </Grid>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
            <Button
              variant="contained"
              disabled={saving}
              startIcon={<UploadIcon />}
              onClick={() => handleSelecionarArquivoEmpresa(empresaAlvo.id)}
              sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700, '&:hover': { bgcolor: '#00B8E6' } }}
            >
              Anexar arquivo (PDF / imagem)
            </Button>
            <Button
              variant="contained"
              disabled={saving}
              startIcon={<CameraIcon />}
              onClick={() => {
                setEmpresaDocsAlvo(empresaAlvo);
                setOpenCameraDocEmpresa(true);
              }}
              sx={{ bgcolor: '#7B2FBE', color: '#FFFFFF', fontWeight: 700, '&:hover': { bgcolor: '#6924A8' } }}
            >
              Tirar foto com a câmera
            </Button>
          </Stack>
        </Box>

        <Box>
          <Typography variant="subtitle2" sx={{ color: '#FFFFFF', fontWeight: 700, mb: 1.5 }}>
            Documentos enviados ({docsFormatados.length})
          </Typography>
          <ListaDocumentos
            documentos={docsFormatados}
            onAuditar={(doc, acao) => handleAuditDocument(doc.id, acao, empresaAlvo.id)}
          />
        </Box>
      </Box>
    );
  };

  const columns = [
    {
      id: 'nome',
      label: 'Empresa',
      minWidth: 200,
      format: (val) => (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <BusinessIcon sx={{ color: '#00D4FF', fontSize: 20 }} />
          <Typography variant="body2" sx={{ fontWeight: 700 }}>{val}</Typography>
        </Box>
      )
    },
    { id: 'cnpj', label: 'CNPJ', minWidth: 170, format: (value) => formatarCnpj(value) },
    { id: 'max_colaboradores', label: 'Cota base', minWidth: 100 },
    {
      id: 'acoes',
      label: 'Ações',
      minWidth: 150,
      align: 'center',
      format: (value, row) => (
        <Stack direction="row" spacing={1} justifyContent="center">
          <IconButton
            size="small"
            onClick={() => handleGerarConvite(row)}
            sx={acaoTabela}
            title="Gerar convite de cadastro"
          >
            <LinkIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleOpenDocsEmpresa(row)}
            sx={acaoTabela}
            title="Documentos da empresa (upload ou câmera)"
          >
            <FileIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
                setSelectedEmpresa(row);
                setOpenQuotaDialog(true);
            }}
            sx={acaoTabela}
            title="Gerenciar cotas diárias"
          >
            <QuotaIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => handleOpenEdit(row)}
            sx={acaoTabela}
            title="Editar"
          >
            <EditIcon fontSize="small" />
          </IconButton>
          <IconButton
            size="small"
            onClick={() => {
                setEmpresaToDelete(row.id);
                setOpenDeleteConfirm(true);
            }}
            sx={acaoTabelaPerigo}
            title="Excluir"
          >
            <DeleteIcon fontSize="small" />
          </IconButton>
        </Stack>
      ),
    },
  ];

  const handleGerarConvite = async (row, forceRefresh = false) => {
    try {
      const publicUrl = 'https://cadastro.nzt.app.br';
      // Se já tem token e não estamos forçando refresh, apenas mostra o que tem
      if (row.registration_token && !forceRefresh) {
        const link = `${publicUrl}/register/${row.registration_token}`;
        const linkDocumentos = `${publicUrl}/empresa/${row.registration_token}`;
        setInviteResult({ link, linkDocumentos, empresa: row });
        setOpenInviteDialog(true);
        return;
      }

      // Sem token (ou pedindo um novo): gera pelo refresh-token; o link antigo deixa de valer
      const { data } = await api.post(`/empresas/${row.id}/refresh-token`);
      const link = `${publicUrl}/register/${data.token}`;
      const linkDocumentos = `${publicUrl}/empresa/${data.token}`;
      setInviteResult({ link, linkDocumentos, empresa: { ...row, registration_token: data.token } });
      setOpenInviteDialog(true);
      loadEmpresas();

      try {
        await navigator.clipboard.writeText(link);
        enqueueSnackbar('Novo link gerado e copiado!', { variant: 'success' });
      } catch {
        enqueueSnackbar('Novo link gerado.', { variant: 'success' });
      }
    } catch (err) {
      enqueueSnackbar('Erro ao processar convite.', { variant: 'error' });
    }
  };

  const buildMailto = () => {
    if (!inviteResult.empresa) return '';
    const eventoNome = localStorage.getItem('active_evento_nome') || 'Evento';
    const empresaNome = inviteResult.empresa.nome;
    const responsavel = inviteResult.empresa.responsavel || 'Responsável';
    const linkDocs = inviteResult.linkDocumentos || inviteResult.link.replace('/register/', '/empresa/');
    
    const subject = encodeURIComponent(`Portal de Credenciamento e Documentação - ${empresaNome} (${eventoNome})`);
    const body = encodeURIComponent(
      `Olá, ${responsavel}!\n\n` +
      `Confirmamos que a empresa ${empresaNome} foi cadastrada no evento ${eventoNome}.\n\n` +
      `1) DOCUMENTAÇÃO DA EMPRESA (Responsável):\n` +
      `Acesse o link abaixo para anexar os documentos da empresa (Cartão CNPJ, Contrato Social, PGR, PCMSO, Alvará, etc.) para auditoria:\n` +
      `${linkDocs}\n\n` +
      `2) CADASTRO DA EQUIPE / COLABORADORES:\n` +
      `Utilize ou compartilhe o link abaixo com seus colaboradores para o credenciamento facial da equipe:\n` +
      `${inviteResult.link}\n\n` +
      `Atenciosamente,\n` +
      `Equipe de Credenciamento.`
    );
    
    return `mailto:${inviteResult.empresa.email_convite || inviteResult.empresa.email || ''}?subject=${subject}&body=${body}`;
  };

  const buildWhatsappLink = () => {
    if (!inviteResult.empresa) return '';
    const eventoNome = localStorage.getItem('active_evento_nome') || 'Evento';
    const empresaNome = inviteResult.empresa.nome;
    const responsavel = inviteResult.empresa.responsavel || 'Responsável';
    const telefone = inviteResult.empresa.telefone || inviteResult.empresa.responsavel_telefone || '';
    const cleanPhone = telefone.replace(/\D/g, '');
    let waPhone = cleanPhone;
    if (waPhone && waPhone.length <= 11 && !waPhone.startsWith('55')) {
      waPhone = `55${waPhone}`;
    }
    const linkDocs = inviteResult.linkDocumentos || inviteResult.link.replace('/register/', '/empresa/');
    
    const body = encodeURIComponent(
      `Olá, *${responsavel}*!\n\n` +
      `Sua empresa *${empresaNome}* foi cadastrada para o evento *${eventoNome}*.\n\n` +
      `📄 *1. Enviar documentos da empresa (Responsável):*\n` +
      `${linkDocs}\n\n` +
      `👥 *2. Cadastrar colaboradores da equipe:*\n` +
      `${inviteResult.link}`
    );
    
    return `https://wa.me/${waPhone}?text=${body}`;
  };

  const handleEnviarConvitePorEmail = async () => {
    if (!inviteResult.empresa) return;
    const emailDestino = inviteResult.empresa.email_convite || inviteResult.empresa.email || '';
    if (!emailDestino) {
      window.location.href = buildMailto();
      return;
    }
    try {
      setEnviandoEmailConvite(true);
      const { data } = await api.post(`/empresas/${inviteResult.empresa.id}/send-invite`, { email: emailDestino });
      enqueueSnackbar(data.message || `E-mail enviado para ${emailDestino}!`, { variant: 'success' });
      setOpenInviteDialog(false);
    } catch (err) {
      // Se o servidor SMTP não responder, abre o cliente de e-mail padrão com a mensagem pronta
      window.location.href = buildMailto();
    } finally {
      setEnviandoEmailConvite(false);
    }
  };

  const getAllEventDates = () => {
    if (!activeEvent) return [];
    const allDates = [
      ...(activeEvent.datas_montagem || []),
      ...(activeEvent.datas_evento || []),
      ...(activeEvent.datas_desmontagem || [])
    ];
    return [...new Set(allDates)].sort();
  };

  const handleOpenEdit = (empresa) => {
      setActiveStep(0);
      setSelectedEmpresa(empresa);
      setFormData({
        nome: empresa.nome || '',
        cnpj: empresa.cnpj || '',
        servico: empresa.servico || empresa.tipo_operacao || '',
        email: empresa.email || '',
        telefone: empresa.telefone || '',
        email_convite: empresa.email_convite || '',
        responsavel: empresa.responsavel || empresa.responsavel_legal || '',
        observacao: empresa.observacao || '',
        registration_token: empresa.registration_token || '',
        max_colaboradores: empresa.max_colaboradores || 50,
        datas_presenca: Array.isArray(empresa.datas_presenca) && empresa.datas_presenca.length > 0 
          ? empresa.datas_presenca 
          : getAllEventDates(),
        ...camposRemuneracao(empresa)
      });
      setOpenDialog(true);
      loadDocumentos(empresa.id);
  };

  const handleNew = () => {
      setActiveStep(0);
      setSelectedEmpresa(null);
      setFormData({
        nome: '',
        cnpj: '',
        servico: '',
        email: '',
        telefone: '',
        email_convite: '',
        responsavel: '',
        observacao: '',
        registration_token: '',
        max_colaboradores: 50,
        datas_presenca: getAllEventDates(),
        ...camposRemuneracao()
      });
      setOpenDialog(true);
  };

  return (
    <Box sx={{ p: { xs: 2, md: 3 } }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', md: 'flex-start' }, mb: 3, gap: 2 }}>
        <PageHeader
          title="Empresas"
          subtitle={eventoIdParam ? `Filtrando empresas do evento: ${localStorage.getItem('active_evento_nome')}` : "Gerencie as entidades terceirizadas do ecossistema."}
          breadcrumbs={[{ text: 'Dashboard' }, { text: 'Empresas' }]}
        />
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} sx={{ mt: { xs: 0, md: 2 }, width: { xs: '100%', md: 'auto' } }}>
          <Button variant="outlined" startIcon={<RegrasIcon />} onClick={() => setOpenRegras(true)} sx={botaoSecundario}>
            Regras de remuneração
          </Button>
          <NeonButton startIcon={<AddIcon />} onClick={handleNew}>
            Nova empresa
          </NeonButton>
        </Stack>
      </Box>

      <GlassCard glowColor="#00D4FF" sx={{ p: 3, mb: 3 }}>
        <TextField
          fullWidth
          size="small"
          placeholder="Buscar por nome, CNPJ ou serviço..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          InputProps={{
            startAdornment: <SearchIcon sx={{ color: 'rgba(255,255,255,0.4)', mr: 1, fontSize: 20 }} />,
            sx: { bgcolor: 'rgba(0,0,0,0.25)', borderRadius: 1.5, color: '#FFFFFF', fontSize: '0.875rem', mb: 2.5 }
          }}
        />

        <DataTable
          columns={columns}
          data={empresas}
          loading={loading}
          totalCount={total}
          page={page}
          onPageChange={setPage}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={setRowsPerPage}
          sx={{
            '& .MuiTableHead-root': { background: 'rgba(0,212,255,0.05)' },
            border: '1px solid rgba(0,212,255,0.05)'
          }}
        />
      </GlassCard>

      <Dialog 
        open={openDialog} 
        onClose={() => setOpenDialog(false)} 
        maxWidth="md" 
        fullWidth 
        disableRestoreFocus
        PaperProps={{
          sx: {
            // Abaixo de sm o tema já deixa o modal em tela cheia
            minHeight: { md: '80dvh' },
            maxHeight: { sm: 'calc(100dvh - 24px)', md: '90dvh' },
            height: { sm: 'calc(100dvh - 24px)', md: '88dvh' },
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
                    }
        }}
      >
        <TituloModal
          titulo={selectedEmpresa ? 'Editar empresa' : 'Nova empresa'}
          onFechar={() => setOpenDialog(false)}
          desabilitarFechar={saving}
        />
        <DialogContent sx={{ 
          p: { xs: 2.5, md: 3.5 }, 
          pr: { xs: 2, md: 2.5 }, 
          overflowY: 'auto', 
          flex: '1 1 auto',
          '&::-webkit-scrollbar': { width: '6px' }, 
          '&::-webkit-scrollbar-thumb': { background: 'rgba(0,212,255,0.4)', borderRadius: '10px' }, 
          '&::-webkit-scrollbar-track': { background: 'rgba(255,255,255,0.02)' } 
        }}>
          <Box sx={{ pr: { xs: 0, md: 0.5 }, display: 'flex', flexDirection: 'column' }}>
          <Stepper activeStep={activeStep} alternativeLabel sx={{ pt: 1, mb: 2.5 }}>
            {steps.map((label, idx) => (
              <Step key={label} onClick={() => selectedEmpresa && setActiveStep(idx)} sx={{ cursor: selectedEmpresa ? 'pointer' : 'default' }}>
                <StepLabel>{label}</StepLabel>
              </Step>
            ))}
          </Stepper>

          {activeStep === 0 && (
            <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 3 }}>
              <TextField label="Razão social" fullWidth value={formData.nome} onChange={(e) => setFormData({ ...formData, nome: e.target.value })} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField label="CNPJ" fullWidth value={formData.cnpj} onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })} />
                </Grid>
                <Grid item xs={6}>
                  <TextField label="Serviço prestado" fullWidth value={formData.servico} onChange={(e) => setFormData({ ...formData, servico: e.target.value })} />
                </Grid>
              </Grid>
              <TextField label="Responsável" fullWidth value={formData.responsavel} onChange={(e) => setFormData({ ...formData, responsavel: e.target.value })} />
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <TextField label="E-mail" fullWidth value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} />
                </Grid>
                <Grid item xs={6}>
                  <TextField label="Telefone" fullWidth value={formData.telefone} onChange={(e) => setFormData({ ...formData, telefone: e.target.value })} />
                </Grid>
              </Grid>
              <TextField sx={{ mt: 2 }} label="E-mail para o convite de cadastro" fullWidth value={formData.email_convite} onChange={(e) => setFormData({ ...formData, email_convite: e.target.value })} />
            </Box>
          )}

          {activeStep === 1 && (
            <Box sx={{ pt: 1, display: 'flex', flexDirection: 'column', gap: 2.5 }}>
              <Grid container spacing={2}>
                <Grid item xs={8}>
                  <TextField label="Link de cadastro da empresa" fullWidth disabled value={formData.registration_token} />
                </Grid>
                <Grid item xs={4}>
                  <TextField label="Cota máxima" type="number" fullWidth value={formData.max_colaboradores} onChange={(e) => setFormData({ ...formData, max_colaboradores: e.target.value })} />
                </Grid>
              </Grid>
              <TextField label="Observações" fullWidth multiline rows={2} value={formData.observacao} onChange={(e) => setFormData({ ...formData, observacao: e.target.value })} />

              <RemuneracaoEmpresa
                formData={formData}
                setFormData={setFormData}
                regras={remuneracao.regras}
                disponivel={remuneracao.disponivel}
                empresaId={selectedEmpresa?.id}
                carregarFuncoes={remuneracao.carregarFuncoes}
                onGerenciar={() => setOpenRegras(true)}
              />

              {activeEvent && formData && (
                <Box sx={{ display: 'flex', flexDirection: 'column', mt: 1 }}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5, flexWrap: 'wrap', gap: 1 }}>
                    <Box>
                      <Typography variant="subtitle2" sx={{ color: '#00D4FF', fontWeight: 700, letterSpacing: '0.5px' }}>
                        Dias permitidos para acesso (terceirizados)
                      </Typography>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)', display: 'block' }}>
                        Define as datas autorizadas para os colaboradores vinculados a esta empresa.
                      </Typography>
                    </Box>
                    <Stack direction="row" spacing={1}>
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={handleSelectAllDatesEmpresa} 
                        sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#00FF88', borderColor: 'rgba(0,255,136,0.3)', py: 0.3, px: 1.5, '&:hover': { borderColor: '#00FF88', bgcolor: 'rgba(0,255,136,0.08)' } }}
                      >
                        Marcar todos
                      </Button>
                      <Button 
                        size="small" 
                        variant="outlined" 
                        onClick={handleClearAllDatesEmpresa} 
                        sx={{ fontSize: '0.75rem', fontWeight: 700, color: '#FF3366', borderColor: 'rgba(255,51,102,0.3)', py: 0.3, px: 1.5, '&:hover': { borderColor: '#FF3366', bgcolor: 'rgba(255,51,102,0.08)' } }}
                      >
                        Limpar
                      </Button>
                    </Stack>
                  </Box>

                  {/* Botões de Navegação Direta de Fases para Empresas */}
                  <Stack direction="row" spacing={1} sx={{ mb: 1.5, flexWrap: 'wrap', gap: 0.5 }}>
                    {[
                      { id: 'todas', label: 'Todas as fases', color: '#00D4FF' },
                      { id: 'montagem', label: 'Montagem', color: '#00D4FF' },
                      { id: 'evento', label: 'Evento', color: '#00FF88' },
                      { id: 'desmontagem', label: 'Desmontagem', color: '#FFB800' }
                    ].map(tab => (
                      <Button
                        key={tab.id}
                        size="small"
                        variant={activePhaseTabEmpresa === tab.id ? 'contained' : 'outlined'}
                        onClick={() => setActivePhaseTabEmpresa(tab.id)}
                        sx={{
                          fontSize: '0.75rem',
                          fontWeight: 700,
                          letterSpacing: '0.5px',
                          color: activePhaseTabEmpresa === tab.id ? '#0a1628' : tab.color,
                          bgcolor: activePhaseTabEmpresa === tab.id ? tab.color : 'transparent',
                          borderColor: tab.color,
                          py: 0.3,
                          px: 1.3,
                          boxShadow: activePhaseTabEmpresa === tab.id ? `0 0 10px ${tab.color}40` : 'none',
                          '&:hover': {
                            bgcolor: activePhaseTabEmpresa === tab.id ? tab.color : 'rgba(255,255,255,0.06)'
                          }
                        }}
                      >
                        {tab.label}
                      </Button>
                    ))}
                  </Stack>
                  
                  <Box 
                    sx={{ 
                      minHeight: 220,
                      border: '1px solid rgba(0, 212, 255, 0.2)',
                      borderRadius: 1.5,
                      p: 2,
                      bgcolor: 'rgba(0,0,0,0.25)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 2
                    }}
                  >
                    {[
                      { id: 'montagem', label: 'Montagem', color: '#00D4FF', bg: 'rgba(0,212,255,0.04)', border: 'rgba(0,212,255,0.2)' },
                      { id: 'evento', label: 'Evento', color: '#00FF88', bg: 'rgba(0,255,136,0.04)', border: 'rgba(0,255,136,0.2)' },
                      { id: 'desmontagem', label: 'Desmontagem', color: '#FFB800', bg: 'rgba(255,184,0,0.05)', border: 'rgba(255,184,0,0.25)' }
                    ]
                      .filter(phase => activePhaseTabEmpresa === 'todas' || activePhaseTabEmpresa === phase.id)
                      .map(phase => {
                        const dates = (activeEvent && activeEvent[`datas_${phase.id}`]) || [];
                        if (!Array.isArray(dates) || dates.length === 0) return null;
                        const totalDates = dates.length;
                        const selectedCount = dates.filter(d => Array.isArray(formData?.datas_presenca) && formData.datas_presenca.includes(d)).length;

                        return (
                          <Box 
                            key={phase.id}
                            sx={{
                              p: 1.5,
                              borderRadius: 1.5,
                              bgcolor: phase.bg,
                              border: `1px solid ${phase.border}`
                            }}
                          >
                            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.2, flexWrap: 'wrap', gap: 1 }}>
                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                <Typography variant="caption" sx={{ color: phase.color, fontWeight: 700, letterSpacing: '1px', fontSize: '0.75rem' }}>
                                  {phase.label}
                                </Typography>
                                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.75rem' }}>
                                  ({selectedCount}/{totalDates} dias selecionados)
                                </Typography>
                              </Box>
                              <Stack direction="row" spacing={0.8}>
                                <Button 
                                  size="small" 
                                  onClick={() => handleSelectAllPhaseEmpresa ? handleSelectAllPhaseEmpresa(phase.id) : null}
                                  sx={{ fontSize: '0.75rem', fontWeight: 700, color: phase.color, py: 0.2, px: 1, minWidth: 'auto', border: `1px solid ${phase.border}`, '&:hover': { bgcolor: `${phase.border}` } }}
                                >
                                  Todos
                                </Button>
                                <Button 
                                  size="small" 
                                  onClick={() => handleClearPhaseEmpresa ? handleClearPhaseEmpresa(phase.id) : null}
                                  sx={{ fontSize: '0.75rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', py: 0.2, px: 1, minWidth: 'auto', border: '1px solid rgba(255,255,255,0.1)', '&:hover': { color: '#FF3366', borderColor: '#FF3366' } }}
                                >
                                  Limpar
                                </Button>
                              </Stack>
                            </Box>

                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                              {dates.map(date => {
                                const isChecked = Array.isArray(formData?.datas_presenca) && formData.datas_presenca.includes(date);
                                return (
                                  <Box
                                    key={date}
                                    onClick={() => {
                                      const currentDates = Array.isArray(formData?.datas_presenca) ? [...formData.datas_presenca] : [];
                                      const newDates = currentDates.includes(date)
                                        ? currentDates.filter(d => d !== date)
                                        : [...currentDates, date];
                                      setFormData({ ...formData, datas_presenca: newDates });
                                    }}
                                    sx={{
                                      cursor: 'pointer',
                                      userSelect: 'none',
                                      display: 'inline-flex',
                                      alignItems: 'center',
                                      gap: 0.8,
                                      px: 1.2,
                                      py: 0.6,
                                      borderRadius: 1.5,
                                      border: `1px solid ${isChecked ? phase.color : 'rgba(255,255,255,0.1)'}`,
                                      bgcolor: isChecked ? `${phase.color}18` : 'rgba(255,255,255,0.02)',
                                      boxShadow: isChecked ? `0 0 10px ${phase.color}30` : 'none',
                                      transition: 'all 0.15s ease',
                                      '&:hover': {
                                        borderColor: phase.color,
                                        bgcolor: `${phase.color}10`
                                      }
                                    }}
                                  >
                                    <Box sx={{
                                      width: 16,
                                      height: 16,
                                      borderRadius: 1,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      bgcolor: isChecked ? phase.color : 'transparent',
                                      border: `1px solid ${isChecked ? phase.color : 'rgba(255,255,255,0.3)'}`
                                    }}>
                                      {isChecked && <CheckIcon sx={{ fontSize: 13, color: '#0a1628', fontWeight: 700 }} />}
                                    </Box>
                                    <Typography variant="caption" sx={{ color: isChecked ? '#FFFFFF' : 'rgba(255,255,255,0.7)', fontWeight: isChecked ? 700 : 500, fontSize: '0.75rem' }}>
                                      {date ? format(new Date(date + 'T00:00:00'), "dd/MM") : '--/--'}
                                    </Typography>
                                  </Box>
                                );
                              })}
                            </Box>
                          </Box>
                        );
                      })}
                  </Box>
                </Box>
              )}
            </Box>
          )}

          {activeStep === 2 && selectedEmpresa && (
            <Box sx={{ pt: 2 }}>
              {renderPainelDocumentosEmpresa(selectedEmpresa)}
            </Box>
          )}
          </Box>
        </DialogContent>
        <DialogActions sx={{ p: 3, px: 6, justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.05)', bgcolor: 'rgba(10, 25, 41, 0.5)' }}>
          <Button variant="outlined" onClick={() => setOpenDialog(false)} disabled={saving} sx={botaoSecundario}>Cancelar</Button>
          <Box sx={{ display: 'flex', gap: 2 }}>
            {activeStep > 0 && <Button variant="outlined" onClick={() => setActiveStep(prev => prev - 1)} sx={botaoSecundario}>Voltar</Button>}
            {activeStep < steps.length - 1 ? (
              <NeonButton onClick={() => setActiveStep(prev => prev + 1)}>Próxima etapa</NeonButton>
            ) : (
              <NeonButton onClick={handleSave} loading={saving}>Finalizar & salvar</NeonButton>
            )}
          </Box>
        </DialogActions>
      </Dialog>

      <ConfirmDialog
        open={openDeleteConfirm}
        title="Remover empresa?"
        description="Esta ação desvinculará a empresa do ecossistema. Colaboradores vinculados serão mantidos, mas podem perder acesso a certas áreas."
        onConfirm={async () => {
            await handleDelete(empresaToDelete);
            setOpenDeleteConfirm(false);
        }}
        onClose={() => setOpenDeleteConfirm(false)}
      />

      <Dialog open={openQuotaDialog} onClose={() => setOpenQuotaDialog(false)} maxWidth="sm" fullWidth disableRestoreFocus>
        <TituloModal
          titulo="Cotas diárias"
          subtitulo={selectedEmpresa?.nome}
          onFechar={() => setOpenQuotaDialog(false)}
        />
        <DialogContent sx={{ p: 4 }}>
            {!activeEvent ? (
              <Typography color="error" variant="subtitle2">Nenhum evento ativo detectado.</Typography>
            ) : (
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                  <Typography variant="overline" sx={{ color: '#00D4FF', fontWeight: 700 }}>Planejamento diário</Typography>
                  <Button size="small" variant="outlined" onClick={() => {
                      const newQuotas = {};
                      getAllEventDates().forEach(d => newQuotas[d] = selectedEmpresa?.max_colaboradores ?? 50);
                      setDailyQuotas(newQuotas);
                  }}>Cota padrão</Button>
                </Box>
                <Box sx={{ maxHeight: 400, overflowY: 'auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2 }}>
                  {getAllEventDates().map(date => (
                    <Box key={date} sx={{ p: 2, bgcolor: 'rgba(0,0,0,0.2)', borderRadius: 1.5 }}>
                      <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.5)' }}>{date ? format(new Date(date + 'T00:00:00'), "dd/MM") : '--/--'}</Typography>
                      <TextField size="small" type="number" fullWidth value={dailyQuotas[date] || 0} onChange={(e) => setDailyQuotas({ ...dailyQuotas, [date]: parseInt(e.target.value) || 0 })} />
                    </Box>
                  ))}
                </Box>
              </Box>
            )}
        </DialogContent>
        <DialogActions sx={{ p: 3, borderTop: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <Button variant="outlined" onClick={() => setOpenQuotaDialog(false)} sx={botaoSecundario}>Cancelar</Button>
          <NeonButton onClick={async () => {
              if (await handleSaveQuotas()) setOpenQuotaDialog(false);
          }}>Salvar cotas</NeonButton>
        </DialogActions>
      </Dialog>
      <Dialog open={openInviteDialog} onClose={() => setOpenInviteDialog(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ fontWeight: 700, textAlign: 'center' }}>Links da empresa gerados</DialogTitle>
        <DialogContent sx={{ py: 2.5 }}>
          <Typography variant="body2" sx={{ mb: 2.5, color: 'text.secondary', textAlign: 'center' }}>
            Compartilhe os links abaixo com o responsável da empresa <strong>{inviteResult.empresa?.nome}</strong>:
          </Typography>

          <Box sx={{ p: 2, bgcolor: 'rgba(123, 47, 190, 0.08)', border: '1px solid rgba(123, 47, 190, 0.3)', borderRadius: 1.5, mb: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, gap: 1 }}>
              <Typography variant="caption" sx={{ color: '#C084FC', fontWeight: 700 }}>
                1. Link para anexar documentos da empresa (Responsável)
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CopyIcon fontSize="small" />}
                onClick={() => {
                  const docLink = inviteResult.linkDocumentos || inviteResult.link.replace('/register/', '/empresa/');
                  navigator.clipboard.writeText(docLink);
                  enqueueSnackbar('Link de documentos da empresa copiado!', { variant: 'success' });
                }}
                sx={{ borderColor: 'rgba(192,132,252,0.4)', color: '#C084FC', fontSize: '0.72rem', py: 0.2 }}
              >
                Copiar
              </Button>
            </Box>
            <Typography variant="caption" sx={{ color: '#FFFFFF', wordBreak: 'break-all', display: 'block' }}>
              {inviteResult.linkDocumentos || inviteResult.link.replace('/register/', '/empresa/')}
            </Typography>
          </Box>

          <Box sx={{ p: 2, bgcolor: 'rgba(0, 212, 255, 0.06)', border: '1px solid rgba(0, 212, 255, 0.25)', borderRadius: 1.5, mb: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5, gap: 1 }}>
              <Typography variant="caption" sx={{ color: '#00D4FF', fontWeight: 700 }}>
                2. Link para cadastro de colaboradores (Equipe)
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={<CopyIcon fontSize="small" />}
                onClick={() => {
                  navigator.clipboard.writeText(inviteResult.link);
                  enqueueSnackbar('Link de cadastro de colaboradores copiado!', { variant: 'success' });
                }}
                sx={{ borderColor: 'rgba(0,212,255,0.4)', color: '#00D4FF', fontSize: '0.72rem', py: 0.2 }}
              >
                Copiar
              </Button>
            </Box>
            <Typography variant="caption" sx={{ color: '#FFFFFF', wordBreak: 'break-all', display: 'block' }}>
              {inviteResult.link}
            </Typography>
          </Box>

          <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} justifyContent="center">
            <Button 
                variant="outlined" 
                startIcon={<WhatsAppIcon />}
                component="a"
                href={buildWhatsappLink()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setOpenInviteDialog(false)}
                sx={{ borderColor: '#25D366', color: '#25D366', fontWeight: 700, '&:hover': { bgcolor: 'rgba(37, 211, 102, 0.1)', borderColor: '#25D366' } }}
            >
                Enviar no WhatsApp
            </Button>
            
            <Button 
                variant="contained" 
                color="primary"
                disabled={enviandoEmailConvite}
                startIcon={<EmailIcon />}
                onClick={handleEnviarConvitePorEmail}
                sx={{ bgcolor: '#00D4FF', color: '#000000', fontWeight: 700 }}
            >
                {enviandoEmailConvite ? 'Enviando e-mail...' : 'Enviar para o e-mail do responsável'}
            </Button>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
            <Button 
                size="small"
                onClick={async () => {
                    const ok = await confirmar({ titulo: 'Gerar novo link', mensagem: 'Os links atuais deixam de funcionar. Gerar novos?', textoConfirmar: 'Gerar novos links', perigo: false });
                    if (ok) handleGerarConvite(inviteResult.empresa, true);
                }}
                sx={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.75rem' }}
            >
                Reciclar links
            </Button>
            <Button variant="outlined" onClick={() => setOpenInviteDialog(false)} sx={botaoSecundario}>Fechar</Button>
        </DialogActions>
      </Dialog>

      {/* Modal rápido de Documentos da Empresa (acessível pelo ícone na coluna Ações) */}
      <Dialog
        open={openDocsEmpresaDialog}
        onClose={() => setOpenDocsEmpresaDialog(false)}
        maxWidth="md"
        fullWidth
        disableRestoreFocus
      >
        <TituloModal
          titulo="Documentos da empresa"
          subtitulo={empresaDocsAlvo?.nome}
          onFechar={() => setOpenDocsEmpresaDialog(false)}
          desabilitarFechar={saving}
        />
        <DialogContent sx={{ p: { xs: 2.5, md: 3.5 } }}>
          {renderPainelDocumentosEmpresa(empresaDocsAlvo)}
        </DialogContent>
        <DialogActions sx={{ p: 2.5, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
          <Button variant="outlined" onClick={() => setOpenDocsEmpresaDialog(false)} sx={botaoSecundario}>
            Fechar
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de câmera para fotografar documento da empresa */}
      <Dialog
        open={openCameraDocEmpresa}
        onClose={() => setOpenCameraDocEmpresa(false)}
        maxWidth="sm"
        fullWidth
      >
        <TituloModal
          titulo="Fotografar documento da empresa"
          subtitulo={empresaDocsAlvo?.nome || selectedEmpresa?.nome}
          onFechar={() => setOpenCameraDocEmpresa(false)}
        />
        <DialogContent sx={{ overflowY: 'auto', py: 2 }}>
          <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.65)', display: 'block', textAlign: 'center', mb: 1.5 }}>
            Enquadre o documento ({obterMetadadosDocEmpresa().titulo}) de forma nítida e clique no botão verde para capturar.
          </Typography>
          <PhotoCapture
            modoDocumento={true}
            autoOpen={true}
            onPhotoCaptured={async (base64) => {
              if (!base64) return;
              const alvoId = empresaDocsAlvo?.id || selectedEmpresa?.id;
              const ok = await handleUploadWebcamEmpresa(alvoId, base64, obterMetadadosDocEmpresa());
              if (ok) {
                setOpenCameraDocEmpresa(false);
                setDocTituloCustom('');
                setDocValidade('');
              }
            }}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button variant="outlined" onClick={() => setOpenCameraDocEmpresa(false)} sx={botaoSecundario}>
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>
      <RegrasRemuneracaoDialog
        open={openRegras}
        onClose={() => setOpenRegras(false)}
        regras={remuneracao.regras}
        disponivel={remuneracao.disponivel}
        salvarRegra={remuneracao.salvarRegra}
        excluirRegra={remuneracao.excluirRegra}
      />
    </Box>
  );
};

export default Empresas;
