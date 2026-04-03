import React, { useState, useEffect } from 'react';
import {
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    TextField,
    Button,
    Grid,
    FormControl,
    InputLabel,
    Select,
    MenuItem,
    FormControlLabel,
    Checkbox,
    Typography,
    Box,
    Avatar,
    IconButton,
    CircularProgress,
} from '@mui/material';
import {
    PhotoCamera as PhotoCameraIcon,
    Delete as DeleteIcon,
} from '@mui/icons-material';

const PessoaForm = ({ open, onClose, onSubmit, initialData, empresas, loading }) => {
    const [formData, setFormData] = useState({
        nome: '',
        cpf: '',
        funcao: '',
        empresa_id: '',
        observacao: '',
        fase_montagem: false,
        fase_showday: false,
        fase_desmontagem: false,
        foto_url: '',
        tipo_pessoa: 'colaborador',
    });

    const [fotoPreview, setFotoPreview] = useState('');

    useEffect(() => {
        if (initialData) {
            setFormData({
                nome: initialData.nome || '',
                cpf: initialData.cpf || '',
                funcao: initialData.funcao || '',
                empresa_id: initialData.empresa_id || '',
                observacao: initialData.observacao || '',
                fase_montagem: initialData.fase_montagem || false,
                fase_showday: initialData.fase_showday || false,
                fase_desmontagem: initialData.fase_desmontagem || false,
                foto_url: initialData.foto_url || '',
                tipo_pessoa: initialData.tipo_pessoa || 'colaborador',
            });
            setFotoPreview(initialData.foto_url || '');
        } else {
            setFormData({
                nome: '',
                cpf: '',
                funcao: '',
                empresa_id: '',
                observacao: '',
                fase_montagem: false,
                fase_showday: false,
                fase_desmontagem: false,
                foto_url: '',
                tipo_pessoa: 'colaborador',
            });
            setFotoPreview('');
        }
    }, [initialData, open]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData((prev) => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value,
        }));
    };

    const handleFotoChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                setFotoPreview(reader.result);
                setFormData((prev) => ({ ...prev, foto_url: reader.result }));
            };
            reader.readAsDataURL(file);
        }
    };

    const handleRemoveFoto = () => {
        setFotoPreview('');
        setFormData((prev) => ({ ...prev, foto_url: '' }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSubmit(formData);
    };

    const formatCPF = (value) => {
        const cpf = value.replace(/\D/g, '');
        return cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4');
    };

    return (
        <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
            <form onSubmit={handleSubmit}>
                <DialogTitle>
                    {initialData ? 'Editar Participante' : 'Novo Participante'}
                </DialogTitle>
                <DialogContent>
                    <Grid container spacing={2} sx={{ mt: 1 }}>
                        {/* Foto */}
                        <Grid item xs={12}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                <Avatar
                                    src={fotoPreview}
                                    sx={{ width: 80, height: 80 }}
                                />
                                <Box>
                                    <input
                                        accept="image/*"
                                        style={{ display: 'none' }}
                                        id="foto-upload"
                                        type="file"
                                        onChange={handleFotoChange}
                                    />
                                    <label htmlFor="foto-upload">
                                        <Button
                                            component="span"
                                            variant="outlined"
                                            startIcon={<PhotoCameraIcon />}
                                            size="small"
                                        >
                                            Upload Foto
                                        </Button>
                                    </label>
                                    {fotoPreview && (
                                        <IconButton
                                            size="small"
                                            onClick={handleRemoveFoto}
                                            color="error"
                                            sx={{ ml: 1 }}
                                        >
                                            <DeleteIcon />
                                        </IconButton>
                                    )}
                                </Box>
                            </Box>
                        </Grid>

                        {/* Dados Pessoais */}
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1 }}>
                                Dados Pessoais
                            </Typography>
                        </Grid>
                        <Grid item xs={12} md={8}>
                            <TextField
                                name="nome"
                                label="Nome Completo"
                                fullWidth
                                required
                                value={formData.nome}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <FormControl fullWidth required>
                                <InputLabel>Tipo</InputLabel>
                                <Select
                                    name="tipo_pessoa"
                                    value={formData.tipo_pessoa}
                                    label="Tipo"
                                    onChange={handleChange}
                                >
                                    <MenuItem value="colaborador">Colaborador</MenuItem>
                                    <MenuItem value="visitante">Visitante</MenuItem>
                                    <MenuItem value="staff">Staff</MenuItem>
                                    <MenuItem value="fornecedor">Fornecedor</MenuItem>
                                </Select>
                            </FormControl>
                        </Grid>
                        <Grid item xs={12} md={4}>
                            <TextField
                                name="cpf"
                                label="CPF"
                                fullWidth
                                required
                                value={formData.cpf}
                                onChange={handleChange}
                                placeholder="000.000.000-00"
                                inputProps={{ maxLength: 14 }}
                            />
                        </Grid>

                        {/* Dados Profissionais */}
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>
                                Dados Profissionais
                            </Typography>
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <TextField
                                name="funcao"
                                label="Função"
                                fullWidth
                                value={formData.funcao}
                                onChange={handleChange}
                            />
                        </Grid>
                        <Grid item xs={12} md={6}>
                            <FormControl fullWidth>
                                <InputLabel>Empresa</InputLabel>
                                <Select
                                    name="empresa_id"
                                    value={formData.empresa_id}
                                    label="Empresa"
                                    onChange={handleChange}
                                >
                                    <MenuItem value="">Nenhuma</MenuItem>
                                    {empresas.map((emp) => (
                                        <MenuItem key={emp.id} value={emp.id}>
                                            {emp.nome}
                                        </MenuItem>
                                    ))}
                                </Select>
                            </FormControl>
                        </Grid>

                        {/* Fases do Evento */}
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>
                                Fases do Evento
                            </Typography>
                        </Grid>
                        <Grid item xs={12}>
                            <Grid container spacing={2}>
                                <Grid item xs={4}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                name="fase_montagem"
                                                checked={formData.fase_montagem}
                                                onChange={handleChange}
                                            />
                                        }
                                        label="Montagem"
                                    />
                                </Grid>
                                <Grid item xs={4}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                name="fase_showday"
                                                checked={formData.fase_showday}
                                                onChange={handleChange}
                                            />
                                        }
                                        label="Show Day"
                                    />
                                </Grid>
                                <Grid item xs={4}>
                                    <FormControlLabel
                                        control={
                                            <Checkbox
                                                name="fase_desmontagem"
                                                checked={formData.fase_desmontagem}
                                                onChange={handleChange}
                                            />
                                        }
                                        label="Desmontagem"
                                    />
                                </Grid>
                            </Grid>
                        </Grid>

                        {/* Observação */}
                        <Grid item xs={12}>
                            <Typography variant="subtitle2" sx={{ mb: 1, mt: 2 }}>
                                Observação
                            </Typography>
                        </Grid>
                        <Grid item xs={12}>
                            <TextField
                                name="observacao"
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
                        disabled={loading || !formData.nome || !formData.cpf}
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

export default PessoaForm;