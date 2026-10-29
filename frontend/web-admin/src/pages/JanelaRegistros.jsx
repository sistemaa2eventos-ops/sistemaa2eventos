import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { Login as EntradaIcon, Logout as SaidaIcon, ArrowBack as VoltarIcon } from '@mui/icons-material';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { usarConexao } from '../services/realtime';
import RecentAccessList from '../components/credenciamento/RecentAccessList';
import PessoaCardDialog from '../components/credenciamento/PessoaCardDialog';

/**
 * Janela avulsa (sem menu) com os registros de entrada ou saída em tempo real,
 * aberta pelo botão "Abrir em janela" do check-in/checkout para ficar em outro monitor.
 * /janela/registros?tipo=checkin | checkout
 */
const JanelaRegistros = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const tipo = params.get('tipo') === 'checkout' ? 'checkout' : 'checkin';
  const eventoId = localStorage.getItem('active_evento_id');
  const eventoNome = localStorage.getItem('active_evento_nome') || '';
  const cor = tipo === 'checkout' ? '#FF3366' : '#00D4FF';

  const [logs, setLogs] = useState([]);
  const [cardLog, setCardLog] = useState(null);
  const timerRef = useRef(null);

  const carregar = useCallback(async () => {
    if (!eventoId) return;
    try {
      const res = await api.get('/access/logs', { params: { evento_id: eventoId, tipo, limit: 100 } });
      setLogs(res.data?.data || []);
    } catch (err) {
      console.error('Erro ao carregar registros:', err);
    }
  }, [eventoId, tipo]);

  useEffect(() => {
    document.title = `${tipo === 'checkout' ? 'Saídas' : 'Entradas'} · ${eventoNome}`;
    carregar();
  }, [carregar, tipo, eventoNome]);

  useEffect(() => {
    if (!eventoId) return undefined;
    const socket = usarConexao();
    socket.entrarEvento(eventoId);
    socket.on('new_access', (novo) => {
      if (novo.evento_id && novo.evento_id !== eventoId) return;
      if (novo.tipo && novo.tipo !== tipo) return;
      setLogs((prev) => [novo, ...prev.filter((l) => l.id !== novo.id)].slice(0, 100));
      // Traz foto e empresa completas logo depois
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(carregar, 600);
    });
    return () => { clearTimeout(timerRef.current); socket.liberar(); };
  }, [eventoId, tipo, carregar]);

  // Aberta como janela separada: fecha. Aberta direto (celular, link): volta para a operação
  const voltar = () => {
    if (window.opener && !window.opener.closed) window.close();
    else navigate(tipo === 'checkout' ? '/checkout' : '/checkin');
  };

  return (
    <Box sx={{ height: '100dvh', p: 2, display: 'flex', flexDirection: 'column', gap: 1, bgcolor: 'background.default' }}>
      <Box>
        <Button startIcon={<VoltarIcon />} onClick={voltar} sx={{ minHeight: 40, textTransform: 'none', color: cor }}>
          Voltar
        </Button>
      </Box>
      {!eventoId ? (
        <Typography sx={{ m: 'auto', opacity: 0.7 }}>
          Selecione um evento no painel e abra esta janela de novo.
        </Typography>
      ) : (
        <RecentAccessList
          logs={logs}
          icon={tipo === 'checkout' ? SaidaIcon : EntradaIcon}
          title={tipo === 'checkout' ? 'Saídas' : 'Entradas'}
          accentColor={cor}
          badgeLabel={tipo === 'checkout' ? 'Saída' : 'Entrada'}
          firstLabel={tipo === 'checkout' ? 'Última saída' : 'Última entrada'}
          emptyTitle={tipo === 'checkout' ? 'Nenhuma saída registrada' : 'Nenhuma entrada registrada'}
          onSelect={setCardLog}
        />
      )}
      <PessoaCardDialog open={!!cardLog} log={cardLog} onClose={() => setCardLog(null)} accentColor={cor} />
    </Box>
  );
};

export default JanelaRegistros;
