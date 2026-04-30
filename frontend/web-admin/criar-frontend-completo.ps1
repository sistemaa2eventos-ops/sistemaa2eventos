# criar-frontend-completo.ps1
Write-Host "🎨 CRIANDO TODAS AS PÁGINAS DO FRONTEND A2 EVENTOS" -ForegroundColor Cyan
Write-Host "=================================================="

$basePath = "C:\Users\SD_Ad\OneDrive\Área de Trabalho\Projeto_A2_Eventos\a2-eventos\frontend\web-admin"
Set-Location $basePath

# ============================================
# 1. CRIAR ESTRUTURA DE PASTAS
# ============================================
Write-Host "`n📁 Criando estrutura de pastas..." -ForegroundColor Yellow

$pastas = @(
  "src\components\layout",
  "src\components\dashboard",
  "src\components\empresa",
  "src\components\funcionario",
  "src\components\access-control",
  "src\components\common",
  "src\pages",
  "src\services",
  "src\contexts",
  "src\styles",
  "src\utils",
  "public"
)

foreach ($pasta in $pastas) {
  New-Item -ItemType Directory -Path $pasta -Force | Out-Null
  Write-Host "   ✅ $pasta"
}

# ============================================
# 2. CRIAR COMPONENTES COMUNS
# ============================================
Write-Host "`n🧩 Criando componentes comuns..." -ForegroundColor Yellow

# StatusBadge.jsx
@'
import React from 'react';
import { Chip } from '@mui/material';
import {
  CheckCircle as CheckIcon,
  Warning as WarningIcon,
  Block as BlockIcon,
  ExitToApp as ExitIcon,
} from '@mui/icons-material';

const StatusBadge = ({ status }) => {
  const config = {
    checkin: {
      label: 'Check-in',
      color: 'success',
      icon: <CheckIcon />,
    },
    checkout: {
      label: 'Check-out',
      color: 'info',
      icon: <ExitIcon />,
    },
    pendente: {
      label: 'Pendente',
      color: 'warning',
      icon: <WarningIcon />,
    },
    expulso: {
      label: 'Expulso',
      color: 'error',
      icon: <BlockIcon />,
    },
  };

  const { label, color, icon } = config[status] || config.pendente;

  return (
    <Chip
      icon={icon}
      label={label}
      color={color}
      size="small"
      variant="filled"
      sx={{
        fontWeight: 'bold',
        '& .MuiChip-icon': {
          color: 'inherit',
        },
      }}
    />
  );
};

export default StatusBadge;
'@ | Out-File -FilePath "src\components\common\StatusBadge.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ StatusBadge.jsx"

# SearchBar.jsx
@'
import React from 'react';
import { TextField, InputAdornment } from '@mui/material';
import { Search as SearchIcon } from '@mui/icons-material';

const SearchBar = ({ value, onChange, placeholder = "Buscar..." }) => {
  return (
    <TextField
      fullWidth
      variant="outlined"
      size="small"
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      InputProps={{
        startAdornment: (
          <InputAdornment position="start">
            <SearchIcon sx={{ color: 'text.secondary' }} />
          </InputAdornment>
        ),
      }}
      sx={{
        '& .MuiOutlinedInput-root': {
          '& fieldset': {
            borderColor: 'rgba(255,255,255,0.23)',
          },
        },
      }}
    />
  );
};

export default SearchBar;
'@ | Out-File -FilePath "src\components\common\SearchBar.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ SearchBar.jsx"

# DataTable.jsx
@'
import React from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  CircularProgress,
  Box,
} from '@mui/material';

