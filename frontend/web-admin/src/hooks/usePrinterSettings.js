import { useState, useEffect } from 'react';
import { useSnackbar } from 'notistack';
import api from '../services/api';

export const usePrinterSettings = () => {
    const { enqueueSnackbar } = useSnackbar();
    const [printers, setPrinters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [openDialog, setOpenDialog] = useState(false);
    const [formData, setFormData] = useState({
        nome: '',
        tipo: 'etiqueta',
        marca: 'zebra',
        ip_address: '',
        porta: 9100,
        config: { protocolo: 'ZPL', dpi: 203 }
    });

    const fetchPrinters = async () => {
        setLoading(true);
        try {
            const response = await api.get('/devices');
            const data = response.data.data || [];
            setPrinters(data.filter(d => d.tipo === 'impressora'));
        } catch (error) {
            console.error('Erro ao buscar impressoras:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchPrinters();
    }, []);

    const handleSave = async (e) => {
        if (e) e.preventDefault();
        try {
            // hideDefaultError: o aviso sai daqui, sem duplicar o aviso genérico do cliente de API
            if (formData.id) {
                await api.put(`/devices/${formData.id}`, {
                    ...formData,
                    tipo: 'impressora'
                }, { hideDefaultError: true });
            } else {
                await api.post('/devices', {
                    ...formData,
                    tipo: 'impressora'
                }, { hideDefaultError: true });
            }
            fetchPrinters();
            setOpenDialog(false);
        } catch (error) {
            console.error('Erro ao salvar impressora:', error);
            enqueueSnackbar(
                error.response?.data?.error || error.response?.data?.message || 'Não foi possível salvar a impressora. Tente novamente.',
                { variant: 'error' }
            );
        }
    };

    const handleDelete = async (id) => {
        try {
            await api.delete(`/devices/${id}`);
            fetchPrinters();
        } catch (error) {
            console.error('Erro ao deletar impressora:', error);
        }
    };

    const handleOpenDialog = (printer = null) => {
        if (printer) {
            setFormData({
                ...printer,
                user: printer.user_device || 'admin',
                password: printer.password_device || ''
            });
        } else {
            setFormData({
                nome: '',
                tipo: 'etiqueta',
                marca: 'zebra',
                ip_address: '',
                porta: 9100,
                config: { protocolo: 'ZPL', dpi: 203 }
            });
        }
        setOpenDialog(true);
    };

    return {
        printers,
        loading,
        formData,
        setFormData,
        openDialog,
        setOpenDialog,
        handleSave,
        handleDelete,
        handleOpenDialog,
        fetchPrinters
    };
};
