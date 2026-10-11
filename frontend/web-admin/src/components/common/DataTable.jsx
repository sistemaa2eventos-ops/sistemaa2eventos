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
  useMediaQuery,
  useTheme,
  Card,
  CardContent,
  Stack,
  Checkbox,
  Typography
} from '@mui/material';

const DataTable = ({
  columns,
  data = [],
  loading = false,
  page = 0,
  rowsPerPage = 10,
  totalCount = 0,
  onPageChange = () => { },
  onRowsPerPageChange = () => { },
  checkboxSelection = false,
  selected = [],
  onSelectionChange = () => { },
  onRowDoubleClick = undefined,
  maxHeight = 540,
  sx = {}
}) => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Paginação inteligente: se totalCount for informado, usa servidor; caso contrário, pagina no cliente
  const isServerPagination = totalCount > 0;
  const effectiveTotalCount = isServerPagination ? totalCount : data.length;

  const [internalPage, setInternalPage] = React.useState(0);
  const [internalRowsPerPage, setInternalRowsPerPage] = React.useState(rowsPerPage);

  const activeRowsPerPage = isServerPagination ? rowsPerPage : internalRowsPerPage;
  const maxPage = effectiveTotalCount > 0 ? Math.ceil(effectiveTotalCount / activeRowsPerPage) - 1 : 0;
  const safePage = effectiveTotalCount === 0 ? 0 : Math.max(0, Math.min(page, maxPage));
  const activePage = isServerPagination ? safePage : Math.min(internalPage, maxPage);

  const handlePageChange = (event, newPage) => {
    if (isServerPagination) {
      onPageChange(event, newPage);
    } else {
      setInternalPage(newPage);
    }
  };

  const handleRowsPerPageChange = (event) => {
    const newRows = parseInt(event.target.value, 10);
    if (isServerPagination) {
      onRowsPerPageChange(event);
    } else {
      setInternalRowsPerPage(newRows);
      setInternalPage(0);
    }
  };

  const paginatedData = isServerPagination
    ? data
    : data.slice(activePage * activeRowsPerPage, activePage * activeRowsPerPage + activeRowsPerPage);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress sx={{ color: '#00D4FF' }} />
      </Box>
    );
  }

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      onSelectionChange(paginatedData.map((r) => r.id));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectOne = (event, id) => {
    const selectedIndex = selected.indexOf(id);
    let newSelected = [];

    if (selectedIndex === -1) {
      newSelected = newSelected.concat(selected, id);
    } else if (selectedIndex === 0) {
      newSelected = newSelected.concat(selected.slice(1));
    } else if (selectedIndex === selected.length - 1) {
      newSelected = newSelected.concat(selected.slice(0, -1));
    } else if (selectedIndex > 0) {
      newSelected = newSelected.concat(
        selected.slice(0, selectedIndex),
        selected.slice(selectedIndex + 1)
      );
    }
    onSelectionChange(newSelected);
  };

  const isSelected = (id) => selected.indexOf(id) !== -1;

  // Mobile Render (Stacked Cards)
  if (isMobile) {
    return (
      <Box sx={{ width: '100%', ...sx }}>
        <Stack spacing={2} sx={{ mb: 2 }}>
          {paginatedData.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center', bgcolor: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <Typography variant="body2" color="text.secondary">Nenhum registro encontrado</Typography>
            </Paper>
          ) : (
            paginatedData.map((row, index) => (
              <Card
                key={row.id || index}
                variant="outlined"
                sx={{ bgcolor: isSelected(row.id) ? 'rgba(0, 212, 255, 0.05)' : 'rgba(255,255,255,0.02)', borderColor: isSelected(row.id) ? '#00D4FF' : 'rgba(255,255,255,0.1)' }}
                onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
              >
                <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
                  {checkboxSelection && (
                    <Box sx={{ mb: 1, display: 'flex', alignItems: 'center' }}>
                      <Checkbox
                        checked={isSelected(row.id)}
                        onChange={(event) => handleSelectOne(event, row.id)}
                        sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#00D4FF' } }}
                      />
                    </Box>
                  )}
                  <Stack spacing={1}>
                    {columns.map((column, colIndex) => (
                      <Box key={column.id} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: colIndex !== columns.length - 1 ? '1px dashed rgba(255,255,255,0.05)' : 'none', pb: colIndex !== columns.length - 1 ? 1 : 0 }}>
                        <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600, mr: 2, minWidth: '40%' }}>
                          {column.label}
                        </Typography>
                        <Box sx={{ flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {typeof column.format === 'function' ? column.format(row[column.id], row) : (
                            <Typography variant="body2" sx={{ fontWeight: 500 }}>{row[column.id]}</Typography>
                          )}
                        </Box>
                      </Box>
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            ))
          )}
        </Stack>
        <TablePagination
          rowsPerPageOptions={[10, 25, 50, 100]}
          component="div"
          count={effectiveTotalCount}
          rowsPerPage={activeRowsPerPage}
          page={activePage}
          onPageChange={handlePageChange}
          onRowsPerPageChange={handleRowsPerPageChange}
          labelRowsPerPage="Itens por pág"
          sx={{ borderTop: 'none', '.MuiToolbar-root': { pl: 0, pr: 0 }, '.MuiTablePagination-selectLabel, .MuiTablePagination-select, .MuiTablePagination-selectIcon': { display: 'none' } }}
        />
      </Box>
    );
  }

  // Desktop Render (Standard Table)
  return (
    <Paper sx={{ width: '100%', overflow: 'hidden', bgcolor: 'transparent', boxShadow: 'none', ...sx }}>
      <TableContainer 
        sx={{ 
          maxHeight: maxHeight || 540, 
          overflowX: 'auto',
          borderRadius: 1.5,
          '&::-webkit-scrollbar': { height: 8, width: 8 },
          '&::-webkit-scrollbar-thumb': { bgcolor: 'rgba(0, 212, 255, 0.25)', borderRadius: 1.5 },
          '&::-webkit-scrollbar-track': { bgcolor: 'rgba(0, 0, 0, 0.2)' }
        }} 
        component="div" 
        role="table" 
        aria-label="Tabela de dados"
      >
        <Table stickyHeader component="table" sx={{ minWidth: 'max-content' }}>
          <TableHead>
            <TableRow sx={{ bgcolor: '#0A1628 !important' }}>
              {checkboxSelection && (
                <TableCell 
                  padding="checkbox"
                  sx={{ 
                    bgcolor: '#0A1628 !important', 
                    zIndex: 11,
                    borderBottom: '2px solid rgba(0, 212, 255, 0.25)' 
                  }}
                >
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < paginatedData.length}
                    checked={paginatedData.length > 0 && selected.length === paginatedData.length}
                    onChange={handleSelectAll}
                    sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#00D4FF' }, '&.MuiCheckbox-indeterminate': { color: '#00D4FF' } }}
                  />
                </TableCell>
              )}
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align || 'left'}
                  sx={{
                    bgcolor: '#0A1628 !important',
                    color: '#94A3B8 !important',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    zIndex: 10,
                    borderBottom: '1px solid rgba(148, 163, 184, 0.16)',
                    minWidth: column.width || column.minWidth || 130,
                    width: column.width,
                    py: 1.5,
                    px: 2
                  }}
                >
                  {column.label}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={columns.length + (checkboxSelection ? 1 : 0)} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                  Nenhum registro encontrado
                </TableCell>
              </TableRow>
            ) : (
              paginatedData.map((row, index) => {
                const isItemSelected = isSelected(row.id);
                return (
                  <TableRow
                    hover
                    role="row"
                    key={row.id || index}
                    aria-selected={isItemSelected}
                    selected={isItemSelected}
                    sx={{ 
                        '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' },
                        '&:hover': { bgcolor: 'rgba(0, 212, 255, 0.02) !important' },
                        cursor: onRowDoubleClick ? 'pointer' : 'default',
                        transition: 'background-color 0.15s ease',
                    }}
                    onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                  >
                    {checkboxSelection && (
                      <TableCell padding="checkbox" role="cell" sx={{ py: 1.2, px: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <Checkbox
                          checked={isItemSelected}
                          onChange={(event) => handleSelectOne(event, row.id)}
                          inputProps={{ 'aria-label': `Selecionar linha ${index + 1}` }}
                          sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#00D4FF' }, '&:focus-visible': { outline: '2px solid #00D4FF', outlineOffset: 2 } }}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell 
                        key={column.id} 
                        align={column.align || 'left'}
                        sx={{
                          minWidth: column.width || column.minWidth || 130,
                          width: column.width,
                          whiteSpace: column.noWrap !== false ? 'nowrap' : 'normal',
                          py: 1.4,
                          px: 2,
                          borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
                          color: '#CBD5E1',
                          fontSize: '0.8125rem'
                        }}
                      >
                        {column.format ? column.format(row[column.id], row) : row[column.id]}
                      </TableCell>
                    ))}
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>
      <TablePagination
        rowsPerPageOptions={[10, 25, 50, 100]}
        component="div"
        count={effectiveTotalCount}
        rowsPerPage={activeRowsPerPage}
        page={activePage}
        onPageChange={handlePageChange}
        onRowsPerPageChange={handleRowsPerPageChange}
        labelRowsPerPage="Linhas por página"
        sx={{
          borderTop: '1px solid rgba(255, 255, 255, 0.05)',
          color: '#94A3B8',
          '.MuiTablePagination-select': { color: '#00D4FF', fontWeight: 700 },
          '.MuiTablePagination-displayedRows': { color: '#CBD5E1', fontSize: '0.8125rem' }
        }}
      />
    </Paper>
  );
};

export default DataTable;
