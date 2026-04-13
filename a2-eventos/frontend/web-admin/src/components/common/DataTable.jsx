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
  Divider,
  Checkbox
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
}) => {
  const theme = useTheme();
  // sm usually translates to 600px breakpoint in MUI. It means mobile phones.
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

  // Clamp page to valid range to prevent MUI warning
  const maxPage = totalCount > 0 ? Math.ceil(totalCount / rowsPerPage) - 1 : 0;
  const safePage = totalCount === 0 ? 0 : Math.max(0, Math.min(page, maxPage));

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
        <CircularProgress />
      </Box>
    );
  }

  const handleSelectAll = (event) => {
    if (event.target.checked) {
      onSelectionChange(data.map((r) => r.id));
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
      <Box sx={{ width: '100%' }}>
        <Stack spacing={2} sx={{ mb: 2 }}>
          {data.length === 0 ? (
            <Paper sx={{ p: 3, textAlign: 'center' }}>
              <Typography variant="body2" color="text.secondary">Nenhum registro encontrado</Typography>
            </Paper>
          ) : (
            data.map((row, index) => (
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
          count={totalCount}
          rowsPerPage={rowsPerPage}
          page={safePage}
          onPageChange={onPageChange}
          onRowsPerPageChange={onRowsPerPageChange}
          labelRowsPerPage="Itens por pág" // Abreviação útil no mobile
          sx={{ borderTop: 'none', '.MuiToolbar-root': { pl: 0, pr: 0 }, '.MuiTablePagination-selectLabel, .MuiTablePagination-select, .MuiTablePagination-selectIcon': { display: 'none' } }}
        />
      </Box>
    );
  }

  // Desktop Render (Standard Table)
  return (
    <Paper sx={{ width: '100%', overflow: 'hidden' }}>
      <TableContainer sx={{ maxHeight: 440 }}>
        <Table stickyHeader>
          <TableHead>
            <TableRow>
              {checkboxSelection && (
                <TableCell padding="checkbox">
                  <Checkbox
                    indeterminate={selected.length > 0 && selected.length < data.length}
                    checked={data.length > 0 && selected.length === data.length}
                    onChange={handleSelectAll}
                    sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#00D4FF' }, '&.MuiCheckbox-indeterminate': { color: '#00D4FF' } }}
                  />
                </TableCell>
              )}
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
              data.map((row, index) => {
                const isItemSelected = isSelected(row.id);
                return (
                  <TableRow
                    hover
                    key={row.id || index}
                    selected={isItemSelected}
                    sx={{ '&.Mui-selected, &.Mui-selected:hover': { bgcolor: 'rgba(0, 212, 255, 0.05)' } }}
                    onDoubleClick={onRowDoubleClick ? () => onRowDoubleClick(row) : undefined}
                  >
                    {checkboxSelection && (
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={isItemSelected}
                          onChange={(event) => handleSelectOne(event, row.id)}
                          sx={{ color: 'rgba(255,255,255,0.3)', '&.Mui-checked': { color: '#00D4FF' } }}
                        />
                      </TableCell>
                    )}
                    {columns.map((column) => (
                      <TableCell key={column.id} align={column.align || 'left'}>
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
        count={totalCount}
        rowsPerPage={rowsPerPage}
        page={safePage}
        onPageChange={onPageChange}
        onRowsPerPageChange={onRowsPerPageChange}
        labelRowsPerPage="Linhas por página"
      />
    </Paper>
  );
};

export default DataTable;
