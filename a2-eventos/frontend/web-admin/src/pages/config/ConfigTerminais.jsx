/**
 * @deprecated ConfigTerminais foi consolidado em DispositivosPage.jsx
 * que gerencia terminais Intelbras/Hikvision com suporte completo a:
 *   - Gestão de hardware via IP (Digest Auth)
 *   - Snapshot de câmera
 *   - Comandos remotos (abrir/travar/liberar porta)
 *   - Fila de sincronização offline
 *   - Health check TCP
 *   - Configure Push automático
 *
 * Rota: /config/dispositivos
 */
import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function ConfigTerminais() {
    const navigate = useNavigate();
    useEffect(() => {
        navigate('/config/dispositivos', { replace: true });
    }, [navigate]);
    return null;
}