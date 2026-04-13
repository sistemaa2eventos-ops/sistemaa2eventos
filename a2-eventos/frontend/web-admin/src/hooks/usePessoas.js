import { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSnackbar } from 'notistack';
import api from '../services/api';
import { format } from 'date-fns';

export const usePessoas = () => {
    // Hooks
    const [searchParams] = useSearchParams();
    const { user } = useAuth();
    const { enqueueSnackbar } = useSnackbar();
    const searchTimerRef = useRef(null);

    // Params
    const eventoIdParam = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
    const isAdmin = user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'master' || user?.nivel_acesso === 'supervisor';
    const isEmpresa = user?.nivel_acesso === 'empresa';

    // States
    const [pessoas, setPessoas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [deleteLoading, setDeleteLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [totalCount, setTotalCount] = useState(0);
    const [limit, setLimit] = useState(50);
    const [statusFilter, setStatusFilter] = useState('TODOS');
    
    const [openDialog, setOpenDialog] = useState(false);
    const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
    const [pessoaToDelete, setPessoaToDelete] = useState(null);
    const [selectedPessoa, setSelectedPessoa] = useState(null);
    
    const [empresas, setEmpresas] = useState([]);
    const [activeEvent, setActiveEvent] = useState(null);
    const [openImport, setOpenImport] = useState(false);
    const [importLoading, setImportLoading] = useState(false);
    
    const [activeStep, setActiveStep] = useState(0);
    const [documentos, setDocumentos] = useState([]);
    const [openDocsDialog, setOpenDocsDialog] = useState(false);
    const [selectedPessoaDocs, setSelectedPessoaDocs] = useState(null);

    const [openBlockDialog, setOpenBlockDialog] = useState(false);
    const [blockJustification, setBlockJustification] = useState('');
    const [pessoaToBlock, setPessoaToBlock] = useState(null);
    const [isBlocking, setIsBlocking] = useState(true);
    const [blockLoading, setBlockLoading] = useState(false);
    const [expulsionLoading, setExpulsionLoading] = useState(false);

    const [formData, setFormData] = useState({
      nome: '', nome_credencial: '', cpf: '', passaporte: '', telefone: '', nome_mae: '', data_nascimento: '',
      funcao: '', empresa_id: '', tipo_pessoa: 'colaborador', foto_url: '', dias_trabalho: [], trabalho_area_tecnica: false,
      trabalho_altura: false, pagamento_validado: false, aceite_lgpd: false
    });

    const [openWebcamECM, setOpenWebcamECM] = useState(false);
    const [currentECMEntityId, setCurrentECMEntityId] = useState(null);

    const steps = ['Dados Biométricos & Pessoais', 'Escopo de Atuação', 'Gestão de Risco & ECM'];

    // Handlers
    const loadPessoas = async () => {
      try {
        setLoading(true);
        let response;
        if (search && search.trim().length >= 2) {
          response = await api.get('/pessoas/search', { 
            params: { q: search.trim(), page, limit, status: statusFilter === 'TODOS' ? undefined : statusFilter } 
          });
        } else {
          response = await api.get('/pessoas', { 
            params: { 
              evento_id: eventoIdParam,
              page,
              limit,
              status: statusFilter === 'TODOS' ? undefined : statusFilter
            }
          });
        }
        
        const resData = response.data.data || response.data; // Handle different wrapper styles
        setPessoas(resData.data || []);
        setTotalPages(resData.pages || 1);
        setTotalCount(resData.total || 0);
      } catch (error) {
        enqueueSnackbar('Erro ao carregar lista de pessoas.', { variant: 'error' });
      } finally { setLoading(false); }
    };

    const loadInitialData = async () => {
      try {
        const [evRes, empRes] = await Promise.all([ api.get('/eventos'), api.get('/empresas') ]);
        const event = evRes.data.data.find(e => e.id === eventoIdParam) || evRes.data.data.find(e => e.status === 'ativo') || evRes.data.data[0];
        setActiveEvent(event);
        setEmpresas(empRes.data.data || []);
      } catch (error) {
        enqueueSnackbar('Erro ao carregar dados iniciais.', { variant: 'error' });
      }
    };

    const loadDocumentos = async (pessoaId) => {
      try {
        const resp = await api.get(`/documentos/pessoa/${pessoaId}`);
        setDocumentos(resp.data.data || []);
      } catch (e) {
        enqueueSnackbar('Erro ao carregar documentos.', { variant: 'error' });
      }
    };

    // Effects
    useEffect(() => { loadInitialData(); }, []);

    useEffect(() => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setPage(1); // Reset page on search
        loadPessoas();
      }, 400);
      return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [search]);

    useEffect(() => {
      loadPessoas();
    }, [page, limit, statusFilter]);

    useEffect(() => { 
        if (openDialog && selectedPessoa) { 
            loadDocumentos(selectedPessoa.id); 
        } 
    }, [openDialog, selectedPessoa]);

    // Functions
    const handleOpenBlock = (pessoa) => {
      setPessoaToBlock(pessoa);
      setIsBlocking(!pessoa.bloqueado);
      setBlockJustification('');
      setOpenBlockDialog(true);
    };

    const handleConfirmBlock = async () => {
      if (!blockJustification) { enqueueSnackbar('Justificativa é obrigatória.', { variant: 'warning' }); return; }
      try {
        setBlockLoading(true);
        await api.post(`/pessoas/${pessoaToBlock.id}/bloqueio`, { 
            acao: isBlocking ? 'bloquear' : 'desbloquear', 
            justificativa: blockJustification 
        });
        enqueueSnackbar(`Participante ${isBlocking ? 'bloqueado' : 'desbloqueado'} com sucesso.`, { variant: 'success' });
        setOpenBlockDialog(false);
        loadPessoas();
      } catch (error) { 
          enqueueSnackbar('Erro ao processar solicitação de bloqueio.', { variant: 'error' }); 
      } finally { setBlockLoading(false); }
    };

    const handleExpulsar = async (pessoa) => {
      const motivo = window.prompt(`Motivo da expulsão de ${pessoa.nome}:`);
      if (!motivo) return;
      try {
        setExpulsionLoading(true);
        await api.post(`/access/expulsar/${pessoa.id}`, { motivo, dispositivo_id: 'web-dashboard' });
        enqueueSnackbar(`${pessoa.nome} foi expulso(a) do evento.`, { variant: 'warning' });
        loadPessoas();
      } catch (error) { 
          enqueueSnackbar(error.response?.data?.error || 'Erro.', { variant: 'error' }); 
      } finally { setExpulsionLoading(false); }
    };

    const handleOpenDocs = (pessoa) => {
      setSelectedPessoaDocs(pessoa);
      setOpenDocsDialog(true);
      loadDocumentos(pessoa.id);
    };

    const handleOpenDialog = (pessoa = null) => {
      setActiveStep(0);
      if (pessoa) {
        setSelectedPessoa(pessoa);
        setFormData({
          ...pessoa,
          data_nascimento: pessoa.data_nascimento ? format(new Date(pessoa.data_nascimento), "yyyy-MM-dd") : '',
          tipo_pessoa: pessoa.tipo_pessoa || pessoa.categoria_operacional || '',
          dias_trabalho: Array.isArray(pessoa.dias_trabalho) ? pessoa.dias_trabalho : [],
        });
      } else {
        setSelectedPessoa(null);
        setFormData({
          nome: '', nome_credencial: '', cpf: '', passaporte: '', telefone: '', nome_mae: '', data_nascimento: '', funcao: '', tipo_pessoa: 'colaborador',
          email: '', // Campo novo necessário para convites
          empresa_id: isEmpresa ? user?.empresa_id : '', 
          foto_url: '', dias_trabalho: [], trabalho_area_tecnica: false, trabalho_altura: false, pagamento_validado: false, parecer_documentos: 'pendente'
        });
        setDocumentos([]);
      }
      setOpenDialog(true);
    };

    const handleCloseDialog = () => { setOpenDialog(false); setSelectedPessoa(null); };

    const handleSave = async () => {
      if (!formData.nome || !formData.empresa_id) { enqueueSnackbar('Nome e Empresa são obrigatórios.', {variant: 'error'}); return; }
      try {
        setSaving(true);
        let payload = { ...formData };
        if (payload.foto_url && payload.foto_url.startsWith('data:image') && payload.cpf) {
          try {
            const { data: urlData } = await api.post('/pessoas/generate-upload-url', { cpf: payload.cpf });
            if (urlData.success && urlData.uploadUrl) {
              const base64Data = payload.foto_url.split(',')[1];
              const arr = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
              const blob = new Blob([arr], { type: 'image/jpeg' });
              const uploadRes = await fetch(urlData.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
              if (uploadRes.ok) payload.foto_url = urlData.publicUrl || urlData.path;
            }
          } catch (e) {
            // Silenciar erro em produção
          }
        }
        if (selectedPessoa) {
          await api.put(`/pessoas/${selectedPessoa.id}`, payload);
          if (selectedPessoa.status === 'PENDENTE' || selectedPessoa.status_acesso === 'pendente') {
            if (payload.parecer_documentos === 'completo') {
              await api.patch(`/pessoas/${selectedPessoa.id}/status`, { status: 'ATIVO' });
              enqueueSnackbar('Cadastro aprovado com sucesso!', { variant: 'success' });
            } else if (payload.parecer_documentos === 'incorreto') {
              await api.patch(`/pessoas/${selectedPessoa.id}/status`, { status: 'REJEITADO' });
              enqueueSnackbar('Cadastro rejeitado.', { variant: 'warning' });
            }
          }
        }
        else await api.post('/pessoas', payload);
        handleCloseDialog();
        loadPessoas();
      } catch (error) {
        enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar pessoa.', { variant: 'error' });
      } finally { setSaving(false); }
    };

    const handleDateToggle = (date) => {
      const current = Array.isArray(formData.dias_trabalho) ? [...formData.dias_trabalho] : [];
      const index = current.indexOf(date);
      if (index === -1) current.push(date); else current.splice(index, 1);
      setFormData({ ...formData, dias_trabalho: current });
    };

    const handleDelete = (id) => { setPessoaToDelete(id); setOpenDeleteConfirm(true); };

    const confirmDelete = async () => {
      try {
        setDeleteLoading(true);
        await api.delete(`/pessoas/${pessoaToDelete}`);
        setOpenDeleteConfirm(false); setPessoaToDelete(null); loadPessoas();
      } catch (error) { 
          enqueueSnackbar('Falha ao desativar registro.', { variant: 'error' }); 
      } finally { setDeleteLoading(false); }
    };

    const handleNextStep = async () => {
      if (activeStep === 0 && !selectedPessoa) {
        if (!formData.nome || !formData.empresa_id) { enqueueSnackbar('Preencha Nome e Empresa.', { variant: 'warning' }); return; }
        try {
          setSaving(true);
          const response = await api.post('/pessoas', { ...formData, status_acesso: 'pendente' });
          if (response.data.success) {
            const savedPessoa = response.data.data;
            setSelectedPessoa(savedPessoa);
            setFormData({
              ...formData,
              ...(savedPessoa || {}),
              dias_trabalho: (savedPessoa && Array.isArray(savedPessoa.dias_trabalho)) ? savedPessoa.dias_trabalho : []
            });
            enqueueSnackbar('Registro inicial salvo. Prossiga com o escopo de atuação.', { variant: 'info' });
            setActiveStep(1);
          }
        } catch (error) {
          enqueueSnackbar(error.response?.data?.error || 'Erro ao criar registro.', { variant: 'error' });
        } finally { setSaving(false); }
      } else { 
          // Se já existe selectedPessoa, apenas avançamos e garantimos que o formData está sincronizado com o que está no estado
          setActiveStep(prev => prev + 1); 
      }
    };

    const handleOpenWebcamECM = (entityId) => { setCurrentECMEntityId(entityId); setOpenWebcamECM(true); };

    const handleUploadWebcamECM = async (base64) => {
      try {
        const blob = await (await fetch(base64)).blob();
        const file = new File([blob], `documento_webcam_${Date.now()}.jpg`, { type: 'image/jpeg' });
        await handleUploadECM(currentECMEntityId, file);
        setOpenWebcamECM(false);
      } catch (e) {
        enqueueSnackbar('Erro ao enviar foto do documento.', { variant: 'error' });
      }
    };

    const handleUploadECM = async (entityId, file) => {
      if (!file) return;
      const titulo = window.prompt("Título do Documento:", "Documento");
      if (!titulo) return;
      const formDataUpload = new FormData();
      formDataUpload.append('arquivo', file);
      formDataUpload.append('titulo', titulo);
      formDataUpload.append('tipo_doc', 'ECM');
      try {
        setSaving(true);
        await api.post(`/documentos/pessoa/${entityId}/upload`, formDataUpload, { headers: { 'Content-Type': 'multipart/form-data' } });
        enqueueSnackbar('Documento enviado com sucesso!', { variant: 'success' });
        loadDocumentos(entityId);
      } catch (error) { 
          enqueueSnackbar('Erro ao enviar documento.', { variant: 'error' }); 
      } finally { setSaving(false); }
    };

    const handleImport = async (event) => {
      const file = event.target.files[0];
      if (!file || !activeEvent) return;
      const formData = new FormData(); 
      formData.append('file', file); 
      formData.append('eventoId', activeEvent.id);
      try {
        setImportLoading(true);
        const response = await api.post('/excel/import/pessoas', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
        alert(response.data.message); 
        setOpenImport(false); 
        loadPessoas();
      } catch (error) { 
          alert('Erro na importação.'); 
      } finally { setImportLoading(false); }
    };

    const handleExport = async () => {
      try {
        const response = await api.get('/excel/export/pessoas', { 
            params: { evento_id: eventoIdParam },
            responseType: 'blob' 
        });
        const url = window.URL.createObjectURL(new Blob([response.data]));
        const link = document.createElement('a'); 
        link.href = url; 
        link.setAttribute('download', `export_participantes_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
        document.body.appendChild(link); 
        link.click(); 
        document.body.removeChild(link);
      } catch (error) { 
          enqueueSnackbar('Falha ao exportar registros.', { variant: 'error' }); 
      }
    };

    const handleDownloadTemplate = async () => {
      try {
        const response = await api.get('/excel/template/pessoas', { responseType: 'blob' });
        const url = URL.createObjectURL(response.data);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'template_importacao.xlsx';
        a.click();
        URL.revokeObjectURL(url);
      } catch (error) {
        enqueueSnackbar('Erro ao baixar template.', { variant: 'error' });
      }
    };

    return {
        // States
        search, setSearch,
        page, setPage,
        limit, setLimit,
        statusFilter, setStatusFilter,
        totalPages, totalCount,
        pessoas, loading,
        openDialog, setOpenDialog,
        selectedPessoa, setSelectedPessoa,
        formData, setFormData,
        activeStep, setActiveStep,
        steps,
        empresas,
        activeEvent,
        documentos,
        saving,
        openDocsDialog, setOpenDocsDialog,
        selectedPessoaDocs,
        openWebcamECM, setOpenWebcamECM,
        openImport, setOpenImport,
        importLoading,
        openBlockDialog, setOpenBlockDialog,
        isBlocking,
        pessoaToBlock,
        blockJustification, setBlockJustification,
        blockLoading,
        openDeleteConfirm, setOpenDeleteConfirm,
        deleteLoading,
        expulsionLoading,
        eventoIdParam,
        isAdmin,
        isEmpresa,

        // Handlers
        handleOpenDialog,
        handleCloseDialog,
        handleSave,
        handleDateToggle,
        handleDelete,
        confirmDelete,
        handleOpenBlock,
        handleConfirmBlock,
        handleExpulsar,
        handleOpenDocs,
        handleNextStep,
        handleOpenWebcamECM,
        handleUploadWebcamECM,
        handleUploadECM,
        handleImport,
        handleExport,
        handleDownloadTemplate,
        loadPessoas
    };
};
