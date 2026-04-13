import { useState, useEffect, useCallback } from 'react';
import { useSnackbar } from 'notistack';
import api from '../services/api';

export const useEmpresas = (eventoIdParam) => {
    const { enqueueSnackbar } = useSnackbar();
    const [empresas, setEmpresas] = useState([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [search, setSearch] = useState('');
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
        max_colaboradores: 50
    });

    const fetchActiveEvent = useCallback(async () => {
        try {
            const resp = await api.get('/eventos');
            const active = resp.data.data.find(e => e.id === eventoIdParam) || resp.data.data.find(e => e.status === 'ativo');
            setActiveEvent(active);
        } catch (e) {
            enqueueSnackbar('Erro ao buscar evento ativo.', { variant: 'error' });
        }
    }, [eventoIdParam, enqueueSnackbar]);

    const loadEmpresas = useCallback(async () => {
        try {
            setLoading(true);
            const response = await api.get('/empresas', {
                params: {
                    search: search || undefined,
                    evento_id: eventoIdParam || undefined,
                    page,
                    limit: rowsPerPage
                },
            });
            const data = response.data;
            setEmpresas(data.data || []);
            setTotal(data.total || data.count || data.data?.length || 0);
        } catch (error) {
            enqueueSnackbar('Erro ao carregar empresas.', { variant: 'error' });
        } finally {
            setLoading(false);
        }
    }, [search, eventoIdParam, page, rowsPerPage, enqueueSnackbar]);

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
        fetchActiveEvent();
    }, [loadEmpresas, fetchActiveEvent]);

    const handleSave = async () => {
        try {
            setSaving(true);
            const payload = {
                ...formData,
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

    const handleAuditDocument = async (docId, status) => {
        try {
            await api.patch(`/documentos/empresa/${docId}/auditar`, { status });
            enqueueSnackbar(`Documento ${status === 'aprovado' ? 'aprovado' : 'rejeitado'}!`, { variant: 'success' });
            if (selectedEmpresa) loadDocumentos(selectedEmpresa.id);
            return true;
        } catch (e) {
            enqueueSnackbar('Falha ao auditar documento.', { variant: 'error' });
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
        loadDocumentos,
        loadEmpresas
    };
};
