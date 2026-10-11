import React from 'react';
import {
    Box,
    Grid,
    Typography,
} from '@mui/material';
import {
    Add as AddIcon,
    Event as EventIcon,
} from '@mui/icons-material';
import PageHeader from '../components/common/PageHeader';
import NeonButton from '../components/common/NeonButton';
import ConfirmDialog from '../components/common/ConfirmDialog';
import { useEventos } from '../hooks/useEventos';
import EventCard from '../components/evento/EventCard';
import EventFormDialog from '../components/evento/EventFormDialog';

const Eventos = ({ isEmbedded = false }) => {
    const {
        eventos,
        loading,
        saving,
        deleteLoading,
        openDialog,
        openDeleteConfirm,
        setOpenDeleteConfirm,
        selectedEvento,
        tabValue,
        setTabValue,
        formData,
        setFormData,
        handleOpenDialog,
        handleCloseDialog,
        handleSave,
        toggleStatus,
        handleDelete,
        confirmDelete,
        handleGerenciar,
        handleDateToggle,
        handleSelectAll,
        handleClearAll,
        generateDateRange
    } = useEventos();

    return (
        <Box sx={{ p: isEmbedded ? 2 : { xs: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: isEmbedded ? 'flex-end' : 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 3, flexWrap: 'wrap', gap: 2 }}>
                {!isEmbedded && (
                    <PageHeader
                        title="Eventos"
                        subtitle="Crie e gerencie os eventos do sistema."
                        breadcrumbs={[{ text: 'Dashboard' }, { text: 'Eventos' }]}
                        sx={{ mb: 0 }}
                    />
                )}
                <NeonButton
                    startIcon={<AddIcon />}
                    onClick={() => handleOpenDialog()}
                    sx={{ mt: 0, height: 40 }}
                >
                    Novo evento
                </NeonButton>
            </Box>

            <Grid container spacing={3}>
                {eventos.map((evento) => (
                    <Grid item xs={12} md={6} lg={4} key={evento.id}>
                        <EventCard
                            evento={evento}
                            toggleStatus={toggleStatus}
                            handleGerenciar={handleGerenciar}
                            handleOpenDialog={handleOpenDialog}
                            handleDelete={handleDelete}
                        />
                    </Grid>
                ))}

                {eventos.length === 0 && !loading && (
                    <Grid item xs={12}>
                        <Box sx={{ py: 10, textAlign: 'center', opacity: 0.5 }}>
                            <EventIcon sx={{ fontSize: 80, mb: 2 }} />
                            <Typography variant="h5">Nenhum evento encontrado</Typography>
                            <Typography>Nenhum evento cadastrado. Clique em &quot;Novo evento&quot; para começar.</Typography>
                        </Box>
                    </Grid>
                )}
            </Grid>

            <EventFormDialog
                open={openDialog}
                onClose={handleCloseDialog}
                selectedEvento={selectedEvento}
                tabValue={tabValue}
                setTabValue={setTabValue}
                formData={formData}
                setFormData={setFormData}
                handleSave={handleSave}
                saving={saving}
                generateDateRange={generateDateRange}
                handleSelectAll={handleSelectAll}
                handleClearAll={handleClearAll}
                handleDateToggle={handleDateToggle}
            />

            <ConfirmDialog
                open={openDeleteConfirm}
                onConfirm={confirmDelete}
                onCancel={() => setOpenDeleteConfirm(false)}
                loading={deleteLoading}
                title="DESATIVAR NZT"
                message="Esta ação irá remover permanentemente o evento e todas as suas configurações de cota. Deseja prosseguir?"
            />
        </Box>
    );
};

export default Eventos;
