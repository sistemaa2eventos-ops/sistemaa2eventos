import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Grid,
    CircularProgress,
} from '@mui/material';

const EmpresaForm = ({ open, onClose, onSubmit, initialData, loading }) => {
    const [formData, setFormData] = useState({
        nome: '',
        cnpj: '',
        servico: '',
        observacao: '',
    });

    useEffect(() => {
        if (initialData) {
            setFormData({
                nome: initialData.nome || '',
                cnpj: initialData.cnpj || '',
                servico: initialData.servico || '',
                observacao: initialData.observacao || '',
            });
        } else {
            setFormData({
                nome: '',
                cnpj: '',
                servico: '',
                observacao: '',
            });
        }
    }, [initialData, open]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData((prev) => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const formatCNPJ = (value) => {
        const cnpj = value.replace(/\D/g, '');
        return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>
                    {initialData ? 'Editar Empresa' : 'Nova Empresa'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        <Grid item xs={12}>
                            <TextField
                                name="nome"
                                label="Nome da Empresa"
                                fullWidth
                                required
                                value={formData.nome}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                name="cnpj"
                                label="CNPJ"
                                fullWidth
                                value={formData.cnpj}
                                onChange={handleChange}
                                placeholder="00.000.000/0000-00"
                                inputProps={{ maxLength: 18 }}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                name="servico"
                                label="Serviço"
                                fullWidth
                                value={formData.servico}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                name="observacao"
                                label="Observação"
                                fullWidth
                                multiline
                                rows={3}
                                value={formData.observacao}
                                onChange={handleChange}
                            />
                        </Grid>
                    </Grid>
                </DialogContent>
                <DialogActions>
                    <Button onClick={onClose} disabled={loading}>
                        Cancelar
                    </Button>
                    <Button
                        type="submit"
                        variant="contained"
                        disabled={loading || !formData.nome}
                        sx={{
                            backgroundColor: 'secondary.main',
                            color: '#000',
                            '&:hover': { backgroundColor: 'secondary.dark' },
                        }}
                    >
                        {loading ? <CircularProgress size={24} /> : 'Salvar'}
                    </Button>
                </DialogActions>
            </form>
        </Dialog>
    );
};

export default EmpresaForm;