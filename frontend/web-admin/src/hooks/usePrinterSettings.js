import { useState, useEffect } from 'react';
import api from '../services/api';

export const usePrinterSettings = () => {
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
            if (formData.id) {
                await api.put(`/devices/${formData.id}`, {
                    ...formData,
                    tipo: 'impressora'
                });
            } else {
                await api.post('/devices', {
                    ...formData,
                    tipo: 'impressora'
                });
            }
            fetchPrinters();
            setOpenDialog(false);
        } catch (error) {
            console.error('Erro ao salvar impressora:', error);
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