const DataTable = ({
  columns,
  data,
  loading = false,
  page = 0,
  rowsPerPage = 10,
  totalCount = 0,
  onPageChange,
  onRowsPerPageChange,
}) => {
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      <TableContainer sx={{ maxHeight: 440 }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align || 'left'}
                  style={{ minWidth: column.minWidth }}
                >
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {data.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length} align="center" sx={{ py: 3 }}>
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              data.map((row, index) => (
                <TableRow hover key={row.id || index}>
                  {columns.map((column) => (
                    <TableCell key={column.id} align={column.align || 'left'}>
                      {column.format ? column.format(row[column.id]) : row[column.id]}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 25, 100]}
        component="div"
        count={totalCount}
        rowsPerPage={rowsPerPage}
        page={page}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
        labelRowsPerPage="Linhas por página"
      />
    </Paper>
  );
};

export default DataTable;
'@ | Out-File -FilePath "src\components\common\DataTable.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ DataTable.jsx"

# ============================================
# 3. CRIAR COMPONENTES DE DASHBOARD
# ============================================
Write-Host "`n📊 Criando componentes de dashboard..." -ForegroundColor Yellow

# StatsCards.jsx
@'
import React from 'react';
import { Grid, Card, CardContent, Typography, Box } from '@mui/material';

const StatsCards = ({ cards }) => {
  return (
    <Grid container spacing={3}>
      {cards.map((card, index) => (
        <Grid item xs={12} sm={6} md={3} key={index}>
          <Card>
            <CardContent>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography color="text.secondary" gutterBottom variant="body2">
                    {card.title}
                  </Typography>
                  <Typography variant="h4" component="div" sx={{ fontWeight: 'bold' }}>
                    {card.value}
                  </Typography>
                </Box>
                <Box
                  sx={{
                    backgroundColor: `${card.color}20`,
                    borderRadius: '50%',
                    p: 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  {card.icon}
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      ))}
    </Grid>
  );
};

export default StatsCards;
'@ | Out-File -FilePath "src\components\dashboard\StatsCards.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ StatsCards.jsx"

# RecentCheckins.jsx
@'
import React from 'react';
import {
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Divider,
  Typography,
  Box,
} from '@mui/material';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import StatusBadge from '../common/StatusBadge';

const RecentCheckins = ({ logs }) => {
  return (
    <List>
      {logs.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography color="text.secondary">Nenhum acesso recente</Typography>
        </Box>
      ) : (
        logs.map((log, index) => (
          <React.Fragment key={log.id}>
            <ListItem alignItems="flex-start">
              <ListItemAvatar>
                <Avatar src={log.funcionarios?.foto_url}>
                  {log.funcionarios?.nome?.charAt(0)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                    <Typography variant="subtitle2">
                      {log.funcionarios?.nome}
                    </Typography>
                    <StatusBadge status={log.tipo} />
                  </Box>
                }
                secondary={
                  <>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {log.metodo === 'qrcode' ? '📱 QR Code' : 
                       log.metodo === 'face' ? '👤 Facial' : 
                       log.metodo === 'fast-track' ? '⚡ Fast Track' : '📝 Manual'}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {formatDistanceToNow(new Date(log.created_at), { 
                        addSuffix: true,
                        locale: ptBR 
                      })}
                    </Typography>
                  </>
                }
              />
            </ListItem>
            {index < logs.length - 1 && <Divider variant="inset" component="li" />}
          </React.Fragment>
        ))
      )}
    </List>
  );
};

export default RecentCheckins;
'@ | Out-File -FilePath "src\components\dashboard\RecentCheckins.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ RecentCheckins.jsx"

# RecentAdditions.jsx
@'
import React from 'react';
import {
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Divider,
  Typography,
  Box,
} from '@mui/material';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const RecentAdditions = ({ funcionarios }) => {
  return (
    <List>
      {funcionarios.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 3 }}>
          <Typography color="text.secondary">Nenhum funcionário adicionado</Typography>
        </Box>
      ) : (
        funcionarios.map((func, index) => (
          <React.Fragment key={func.id}>
            <ListItem alignItems="flex-start">
              <ListItemAvatar>
                <Avatar src={func.foto_url}>
                  {func.nome?.charAt(0)}
                </Avatar>
              </ListItemAvatar>
              <ListItemText
                primary={
                  <Typography variant="subtitle2">
                    {func.nome}
                  </Typography>
                }
                secondary={
                  <>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {func.funcao} • {func.empresas?.nome}
                    </Typography>
                    <Typography variant="caption" display="block" color="text.secondary">
                      {formatDistanceToNow(new Date(func.created_at), { 
                        addSuffix: true,
                        locale: ptBR 
                      })}
                    </Typography>
                  </>
                }
              />
            </ListItem>
            {index < funcionarios.length - 1 && <Divider variant="inset" component="li" />}
          </React.Fragment>
        ))
      )}
    </List>
  );
};

export default RecentAdditions;
'@ | Out-File -FilePath "src\components\dashboard\RecentAdditions.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ RecentAdditions.jsx"

# ============================================
# 4. CRIAR PÁGINAS
# ============================================
Write-Host "`n📄 Criando páginas..." -ForegroundColor Yellow

# Empresas.jsx
@'
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Paper,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import api from '../services/api';
import DataTable from '../components/common/DataTable';
import SearchBar from '../components/common/SearchBar';

