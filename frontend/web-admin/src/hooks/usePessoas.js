import { useState, useEffect, useRef, useCallback } from 'react';
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
    const searchRef = useRef('');
    const fetchAbortRef = useRef(null);
    const buscaMontadaRef = useRef(false);
    const pageRef = useRef(1);

    // Params
    const eventoIdParam = searchParams.get('evento_id') || localStorage.getItem('active_evento_id');
    const isAdmin = user?.nivel_acesso === 'admin_master' || user?.nivel_acesso === 'admin' || user?.nivel_acesso === 'master' || user?.nivel_acesso === 'supervisor';
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

    searchRef.current = search;
    pageRef.current = page;
    
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
      nome_completo: '', nome_credencial: '', cpf: '', passaporte: '', telefone: '', nome_mae: '', data_nascimento: '',
      funcao: '', empresa_id: '', tipo_pessoa: 'colaborador', foto_url: '', 
      fases_acesso: [], dias_acesso: [], documentos_trabalho: [],
      trabalho_area_tecnica: false, trabalho_altura: false, pagamento_validado: false, aceite_lgpd: false,
      codigo_ingresso: '', origem_pagamento: ''
    });

    const [openWebcamECM, setOpenWebcamECM] = useState(false);
    const [currentECMEntityId, setCurrentECMEntityId] = useState(null);

    const steps = ['Dados pessoais', 'Acesso', 'Documentos'];

    // Handlers
    const fetchPessoas = useCallback(async (customPage, customSearch) => {
      const p = customPage !== undefined ? customPage : pageRef.current;
      const s = customSearch !== undefined ? customSearch : searchRef.current;
      // Cancela a busca anterior: uma resposta lenta não sobrescreve a lista mais nova
      fetchAbortRef.current?.abort();
      const controller = new AbortController();
      fetchAbortRef.current = controller;
      try {
        setLoading(true);
        let response;
        if (s && s.trim().length >= 2) {
          response = await api.get('/pessoas/search', { 
            params: { q: s.trim(), page: p, limit, status: statusFilter === 'TODOS' ? undefined : statusFilter },
            signal: controller.signal
          });
        } else {
          response = await api.get('/pessoas', { 
            params: { 
              evento_id: eventoIdParam,
              page: p,
              limit,
              status: statusFilter === 'TODOS' ? undefined : statusFilter
            },
            signal: controller.signal
          });
        }
        
        const resData = response.data?.data || response.data || {};
        setPessoas(resData.data || []);
        setTotalPages(resData.pages || 1);
        setTotalCount(resData.total || 0);
      } catch (error) {
        if (error?.code === 'ERR_CANCELED') return;
        enqueueSnackbar('Erro ao carregar lista de pessoas.', { variant: 'error' });
      } finally {
        if (fetchAbortRef.current === controller) setLoading(false);
      }
    }, [limit, statusFilter, eventoIdParam, enqueueSnackbar]);

    const loadPessoas = useCallback(() => {
      return fetchPessoas();
    }, [fetchPessoas]);

    const loadInitialData = useCallback(async () => {
      try {
        const [evRes, empRes] = await Promise.all([ api.get('/eventos'), api.get('/empresas') ]);
        const storedEventoId = localStorage.getItem('active_evento_id');
        const eventList = evRes.data?.data || [];
        const event = (eventoIdParam && eventList.find(e => e.id === eventoIdParam))
          || (storedEventoId && eventList.find(e => e.id === storedEventoId))
          || eventList.find(e => e.status === 'ativo')
          || eventList[0];
        setActiveEvent(event);
        setEmpresas(empRes.data?.data || []);
      } catch (error) {
        enqueueSnackbar('Erro ao carregar dados iniciais.', { variant: 'error' });
      }
    }, [eventoIdParam, enqueueSnackbar]);

    const loadDocumentos = useCallback(async (pessoaId) => {
      if (!pessoaId) return;
      try {
        const resp = await api.get(`/documentos/pessoa/${pessoaId}`);
        setDocumentos(resp.data?.data || []);
      } catch (e) {
        enqueueSnackbar('Erro ao carregar documentos.', { variant: 'error' });
      }
    }, [enqueueSnackbar]);

    // Effects
    useEffect(() => { 
      loadInitialData(); 
    }, [loadInitialData]);

    useEffect(() => {
      // Na montagem o efeito da página abaixo já carrega a lista (antes buscava 2x)
      if (!buscaMontadaRef.current) { buscaMontadaRef.current = true; return undefined; }
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
      searchTimerRef.current = setTimeout(() => {
        setPage(1); // Reset page on search
        fetchPessoas(1, search);
      }, 400);
      return () => { if (searchTimerRef.current) clearTimeout(searchTimerRef.current); };
    }, [search, fetchPessoas]);

    useEffect(() => {
      fetchPessoas(page, searchRef.current);
    }, [page, limit, statusFilter, fetchPessoas]);

    useEffect(() => { 
        if (openDialog && selectedPessoa?.id) { 
            loadDocumentos(selectedPessoa.id); 
        } 
    }, [openDialog, selectedPessoa?.id, loadDocumentos]);

    // Functions
    const handleOpenBlock = (pessoa) => {
      const isCurrentlyBlocked = Boolean(pessoa.bloqueado || pessoa.status_acesso === 'bloqueado');
      setPessoaToBlock(pessoa);
      setIsBlocking(!isCurrentlyBlocked);
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

    const handleOpenDialog = async (pessoa = null) => {
      setActiveStep(0);
      if (pessoa) {
        setLoading(true);
        try {
            const resp = await api.get(`/pessoas/${pessoa.id}`);
            const fullPessoa = resp.data.data;
            setSelectedPessoa(fullPessoa);
            
            const fases_acesso = [];
            if (fullPessoa.fase_montagem) fases_acesso.push('montagem');
            if (fullPessoa.fase_showday) fases_acesso.push('evento');
            if (fullPessoa.fase_desmontagem) fases_acesso.push('desmontagem');

            setFormData({
              ...fullPessoa,
              nome_completo: fullPessoa.nome_completo || fullPessoa.nome || '',
              data_nascimento: fullPessoa.data_nascimento ? format(new Date(fullPessoa.data_nascimento), "yyyy-MM-dd") : '',
              tipo_pessoa: fullPessoa.tipo_pessoa || fullPessoa.categoria_operacional || 'colaborador',
              fases_acesso: fases_acesso,
              dias_acesso: Array.isArray(fullPessoa.dias_acesso) ? fullPessoa.dias_acesso : [],
              documentos_trabalho: Array.isArray(fullPessoa.documentos_trabalho) ? fullPessoa.documentos_trabalho : [],
            });
        } catch(e) {
            enqueueSnackbar('Erro ao carregar detalhes completos.', { variant: 'error' });
        } finally {
            setLoading(false);
            setOpenDialog(true);
        }
      } else {
        setSelectedPessoa(null);
        setFormData({
          nome_completo: '', nome_credencial: '', cpf: '', passaporte: '', telefone: '', nome_mae: '', data_nascimento: '', funcao: '', tipo_pessoa: 'colaborador',
          email: '',
          empresa_id: isEmpresa ? user?.empresa_id : '', 
          foto_url: '', fases_acesso: [], dias_acesso: [], documentos_trabalho: [],
          trabalho_area_tecnica: false, trabalho_altura: false, pagamento_validado: false, parecer_documentos: 'pendente',
          codigo_ingresso: '', origem_pagamento: ''
        });
        setDocumentos([]);
        setOpenDialog(true);
      }
    };

    const handleCloseDialog = () => { setOpenDialog(false); setSelectedPessoa(null); };

    const handleSave = async () => {
      if (!formData.nome_completo || !formData.empresa_id) { enqueueSnackbar('Nome Completo e Empresa são obrigatórios.', {variant: 'error'}); return; }
      try {
        setSaving(true);
        let payload = { ...formData };
        
        payload.fase_montagem = payload.fases_acesso?.includes('montagem') || false;
        payload.fase_showday = payload.fases_acesso?.includes('evento') || false;
        payload.fase_desmontagem = payload.fases_acesso?.includes('desmontagem') || false;

        // A biometria facial (câmeras e leitores) só é gerada de foto enviada ao armazenamento: foto que
        // ficasse em base64 no cadastro nunca era reconhecida, e o erro era engolido em silêncio
        if (payload.foto_url && payload.foto_url.startsWith('data:image')) {
          if (!payload.cpf) {
            enqueueSnackbar('Informe o CPF para enviar a foto: sem ele a pessoa não terá reconhecimento facial.', { variant: 'warning' });
          } else {
            let enviada = false;
            try {
              const { data: urlData } = await api.post('/pessoas/generate-upload-url', { cpf: payload.cpf });
              if (urlData.success && urlData.uploadUrl) {
                const base64Data = payload.foto_url.split(',')[1];
                const arr = new Uint8Array(atob(base64Data).split('').map(c => c.charCodeAt(0)));
                const blob = new Blob([arr], { type: 'image/jpeg' });
                const uploadRes = await fetch(urlData.uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': 'image/jpeg' } });
                if (uploadRes.ok) {
                  payload.foto_url = urlData.publicUrl || urlData.path;
                  enviada = true;
                }
              }
            } catch {
              enviada = false;
            }
            if (!enviada) {
              enqueueSnackbar('Não foi possível enviar a foto. Verifique a conexão e salve de novo.', { variant: 'error' });
              return;
            }
          }
        }
        if (selectedPessoa) {
          await api.put(`/pessoas/${selectedPessoa.id}`, payload);
          const pendente = selectedPessoa.status === 'PENDENTE' || selectedPessoa.status_acesso === 'pendente';
          // Operador edita o cadastro; aprovar/reprovar continua com o administrador
          if (pendente && !isAdmin && ['completo', 'incorreto'].includes(payload.parecer_documentos)) {
            enqueueSnackbar('Cadastro salvo. A aprovação é feita pelo administrador.', { variant: 'info' });
          }
          if (pendente && isAdmin) {
            if (payload.parecer_documentos === 'completo') {
              await api.patch(`/pessoas/${selectedPessoa.id}/status`, { status: 'autorizado' });
              enqueueSnackbar('Cadastro aprovado com sucesso!', { variant: 'success' });
            } else if (payload.parecer_documentos === 'incorreto') {
              await api.patch(`/pessoas/${selectedPessoa.id}/status`, { status: 'recusado' });
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
      const current = Array.isArray(formData.dias_acesso) ? [...formData.dias_acesso] : [];
      const index = current.indexOf(date);
      if (index === -1) current.push(date); else current.splice(index, 1);
      
      // Recalcular fases_acesso baseado nas datas marcadas
      const newFases = [];
      if (activeEvent) {
        ['montagem', 'evento', 'desmontagem'].forEach(fase => {
          const phaseDates = activeEvent[`datas_${fase}`] || [];
          if (phaseDates.length > 0 && phaseDates.some(d => current.includes(d))) {
            newFases.push(fase);
          }
        });
      }

      setFormData(prev => ({
        ...prev,
        dias_acesso: current,
        ...(activeEvent ? { fases_acesso: newFases } : {})
      }));
    };

    const handleFaseToggle = (fase) => {
      const currentFases = Array.isArray(formData.fases_acesso) ? [...formData.fases_acesso] : [];
      const faseIndex = currentFases.indexOf(fase);
      const isChecking = faseIndex === -1;
      
      if (isChecking) {
        currentFases.push(fase);
      } else {
        currentFases.splice(faseIndex, 1);
      }

      // Sincronizar dias_acesso com a fase selecionada
      let currentDias = Array.isArray(formData.dias_acesso) ? [...formData.dias_acesso] : [];
      const phaseDates = (activeEvent && activeEvent[`datas_${fase}`]) || [];

      if (isChecking) {
        // Marca todas as datas desta fase
        phaseDates.forEach(d => {
          if (!currentDias.includes(d)) currentDias.push(d);
        });
      } else {
        // Desmarca as datas desta fase
        currentDias = currentDias.filter(d => !phaseDates.includes(d));
      }

      setFormData(prev => ({
        ...prev,
        fases_acesso: currentFases,
        dias_acesso: currentDias
      }));
    };

    const handleSelectAllPhase = (phase) => {
      const phaseDates = (activeEvent && activeEvent[`datas_${phase}`]) || [];
      if (phaseDates.length === 0) return;

      const currentDias = Array.isArray(formData.dias_acesso) ? [...formData.dias_acesso] : [];
      phaseDates.forEach(d => {
        if (!currentDias.includes(d)) currentDias.push(d);
      });

      const currentFases = Array.isArray(formData.fases_acesso) ? [...formData.fases_acesso] : [];
      if (!currentFases.includes(phase)) currentFases.push(phase);

      setFormData(prev => ({
        ...prev,
        fases_acesso: currentFases,
        dias_acesso: currentDias
      }));
    };

    const handleClearPhase = (phase) => {
      const phaseDates = (activeEvent && activeEvent[`datas_${phase}`]) || [];
      const currentDias = (Array.isArray(formData.dias_acesso) ? formData.dias_acesso : []).filter(d => !phaseDates.includes(d));
      const currentFases = (Array.isArray(formData.fases_acesso) ? formData.fases_acesso : []).filter(f => f !== phase);

      setFormData(prev => ({
        ...prev,
        fases_acesso: currentFases,
        dias_acesso: currentDias
      }));
    };

    const handleSelectAllDates = () => {
      if (!activeEvent) return;
      const allDates = [
        ...(activeEvent.datas_montagem || []),
        ...(activeEvent.datas_evento || []),
        ...(activeEvent.datas_desmontagem || [])
      ];
      const uniqueDates = [...new Set(allDates)].sort();
      const allFases = ['montagem', 'evento', 'desmontagem'].filter(f => (activeEvent[`datas_${f}`] || []).length > 0);

      setFormData(prev => ({
        ...prev,
        fases_acesso: allFases,
        dias_acesso: uniqueDates
      }));
    };

    const handleClearAllDates = () => {
      setFormData(prev => ({
        ...prev,
        fases_acesso: [],
        dias_acesso: []
      }));
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
        if (!formData.nome_completo || !formData.empresa_id) { enqueueSnackbar('Preencha Nome Completo e Empresa.', { variant: 'warning' }); return; }
        try {
          setSaving(true);
          const tempPayload = { 
              ...formData, 
              status_acesso: 'pendente',
              fase_montagem: formData.fases_acesso?.includes('montagem') || false,
              fase_showday: formData.fases_acesso?.includes('evento') || false,
              fase_desmontagem: formData.fases_acesso?.includes('desmontagem') || false
          };
          const response = await api.post('/pessoas', tempPayload);
          if (response.data.success) {
            const savedPessoa = response.data.data;
            setSelectedPessoa(savedPessoa);
            setFormData({
              ...formData,
              ...(savedPessoa || {}),
              fases_acesso: (savedPessoa && Array.isArray(savedPessoa.fases_acesso)) ? savedPessoa.fases_acesso : [],
              dias_acesso: (savedPessoa && Array.isArray(savedPessoa.dias_acesso)) ? savedPessoa.dias_acesso : [],
              documentos_trabalho: (savedPessoa && Array.isArray(savedPessoa.documentos_trabalho)) ? savedPessoa.documentos_trabalho : []
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
        enqueueSnackbar(response.data.message, { variant: 'success' }); 
        setOpenImport(false); 
        loadPessoas();
      } catch (error) { 
        enqueueSnackbar('Erro na importação.', { variant: 'error' }); 
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
        handleFaseToggle,
        handleSelectAllPhase,
        handleClearPhase,
        handleSelectAllDates,
        handleClearAllDates,
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
