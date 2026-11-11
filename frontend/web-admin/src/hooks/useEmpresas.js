import { useState, useEffect, useCallback, useRef } from 'react';
import { useSnackbar } from 'notistack';
import api from '../services/api';

export const useEmpresas = (eventoIdParam) => {
    const { enqueueSnackbar } = useSnackbar();
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
    // Busca só 300 ms depois da última tecla (antes: 1 requisição por tecla)
    const [buscaAtrasada, setBuscaAtrasada] = useState('');
    const loadAbortRef = useRef(null);
    useEffect(() => {
        const t = setTimeout(() => setBuscaAtrasada(search), 300);
        return () => clearTimeout(t);
    }, [search]);
    const [page, setPage] = useState(1);
    const [rowsPerPage, setRowsPerPage] = useState(10);
    const [total, setTotal] = useState(0);
    const [openDialog, setOpenDialog] = useState(false);
    const [selectedEmpresa, setSelectedEmpresa] = useState(null);
    const [activeEvent, setActiveEvent] = useState(null);
    const [dailyQuotas, setDailyQuotas] = useState({});
    const [activeStep, setActiveStep] = useState(0);
    const [documentos, setDocumentos] = useState([]);
    const [formData, setFormData] = useState({
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
        datas_presenca: []
    });

    const fetchActiveEvent = useCallback(async () => {
        try {
            const resp = await api.get('/eventos');
            const storedEventoId = localStorage.getItem('active_evento_id');
            const eventList = resp.data.data || [];
            const active = (eventoIdParam && eventList.find(e => e.id === eventoIdParam))
                || (storedEventoId && eventList.find(e => e.id === storedEventoId))
                || eventList.find(e => e.status === 'ativo')
                || eventList[0];
            setActiveEvent(active);
        } catch (e) {
            enqueueSnackbar('Erro ao buscar evento ativo.', { variant: 'error' });
        }
    }, [eventoIdParam, enqueueSnackbar]);

    const loadEmpresas = useCallback(async () => {
        // Cancela a anterior: resposta lenta não sobrescreve a lista mais nova
        loadAbortRef.current?.abort();
        const controller = new AbortController();
        loadAbortRef.current = controller;
        try {
            setLoading(true);
            const response = await api.get('/empresas', {
                params: {
                    search: buscaAtrasada || undefined,
                    evento_id: eventoIdParam || undefined,
                    page,
                    limit: rowsPerPage
                },
                signal: controller.signal
            });
            const data = response.data;
            setEmpresas(data.data || []);
            setTotal(data.total || data.count || data.data?.length || 0);
        } catch (error) {
            if (error?.code === 'ERR_CANCELED') return;
            enqueueSnackbar('Erro ao carregar empresas.', { variant: 'error' });
        } finally {
            if (loadAbortRef.current === controller) setLoading(false);
        }
    }, [buscaAtrasada, eventoIdParam, page, rowsPerPage, enqueueSnackbar]);

    const loadDocumentos = useCallback(async (empresaId) => {
        try {
            const resp = await api.get(`/documentos/empresa/${empresaId}`);
            setDocumentos(resp.data.data || []);
        } catch (e) {
            enqueueSnackbar('Falha ao buscar documentos.', { variant: 'error' });
        }
    }, [enqueueSnackbar]);

    useEffect(() => {
        loadEmpresas();
    }, [loadEmpresas]);

    // O evento ativo não muda com a busca/página (antes era buscado de novo a cada tecla)
    useEffect(() => {
        fetchActiveEvent();
    }, [fetchActiveEvent]);

    const handleSave = async () => {
        try {
            setSaving(true);
            const payload = {
                ...formData,
                datas_presenca: Array.isArray(formData.datas_presenca) ? formData.datas_presenca : [],
                tipo_operacao: formData.servico,
                responsavel_legal: formData.responsavel
            };

            if (selectedEmpresa) {
                await api.put(`/empresas/${selectedEmpresa.id}`, payload);
            } else {
                await api.post('/empresas', payload);
            }
            setOpenDialog(false);
            loadEmpresas();
            enqueueSnackbar('Empresa salva com sucesso!', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao salvar empresa.', { variant: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const handleSelectAllDatesEmpresa = () => {
        if (!activeEvent) return;
        const all = [
            ...(activeEvent.datas_montagem || []),
            ...(activeEvent.datas_evento || []),
            ...(activeEvent.datas_desmontagem || [])
        ];
        setFormData(prev => ({ ...prev, datas_presenca: [...new Set(all)].sort() }));
    };

    const handleClearAllDatesEmpresa = () => {
        setFormData(prev => ({ ...prev, datas_presenca: [] }));
    };

    const handleSelectAllPhaseEmpresa = (phase) => {
        const phaseDates = (activeEvent && activeEvent[`datas_${phase}`]) || [];
        const current = Array.isArray(formData.datas_presenca) ? [...formData.datas_presenca] : [];
        phaseDates.forEach(d => {
            if (!current.includes(d)) current.push(d);
        });
        setFormData(prev => ({ ...prev, datas_presenca: current }));
    };

    const handleClearPhaseEmpresa = (phase) => {
        const phaseDates = (activeEvent && activeEvent[`datas_${phase}`]) || [];
        const current = (Array.isArray(formData.datas_presenca) ? formData.datas_presenca : []).filter(d => !phaseDates.includes(d));
        setFormData(prev => ({ ...prev, datas_presenca: current }));
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/empresas/${id}`);
            loadEmpresas();
            enqueueSnackbar('Empresa removida.', { variant: 'success' });
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Falha ao excluir empresa.', { variant: 'error' });
        }
    };

    const handleSaveQuotas = async () => {
        try {
            await api.post(`/eventos/${activeEvent.id}/quotas/${selectedEmpresa.id}`, {
                quotas: dailyQuotas
            });
            enqueueSnackbar('Cotas diárias sincronizadas!', { variant: 'success' });
            return true;
        } catch (e) {
            enqueueSnackbar('Falha ao salvar cotas', { variant: 'error' });
            return false;
        }
    };

    const handleAuditDocument = async (docId, status, empresaId = null) => {
        try {
            await api.patch(`/documentos/empresa/${docId}/auditar`, { status });
            const rotulo = status === 'aprovado' ? 'aprovado' : status === 'reenvio_solicitado' ? 'marcado para reenvio' : 'reprovado';
            enqueueSnackbar(`Documento ${rotulo}!`, { variant: 'success' });
            const targetId = empresaId || selectedEmpresa?.id;
            if (targetId) loadDocumentos(targetId);
            return true;
        } catch (e) {
            enqueueSnackbar('Falha ao auditar documento.', { variant: 'error' });
            return false;
        }
    };

    const handleUploadDocumentoEmpresa = async (empresaId, file, { titulo = 'Documento da Empresa', tipo_doc = 'CORPORATIVO', data_validade = '' } = {}) => {
        if (!empresaId || !file) return false;
        const tituloLimpo = String(titulo || '').trim() || 'Documento da Empresa';
        const formDataUpload = new FormData();
        formDataUpload.append('arquivo', file);
        formDataUpload.append('titulo', tituloLimpo);
        formDataUpload.append('tipo_doc', String(tipo_doc || 'CORPORATIVO').trim());
        if (data_validade) formDataUpload.append('data_validade', data_validade);

        try {
            setSaving(true);
            await api.post(`/documentos/empresa/${empresaId}/upload`, formDataUpload, {
                headers: { 'Content-Type': 'multipart/form-data' }
            });
            enqueueSnackbar('Documento da empresa enviado com sucesso!', { variant: 'success' });
            await loadDocumentos(empresaId);
            return true;
        } catch (error) {
            enqueueSnackbar(error.response?.data?.error || 'Erro ao enviar documento da empresa.', { variant: 'error' });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleUploadWebcamEmpresa = async (empresaId, base64, metadados = {}) => {
        if (!empresaId || !base64) return false;
        try {
            const blob = await (await fetch(base64)).blob();
            const file = new File([blob], `documento_empresa_${Date.now()}.jpg`, { type: 'image/jpeg' });
            return await handleUploadDocumentoEmpresa(empresaId, file, metadados);
        } catch (e) {
            enqueueSnackbar('Erro ao processar foto do documento.', { variant: 'error' });
            return false;
        }
    };

    return {
        empresas,
        loading,
        saving,
        search,
        setSearch,
        page,
        setPage,
        rowsPerPage,
        setRowsPerPage,
        total,
        openDialog,
        setOpenDialog,
        selectedEmpresa,
        setSelectedEmpresa,
        activeEvent,
        dailyQuotas,
        setDailyQuotas,
        activeStep,
        setActiveStep,
        documentos,
        formData,
        setFormData,
        handleSave,
        handleDelete,
        handleSaveQuotas,
        handleAuditDocument,
        handleUploadDocumentoEmpresa,
        handleUploadWebcamEmpresa,
        handleSelectAllDatesEmpresa,
        handleClearAllDatesEmpresa,
        handleSelectAllPhaseEmpresa,
        handleClearPhaseEmpresa,
        loadDocumentos,
        loadEmpresas
    };
};