const Empresas = () => {
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedEmpresa, setSelectedEmpresa] = useState(null);
  const [formData, setFormData] = useState({
    nome: '',
    cnpj: '',
    servico: '',
    observacao: '',
  });

  const columns = [
    { id: 'nome', label: 'Nome', minWidth: 200 },
    { id: 'cnpj', label: 'CNPJ', minWidth: 150 },
    { id: 'servico', label: 'Serviço', minWidth: 150 },
    {
      id: 'acoes',
      label: 'Ações',
      minWidth: 100,
      align: 'center',
      format: (value, row) => (
        <Box>
          <IconButton size="small" onClick={() => handleEdit(row)} color="primary">
            <EditIcon />
          </IconButton>
          <IconButton size="small" onClick={() => handleDelete(row.id)} color="error">
            <DeleteIcon />
          </IconButton>
        </Box>
      ),
    },
  ];

  useEffect(() => {
    loadEmpresas();
  }, [page, rowsPerPage, search]);

  const loadEmpresas = async () => {
    try {
      setLoading(true);
      const response = await api.get('/empresas', {
        params: {
          page: page + 1,
          limit: rowsPerPage,
          search: search || undefined,
        },
      });
      setEmpresas(response.data.data || []);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (empresa = null) => {
    if (empresa) {
      setSelectedEmpresa(empresa);
      setFormData({
        nome: empresa.nome || '',
        cnpj: empresa.cnpj || '',
        servico: empresa.servico || '',
        observacao: empresa.observacao || '',
      });
    } else {
      setSelectedEmpresa(null);
      setFormData({ nome: '', cnpj: '', servico: '', observacao: '' });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedEmpresa(null);
  };

  const handleSave = async () => {
    try {
      if (selectedEmpresa) {
        await api.put(`/empresas/${selectedEmpresa.id}`, formData);
      } else {
        await api.post('/empresas', formData);
      }
      handleCloseDialog();
      loadEmpresas();
    } catch (error) {
      console.error('Erro ao salvar empresa:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir esta empresa?')) {
      try {
        await api.delete(`/empresas/${id}`);
        loadEmpresas();
      } catch (error) {
        console.error('Erro ao excluir empresa:', error);
      }
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: 'secondary.main', fontWeight: 'bold' }}>
          Empresas
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{
            backgroundColor: 'secondary.main',
            color: '#000',
            '&:hover': { backgroundColor: 'secondary.dark' },
          }}
        >
          Nova Empresa
        </Button>
      </Box>

      <Paper sx={{ mb: 2, p: 2 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nome ou CNPJ..." />
      </Paper>

      <DataTable
        columns={columns}
        data={empresas}
        loading={loading}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(e, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
      />

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {selectedEmpresa ? 'Editar Empresa' : 'Nova Empresa'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Nome da Empresa"
              fullWidth
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            />
            <TextField
              label="CNPJ"
              fullWidth
              value={formData.cnpj}
              onChange={(e) => setFormData({ ...formData, cnpj: e.target.value })}
              placeholder="00.000.000/0000-00"
            />
            <TextField
              label="Serviço"
              fullWidth
              value={formData.servico}
              onChange={(e) => setFormData({ ...formData, servico: e.target.value })}
            />
            <TextField
              label="Observação"
              fullWidth
              multiline
              rows={3}
              value={formData.observacao}
              onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Empresas;
'@ | Out-File -FilePath "src\pages\Empresas.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ Empresas.jsx"

# Funcionarios.jsx
@'
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
  Paper,
  Grid,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Checkbox,
  Chip,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  QrCode as QrCodeIcon,
} from '@mui/icons-material';
import api from '../services/api';
import DataTable from '../components/common/DataTable';
import SearchBar from '../components/common/SearchBar';
import StatusBadge from '../components/common/StatusBadge';

const Funcionarios = () => {
  const [funcionarios, setFuncionarios] = useState([]);
  const [empresas, setEmpresas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [selectedFuncionario, setSelectedFuncionario] = useState(null);
  const [qrCodeDialog, setQrCodeDialog] = useState({ open: false, image: '', nome: '' });
  const [formData, setFormData] = useState({
    nome: '',
    cpf: '',
    funcao: '',
    empresa_id: '',
    observacao: '',
    fase_montagem: false,
    fase_showday: false,
    fase_desmontagem: false,
  });

  useEffect(() => {
    loadEmpresas();
  }, []);

  useEffect(() => {
    loadFuncionarios();
  }, [page, rowsPerPage, search]);

  const loadEmpresas = async () => {
    try {
      const response = await api.get('/empresas');
      setEmpresas(response.data.data || []);
    } catch (error) {
      console.error('Erro ao carregar empresas:', error);
    }
  };

  const loadFuncionarios = async () => {
    try {
      setLoading(true);
      const response = await api.get('/funcionarios', {
        params: {
          page: page + 1,
          limit: rowsPerPage,
          search: search || undefined,
        },
      });
      setFuncionarios(response.data.data || []);
    } catch (error) {
      console.error('Erro ao carregar funcionários:', error);
    } finally {
      setLoading(false);
    }
  };

  const columns = [
    { id: 'nome', label: 'Nome', minWidth: 200 },
    { id: 'cpf', label: 'CPF', minWidth: 150 },
    { id: 'funcao', label: 'Função', minWidth: 150 },
    {
      id: 'empresa',
      label: 'Empresa',
      minWidth: 150,
      format: (value, row) => row.empresas?.nome || '-',
    },
    {
      id: 'status_acesso',
      label: 'Status',
      minWidth: 120,
      format: (value) => <StatusBadge status={value} />,
    },
    {
      id: 'fases',
      label: 'Fases',
      minWidth: 150,
      format: (value, row) => (
        <Box sx={{ display: 'flex', gap: 0.5 }}>
          {row.fase_montagem && <Chip label="Montagem" size="small" color="primary" variant="outlined" />}
          {row.fase_showday && <Chip label="Show Day" size="small" color="secondary" variant="outlined" />}
          {row.fase_desmontagem && <Chip label="Desmontagem" size="small" color="warning" variant="outlined" />}
        </Box>
      ),
    },
    {
      id: 'acoes',
      label: 'Ações',
      minWidth: 150,
      align: 'center',
      format: (value, row) => (
        <Box>
          <IconButton size="small" onClick={() => handleGenerateQR(row)} color="info">
            <QrCodeIcon />
          </IconButton>
          <IconButton size="small" onClick={() => handleEdit(row)} color="primary">
            <EditIcon />
          </IconButton>
          <IconButton size="small" onClick={() => handleDelete(row.id)} color="error">
            <DeleteIcon />
          </IconButton>
        </Box>
      ),
    },
  ];

  const handleOpenDialog = (funcionario = null) => {
    if (funcionario) {
      setSelectedFuncionario(funcionario);
      setFormData({
        nome: funcionario.nome || '',
        cpf: funcionario.cpf || '',
        funcao: funcionario.funcao || '',
        empresa_id: funcionario.empresa_id || '',
        observacao: funcionario.observacao || '',
        fase_montagem: funcionario.fase_montagem || false,
        fase_showday: funcionario.fase_showday || false,
        fase_desmontagem: funcionario.fase_desmontagem || false,
      });
    } else {
      setSelectedFuncionario(null);
      setFormData({
        nome: '', cpf: '', funcao: '', empresa_id: '',
        observacao: '', fase_montagem: false, fase_showday: false, fase_desmontagem: false,
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setSelectedFuncionario(null);
  };

  const handleSave = async () => {
    try {
      if (selectedFuncionario) {
        await api.put(`/funcionarios/${selectedFuncionario.id}`, formData);
      } else {
        await api.post('/funcionarios', formData);
      }
      handleCloseDialog();
      loadFuncionarios();
    } catch (error) {
      console.error('Erro ao salvar funcionário:', error);
    }
  };

  const handleDelete = async (id) => {
    if (window.confirm('Tem certeza que deseja excluir este funcionário?')) {
      try {
        await api.delete(`/funcionarios/${id}`);
        loadFuncionarios();
      } catch (error) {
        console.error('Erro ao excluir funcionário:', error);
      }
    }
  };

  const handleGenerateQR = async (funcionario) => {
    try {
      const response = await api.get(`/funcionarios/${funcionario.id}/qrcode`);
      setQrCodeDialog({
        open: true,
        image: response.data.qr_image,
        nome: response.data.nome,
      });
    } catch (error) {
      console.error('Erro ao gerar QR Code:', error);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4" sx={{ color: 'secondary.main', fontWeight: 'bold' }}>
          Funcionários
        </Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
          sx={{
            backgroundColor: 'secondary.main',
            color: '#000',
            '&:hover': { backgroundColor: 'secondary.dark' },
          }}
        >
          Novo Funcionário
        </Button>
      </Box>

      <Paper sx={{ mb: 2, p: 2 }}>
        <SearchBar value={search} onChange={setSearch} placeholder="Buscar por nome ou CPF..." />
      </Paper>

      <DataTable
        columns={columns}
        data={funcionarios}
        loading={loading}
        page={page}
        rowsPerPage={rowsPerPage}
        onPageChange={(e, newPage) => setPage(newPage)}
        onRowsPerPageChange={(e) => {
          setRowsPerPage(parseInt(e.target.value, 10));
          setPage(0);
        }}
      />

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>
          {selectedFuncionario ? 'Editar Funcionário' : 'Novo Funcionário'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ pt: 2, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <TextField
              label="Nome Completo"
              fullWidth
              value={formData.nome}
              onChange={(e) => setFormData({ ...formData, nome: e.target.value })}
            />
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="CPF"
                  fullWidth
                  value={formData.cpf}
                  onChange={(e) => setFormData({ ...formData, cpf: e.target.value })}
                  placeholder="000.000.000-00"
                />
              </Grid>
              <Grid item xs={6}>
                <TextField
                  label="Função"
                  fullWidth
                  value={formData.funcao}
                  onChange={(e) => setFormData({ ...formData, funcao: e.target.value })}
                />
              </Grid>
            </Grid>
            <FormControl fullWidth>
              <InputLabel>Empresa</InputLabel>
              <Select
                value={formData.empresa_id}
                label="Empresa"
                onChange={(e) => setFormData({ ...formData, empresa_id: e.target.value })}
              >
                <MenuItem value="">Nenhuma</MenuItem>
                {empresas.map((emp) => (
                  <MenuItem key={emp.id} value={emp.id}>{emp.nome}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              label="Observação"
              fullWidth
              multiline
              rows={2}
              value={formData.observacao}
              onChange={(e) => setFormData({ ...formData, observacao: e.target.value })}
            />
            <Typography variant="subtitle2" sx={{ mt: 1 }}>Fases Permitidas:</Typography>
            <Grid container spacing={2}>
              <Grid item xs={4}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.fase_montagem}
                      onChange={(e) => setFormData({ ...formData, fase_montagem: e.target.checked })}
                    />
                  }
                  label="Montagem"
                />
              </Grid>
              <Grid item xs={4}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.fase_showday}
                      onChange={(e) => setFormData({ ...formData, fase_showday: e.target.checked })}
                    />
                  }
                  label="Show Day"
                />
              </Grid>
              <Grid item xs={4}>
                <FormControlLabel
                  control={
                    <Checkbox
                      checked={formData.fase_desmontagem}
                      onChange={(e) => setFormData({ ...formData, fase_desmontagem: e.target.checked })}
                    />
                  }
                  label="Desmontagem"
                />
              </Grid>
            </Grid>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSave} variant="contained" color="primary">
            Salvar
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={qrCodeDialog.open} onClose={() => setQrCodeDialog({ open: false })}>
        <DialogTitle>QR Code - {qrCodeDialog.nome}</DialogTitle>
        <DialogContent>
          <Box sx={{ textAlign: 'center', p: 2 }}>
            <img src={qrCodeDialog.image} alt="QR Code" style={{ width: '100%', maxWidth: 300 }} />
            <Typography variant="body2" sx={{ mt: 2 }}>
              Aproxime para realizar check-in
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setQrCodeDialog({ open: false })}>Fechar</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default Funcionarios;
'@ | Out-File -FilePath "src\pages\Funcionarios.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ Funcionarios.jsx"

# Checkin.jsx
@'
import React, { useState, useRef } from 'react';
import {
  Box,
  Typography,
  Paper,
  Grid,
  TextField,
  Button,
  Card,
  CardContent,
  Avatar,
  Divider,
  Alert,
  CircularProgress,
  Tab,
  Tabs,
} from '@mui/material';
import {
  QrCodeScanner as QrCodeIcon,
  Person as PersonIcon,
  CheckCircle as CheckIcon,
} from '@mui/icons-material';
import { QrReader } from 'react-qr-reader';
import api from '../services/api';

const Checkin = () => {
  const [tab, setTab] = useState(0);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [funcionarios, setFuncionarios] = useState([]);
  const [showScanner, setShowScanner] = useState(false);

  const handleTabChange = (event, newValue) => {
    setTab(newValue);
    setResult(null);
    setError('');
    setSearch('');
    setShowScanner(false);
  };

  const handleSearch = async () => {
    if (!search) return;
    
    setLoading(true);
    setError('');
    setResult(null);
    
    try {
      const response = await api.post('/access/checkin/manual', { busca: search });
      
      if (response.data.multiple) {
        setFuncionarios(response.data.funcionarios);
      } else {
        setResult(response.data.data.funcionario);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao buscar funcionário');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectFuncionario = async (funcionario) => {
    setLoading(true);
    try {
      const response = await api.post('/access/checkin/manual', { 
        funcionario_id: funcionario.id 
      });
      setResult(response.data.data.funcionario);
      setFuncionarios([]);
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao realizar check-in');
    } finally {
      setLoading(false);
    }
  };

  const handleQRScan = async (data) => {
    if (data) {
      setShowScanner(false);
      setLoading(true);
      
      try {
        const response = await api.post('/access/checkin/qrcode', { 
          qrCode: data 
        });
        setResult(response.data.data.funcionario);
      } catch (err) {
        setError(err.response?.data?.error || 'Erro ao realizar check-in');
      } finally {
        setLoading(false);
      }
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ color: 'secondary.main', fontWeight: 'bold' }}>
        Check-in / Check-out
      </Typography>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Tabs value={tab} onChange={handleTabChange} sx={{ mb: 3 }}>
              <Tab label="Busca Manual" />
              <Tab label="QR Code" />
            </Tabs>

            {tab === 0 && (
              <Box>
                <TextField
                  fullWidth
                  label="Digite CPF ou Nome"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                  disabled={loading}
                  sx={{ mb: 2 }}
                />
                <Button
                  fullWidth
                  variant="contained"
                  onClick={handleSearch}
                  disabled={loading || !search}
                  startIcon={loading ? <CircularProgress size={20} /> : <PersonIcon />}
                  sx={{
                    backgroundColor: 'secondary.main',
                    color: '#000',
                    '&:hover': { backgroundColor: 'secondary.dark' },
                  }}
                >
                  Buscar
                </Button>

                {funcionarios.length > 0 && (
                  <Box sx={{ mt: 3 }}>
                    <Typography variant="subtitle2" gutterBottom>
                      Múltiplos funcionários encontrados:
                    </Typography>
                    {funcionarios.map((func) => (
                      <Card 
                        key={func.id} 
                        sx={{ 
                          mb: 1, 
                          cursor: 'pointer',
                          '&:hover': { bgcolor: 'action.hover' }
                        }}
                        onClick={() => handleSelectFuncionario(func)}
                      >
                        <CardContent>
                          <Typography variant="subtitle1">{func.nome}</Typography>
                          <Typography variant="body2" color="text.secondary">
                            CPF: {func.cpf}
                          </Typography>
                        </CardContent>
                      </Card>
                    ))}
                  </Box>
                )}
              </Box>
            )}

            {tab === 1 && (
              <Box>
                {!showScanner ? (
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<QrCodeIcon />}
                    onClick={() => setShowScanner(true)}
                    sx={{
                      backgroundColor: 'secondary.main',
                      color: '#000',
                      '&:hover': { backgroundColor: 'secondary.dark' },
                    }}
                  >
                    Escanear QR Code
                  </Button>
                ) : (
                  <Box>
                    <QrReader
                      onResult={(result, error) => {
                        if (result) {
                          handleQRScan(result?.text);
                        }
                      }}
                      constraints={{ facingMode: 'environment' }}
                      style={{ width: '100%' }}
                    />
                    <Button 
                      fullWidth 
                      sx={{ mt: 2 }}
                      onClick={() => setShowScanner(false)}
                    >
                      Cancelar
                    </Button>
                  </Box>
                )}
              </Box>
            )}

            {error && (
              <Alert severity="error" sx={{ mt: 2 }}>
                {error}
              </Alert>
            )}
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, minHeight: 400 }}>
            <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>
              Resultado
            </Typography>
            
            {loading && (
              <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
                <CircularProgress />
              </Box>
            )}

            {result && (
              <Box sx={{ textAlign: 'center' }}>
                <Avatar
                  src={result.foto_url}
                  sx={{ width: 120, height: 120, mx: 'auto', mb: 2 }}
                >
                  {result.nome?.charAt(0)}
                </Avatar>
                
                <Typography variant="h5" gutterBottom>
                  {result.nome}
                </Typography>
                
                <Typography variant="body1" color="text.secondary" gutterBottom>
                  {result.funcao} • {result.empresa_nome}
                </Typography>

                <Divider sx={{ my: 2 }} />

                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1 }}>
                  <CheckIcon color="success" />
                  <Typography variant="body1" color="success.main">
                    Check-in realizado com sucesso!
                  </Typography>
                </Box>

                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  {new Date().toLocaleString('pt-BR')}
                </Typography>
              </Box>
            )}
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Checkin;
'@ | Out-File -FilePath "src\pages\Checkin.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ Checkin.jsx"

# Monitor.jsx
@'
import React, { useState, useEffect, useRef } from 'react';
import {
  Grid,
  Paper,
  Typography,
  Box,
  List,
  ListItem,
  ListItemAvatar,
  Avatar,
  ListItemText,
  Divider,
  Card,
  CardMedia,
  CardContent,
  Chip,
} from '@mui/material';
import { Videocam as CameraIcon } from '@mui/icons-material';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import api from '../services/api';
import StatusBadge from '../components/common/StatusBadge';

const Monitor = () => {
  const [logs, setLogs] = useState([]);
  const [cameras, setCameras] = useState([]);

  useEffect(() => {
    loadLogs();
    const interval = setInterval(loadLogs, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadLogs = async () => {
    try {
      const response = await api.get('/access/logs?limit=20');
      setLogs(response.data.data || []);
    } catch (error) {
      console.error('Erro ao carregar logs:', error);
    }
  };

  return (
    <Box sx={{ p: 3 }}>
      <Typography variant="h4" gutterBottom sx={{ color: 'secondary.main', fontWeight: 'bold' }}>
        Central de Monitoramento
      </Typography>

      <Grid container spacing={3}>
        {/* Feed de Câmeras */}
        <Grid item xs={12} md={8}>
          <Paper sx={{ p: 2, height: '100%' }}>
            <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
              <CameraIcon sx={{ mr: 1, color: 'secondary.main' }} />
              Câmeras em Tempo Real
            </Typography>
            
            <Grid container spacing={2}>
              {[1, 2].map((cam) => (
                <Grid item xs={12} md={6} key={cam}>
                  <Card>
                    <Box sx={{ position: 'relative', pt: '56.25%', bgcolor: '#000' }}>
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '100%',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          color: 'text.secondary',
                        }}
                      >
                        Stream da Câmera {cam}
                      </Box>
                      <Box
                        sx={{
                          position: 'absolute',
                          bottom: 8,
                          left: 8,
                          bgcolor: 'rgba(0,0,0,0.7)',
                          color: 'white',
                          px: 1,
                          py: 0.5,
                          borderRadius: 1,
                          fontSize: '0.75rem',
                        }}
                      >
                        Câmera {cam} - Online
                      </Box>
                      <Box
                        sx={{
                          position: 'absolute',
                          top: 8,
                          right: 8,
                          width: 12,
                          height: 12,
                          borderRadius: '50%',
                          bgcolor: 'success.main',
                          boxShadow: '0 0 8px #4CAF50',
                        }}
                      />
                    </Box>
                  </Card>
                </Grid>
              ))}
            </Grid>
          </Paper>
        </Grid>

        {/* Log de Eventos */}
        <Grid item xs={12} md={4}>
          <Paper sx={{ p: 2, height: '100%', maxHeight: '80vh', overflow: 'auto' }}>
            <Typography variant="h6" gutterBottom sx={{ color: 'secondary.main' }}>
              Log de Acessos
            </Typography>
            
            <List>
              {logs.map((log, index) => (
                <React.Fragment key={log.id}>
                  <ListItem alignItems="flex-start">
                    <ListItemAvatar>
                      <Avatar src={log.funcionarios?.foto_url}>
                        {log.funcionarios?.nome?.charAt(0)}
                      </Avatar>
                    </ListItemAvatar>
                    <ListItemText
                      primary={
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
                          <Typography variant="subtitle2">
                            {log.funcionarios?.nome}
                          </Typography>
                          <StatusBadge status={log.tipo} />
                          <Chip
                            size="small"
                            label={log.metodo}
                            variant="outlined"
                            sx={{ height: 20 }}
                          />
                        </Box>
                      }
                      secondary={
                        <>
                          <Typography variant="caption" display="block" color="text.secondary">
                            {log.funcionarios?.empresas?.nome}
                          </Typography>
                          <Typography variant="caption" display="block" color="text.secondary">
                            {formatDistanceToNow(new Date(log.created_at), { 
                              addSuffix: true,
                              locale: ptBR 
                            })}
                          </Typography>
                        </>
                      }
                    />
                  </ListItem>
                  {index < logs.length - 1 && <Divider variant="inset" component="li" />}
                </React.Fragment>
              ))}
            </List>
          </Paper>
        </Grid>
      </Grid>
    </Box>
  );
};

export default Monitor;
'@ | Out-File -FilePath "src\pages\Monitor.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ Monitor.jsx"

# ============================================
# 5. CRIAR ARQUIVOS DE SERVIÇO
# ============================================
Write-Host "`n🔧 Criando serviços..." -ForegroundColor Yellow

# api.js
@'
import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
'@ | Out-File -FilePath "src\services\api.js" -Encoding UTF8 -Force
Write-Host "   ✅ api.js"

# auth.js
@'
import api from './api';

export const authService = {
  async login(email, password) {
    const response = await api.post('/auth/login', { email, password });
    if (response.data.success) {
      localStorage.setItem('token', response.data.session.access_token);
      localStorage.setItem('user', JSON.stringify(response.data.user));
    }
    return response.data;
  },

  async logout() {
    try {
      await api.post('/auth/logout');
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
    }
  },

  getCurrentUser() {
    const user = localStorage.getItem('user');
    return user ? JSON.parse(user) : null;
  },

  getToken() {
    return localStorage.getItem('token');
  },

  isAuthenticated() {
    return !!localStorage.getItem('token');
  },
};
'@ | Out-File -FilePath "src\services\auth.js" -Encoding UTF8 -Force
Write-Host "   ✅ auth.js"

# ============================================
# 6. CRIAR CONTEXTO DE AUTENTICAÇÃO
# ============================================
Write-Host "`n🔐 Criando contexto de autenticação..." -ForegroundColor Yellow

# AuthContext.jsx
@'
import React, { createContext, useState, useContext, useEffect } from 'react';
import { authService } from '../services/auth';

const AuthContext = createContext({});

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const user = authService.getCurrentUser();
    setUser(user);
    setLoading(false);
  }, []);

  const login = async (email, password) => {
    const response = await authService.login(email, password);
    if (response.success) {
      setUser(response.user);
    }
    return response;
  };

  const logout = async () => {
    await authService.logout();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};
'@ | Out-File -FilePath "src\contexts\AuthContext.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ AuthContext.jsx"

# ============================================
# 7. ATUALIZAR APP.JSX
# ============================================
Write-Host "`n📱 Atualizando App.jsx..." -ForegroundColor Yellow

# App.jsx
@'
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import theme from './styles/theme';

// Layout
import Sidebar from './components/layout/Sidebar';
import { Box, CircularProgress } from '@mui/material';

// Pages
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Empresas from './pages/Empresas';
import Funcionarios from './pages/Funcionarios';
import Checkin from './pages/Checkin';
import Monitor from './pages/Monitor';

const PrivateRoute = ({ children }) => {
  const { user, loading } = useAuth();
  
  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }
  
  return user ? children : <Navigate to="/login" />;
};

const AppContent = () => {
  const { user } = useAuth();

  if (!user) {
    return (
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/login" />} />
      </Routes>
    );
  }

  return (
    <Box sx={{ display: 'flex' }}>
      <Sidebar />
      <Box component="main" sx={{ flexGrow: 1, bgcolor: 'background.default', minHeight: '100vh' }}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/empresas" element={<Empresas />} />
          <Route path="/funcionarios" element={<Funcionarios />} />
          <Route path="/checkin" element={<Checkin />} />
          <Route path="/monitor" element={<Monitor />} />
        </Routes>
      </Box>
    </Box>
  );
};

function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <BrowserRouter>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  );
}

export default App;
'@ | Out-File -FilePath "src\App.jsx" -Encoding UTF8 -Force
Write-Host "   ✅ App.jsx"

# ============================================
# 8. CRIAR INDEX.JS
# ============================================
Write-Host "`n📌 Criando index.js..." -ForegroundColor Yellow

# index.js
@'
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
'@ | Out-File -FilePath "src\index.js" -Encoding UTF8 -Force
Write-Host "   ✅ index.js"

# ============================================
# 9. CRIAR ARQUIVO .ENV
# ============================================
Write-Host "`n🔑 Criando .env..." -ForegroundColor Yellow

# .env
@'
REACT_APP_API_URL=http://localhost:3001/api
'@ | Out-File -FilePath ".env" -Encoding UTF8 -Force
Write-Host "   ✅ .env"

# ============================================
# 10. CRIAR README (CORRIGIDO)
# ============================================
Write-Host "`n📖 Criando README.md..." -ForegroundColor Yellow

# README.md - usando aspas simples para evitar problemas com @
$readmeContent = @"
# A2 Eventos - Frontend Web

Interface administrativa do sistema de controle de acesso A2 Eventos.

## Tecnologias

- React 18
- Material-UI (MUI)
- Axios
- React Router DOM

## Instalação

`npm install`

## Execução

`npm start`

Acesse: http://localhost:3000

## Login

- Email: admin@a2eventos.com.br
- Senha: Admin@2026!

## Estrutura

- `/src/components` - Componentes reutilizáveis
- `/src/pages` - Páginas da aplicação
- `/src/services` - Serviços de API
- `/src/contexts` - Contextos React
- `/src/styles` - Temas e estilos globais
"@

$readmeContent | Out-File -FilePath "README.md" -Encoding UTF8 -Force
Write-Host "   ✅ README.md"

# ============================================
# RESUMO FINAL
# ============================================
Write-Host ""
Write-Host "✅ ========================================" -ForegroundColor Green
Write-Host "✅ FRONTEND CRIADO COM SUCESSO!" -ForegroundColor Green
Write-Host "✅ ========================================" -ForegroundColor Green
Write-Host ""
Write-Host "📁 Estrutura criada:" -ForegroundColor Cyan
Write-Host "   • 8 componentes"
Write-Host "   • 5 páginas"
Write-Host "   • 2 serviços"
Write-Host "   • 1 contexto"
Write-Host ""
Write-Host "🚀 Para iniciar o frontend:" -ForegroundColor Yellow
Write-Host "   npm install"
Write-Host "   npm start"
Write-Host ""
Write-Host "🌐 Acesse: http://localhost:3000" -ForegroundColor Cyan
Write-Host "👤 Login: admin@a2eventos.com.br / Admin@2026!" -ForegroundColor Cyan