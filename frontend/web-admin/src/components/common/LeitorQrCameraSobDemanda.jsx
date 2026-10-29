import { lazy, Suspense, useState, useEffect } from 'react';

// html5-qrcode (~330 KB) só é baixado quando o operador abre a câmera pela primeira vez;
// antes vinha junto com as telas de Check-in/Checkout/Fiscalização mesmo sem uso.
const LeitorQrCamera = lazy(() => import('./LeitorQrCamera'));

/** Mesmas props do LeitorQrCamera. */
const LeitorQrCameraSobDemanda = (props) => {
  const [usado, setUsado] = useState(props.open);
  useEffect(() => {
    if (props.open) setUsado(true);
  }, [props.open]);

  if (!usado) return null;
  return (
    <Suspense fallback={null}>
      <LeitorQrCamera {...props} />
    </Suspense>
  );
};

export default LeitorQrCameraSobDemanda;
