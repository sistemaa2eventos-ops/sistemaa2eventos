import { memo } from 'react';
import { useSyncedClock } from '../../hooks/useSyncedClock';

/**
 * Relógio que atualiza a cada segundo SEM redesenhar a página onde está.
 * Antes o useSyncedClock ficava no topo do Check-in/Checkout e a tela inteira
 * (lista com fotos, busca, modais) renderizava de novo todo segundo.
 */
const RelogioSincronizado = ({ formato = 'completo' }) => {
  const { currentTime, currentDate, timezoneLabel } = useSyncedClock();
  if (formato === 'hora') return <>{currentTime} • {timezoneLabel}</>;
  return <>{`${currentDate} ${currentTime} (${timezoneLabel})`}</>;
};

export default memo(RelogioSincronizado);
