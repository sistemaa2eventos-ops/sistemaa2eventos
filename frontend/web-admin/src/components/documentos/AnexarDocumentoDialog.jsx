import React, { useCallback, useEffect, useState } from 'react';
import {
  Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, Divider, MenuItem, Stack, TextField, Typography
} from '@mui/material';
import { Image as ImageIcon, UploadFile as UploadIcon } from '@mui/icons-material';
import { useSnackbar } from 'notistack';
import api from '../../services/api';
import TituloModal from '../common/TituloModal';
import NeonButton from '../common/NeonButton';
import PhotoCapture from '../common/PhotoCapture';
import ListaDocumentos from './ListaDocumentos';
import { SITUACAO_OBRIGATORIO } from './ChecklistObrigatorios';
import { botaoSecundario, cores } from '../../styles/tokens';

const rotuloSecao = (texto) => (
  <Typography variant="subtitle2" sx={{ color: cores.textoForte, fontWeight: 700, mb: 1 }}>{texto}</Typography>
);

/**
 * Anexa documento de um participante ou de uma empresa, por arquivo ou foto (webcam).
 * É a mesma janela usada na auditoria e no botão Documentos ECM dos participantes.
 * No fim mostra os documentos já anexados e os obrigatórios que ainda faltam.
 */
const AnexarDocumentoDialog = ({ open, onClose, entityType = 'pessoa', entityId, nomeEntidade = '', tipos: tiposProp, onEnviado }) => {
  const { enqueueSnackbar } = useSnackbar();
  const [tipoId, setTipoId] = useState('');
  const [arquivo, setArquivo] = useState(null);
  const [modo, setModo] = useState('arquivo'); // 'arquivo' | 'foto'
  const [validade, setValidade] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [tiposCarregados, setTiposCarregados] = useState([]);
  const [situacao, setSituacao] = useState(null);
  const [carregandoSituacao, setCarregandoSituacao] = useState(false);

  const tipos = tiposProp || tiposCarregados;

  const carregarSituacao = useCallback(async () => {
    if (!entityId) return;
    setCarregandoSituacao(true);
    try {
      const resp = await api.get(`/documentos/${entityType}/${entityId}/situacao`);
      setSituacao(resp.data?.data || null);
    } catch {
      setSituacao(null);
      enqueueSnackbar('Não foi possível carregar os documentos desta pessoa.', { variant: 'error' });
    } finally {
      setCarregandoSituacao(false);
    }
  }, [entityType, entityId, enqueueSnackbar]);

  useEffect(() => {
    if (!open) return;
    setTipoId('');
    setArquivo(null);
    setModo('arquivo');
    setValidade('');
    carregarSituacao();
    if (!tiposProp) {
      api.get('/documentos/config')
        .then(resp => setTiposCarregados((resp.data?.data?.tipos || []).filter(t => t.ativo !== false)))
        .catch(() => setTiposCarregados([]));
    }
  }, [open, tiposProp, carregarSituacao]);

  const tipo = tipos.find(t => t.id === tipoId);
  const precisaValidade = !!tipo?.exige_validade;
  const faltam = (situacao?.obrigatorios || []).filter(o => o.situacao !== 'ok');

  // Foto da webcam vira arquivo JPG (mesmo formato que o upload normal)
  const fotoCapturada = async (base64) => {
    if (!base64) { setArquivo(null); return; }
    const blob = await (await fetch(base64)).blob();
    setArquivo(new File([blob], `documento_${Date.now()}.jpg`, { type: 'image/jpeg' }));
  };

  const enviar = async () => {
    if (!tipo || !arquivo) return;
    if (precisaValidade && !validade) {
      enqueueSnackbar(`Informe a data de validade (obrigatória para ${tipo.nome}).`, { variant: 'warning' });
      return;
    }
    setEnviando(true);
    try {
      const form = new FormData();
      form.append('arquivo', arquivo);
      form.append('titulo', tipo.nome);
      form.append('tipo_doc', tipo.nome);
      form.append('tipo_documento_id', tipo.id);
      if (validade) form.append('data_validade', validade);
      await api.post(`/documentos/${entityType}/${entityId}/upload`, form, { headers: { 'Content-Type': 'multipart/form-data' } });
      enqueueSnackbar('Documento anexado. Ele segue para a análise.', { variant: 'success' });
      setTipoId('');
      setArquivo(null);
      setValidade('');
      await carregarSituacao();
      onEnviado?.();
    } catch (err) {
      enqueueSnackbar(err.response?.data?.error || 'Erro ao anexar o documento.', { variant: 'error' });
    } finally {
      setEnviando(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth disableRestoreFocus
      PaperProps={{ sx: { bgcolor: cores.superficie, border: `1px solid ${cores.borda}`, backgroundImage: 'none', maxHeight: { sm: 'calc(100dvh - 48px)' } } }}>
      <TituloModal
        titulo="Anexar documento"
        subtitulo={nomeEntidade || (entityType === 'empresa' ? 'Empresa' : 'Participante')}
        onFechar={onClose}
        desabilitarFechar={enviando}
      />
      <DialogContent sx={{ p: 3 }}>
        <Stack spacing={2.5}>
          <TextField select label="Tipo de documento" value={tipoId} onChange={(e) => setTipoId(e.target.value)} fullWidth required>
            {tipos.map(t => (
              <MenuItem key={t.id} value={t.id}>
                {t.nome}{t.exige_validade ? ' (com validade)' : ''}
              </MenuItem>
            ))}
          </TextField>

          <Stack direction="row" spacing={1}>
            <Button variant={modo === 'arquivo' ? 'contained' : 'outlined'} startIcon={<UploadIcon />}
              onClick={() => { setModo('arquivo'); setArquivo(null); }} sx={modo === 'arquivo' ? {} : botaoSecundario}>
              Arquivo / scanner
            </Button>
            <Button variant={modo === 'foto' ? 'contained' : 'outlined'} startIcon={<ImageIcon />}
              onClick={() => { setModo('foto'); setArquivo(null); }} sx={modo === 'foto' ? {} : botaoSecundario}>
              Foto (webcam)
            </Button>
          </Stack>

          {modo === 'arquivo' && (
            <Box>
              <Button component="label" variant="outlined" sx={botaoSecundario}>
                {arquivo ? arquivo.name : 'Escolher arquivo (imagem ou PDF)'}
                <input hidden type="file" accept="image/*,application/pdf"
                  onChange={(e) => setArquivo(e.target.files?.[0] || null)} />
              </Button>
            </Box>
          )}

          {modo === 'foto' && (
            <Box>
              <PhotoCapture modoDocumento onPhotoCaptured={fotoCapturada} />
            </Box>
          )}

          {tipo && (
            <TextField type="date" label={precisaValidade ? 'Data de validade (obrigatória)' : 'Data de validade (se houver)'}
              value={validade} onChange={(e) => setValidade(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth
              required={precisaValidade} />
          )}

          {!tipo && (
            <Typography variant="caption" sx={{ color: cores.textoSecundario }}>Escolha o tipo para liberar o envio.</Typography>
          )}
        </Stack>

        <Divider sx={{ my: 3, borderColor: cores.borda }} />

        {carregandoSituacao && <Box sx={{ display: 'flex', justifyContent: 'center', p: 2 }}><CircularProgress size={24} /></Box>}

        {!carregandoSituacao && situacao && (
          <Stack spacing={3}>
            <Box>
              {rotuloSecao(`Já anexados (${situacao.documentos?.length || 0})`)}
              <ListaDocumentos documentos={situacao.documentos || []} compacto />
            </Box>

            <Box>
              {rotuloSecao(faltam.length ? `Ainda faltam (${faltam.length})` : 'Obrigatórios')}
              {(situacao.obrigatorios || []).length === 0 && (
                <Typography variant="body2" sx={{ color: cores.textoSecundario }}>Nenhum documento obrigatório para esta função.</Typography>
              )}
              <Stack direction="row" spacing={1} useFlexGap sx={{ flexWrap: 'wrap' }}>
                {(situacao.obrigatorios || []).map(o => {
                  const s = SITUACAO_OBRIGATORIO[o.situacao] || SITUACAO_OBRIGATORIO.falta_anexar;
                  return (
                    <Chip key={o.id} size="small" label={`${o.nome}: ${s.rotulo}`}
                      sx={{ fontWeight: 600, color: s.cor, bgcolor: `${s.cor}1F`, border: `1px solid ${s.cor}66` }} />
                  );
                })}
              </Stack>
              {faltam.length > 0 && (
                <Typography variant="caption" sx={{ display: 'block', color: cores.textoSecundario, mt: 1 }}>
                  Enquanto faltar algum obrigatório, a pessoa fica pendente. Documentos com validade vencida também contam como faltantes.
                </Typography>
              )}
            </Box>
          </Stack>
        )}
      </DialogContent>
      <DialogActions sx={{ p: 2.5, borderTop: `1px solid ${cores.borda}` }}>
        <NeonButton variant="outlined" onClick={onClose} sx={botaoSecundario}>Fechar</NeonButton>
        <NeonButton loading={enviando} disabled={!tipo || !arquivo} onClick={enviar}>Anexar</NeonButton>
      </DialogActions>
    </Dialog>
  );
};

export default AnexarDocumentoDialog;
