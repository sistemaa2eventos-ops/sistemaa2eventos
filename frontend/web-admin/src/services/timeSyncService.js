/**
 * timeSyncService.js
 * Serviço de sincronização atômica de horário baseado na geolocalização e timezone do operador.
 * Garante que todas as telas, cards, listas e registros operem com o mesmo segundo exato.
 */

class TimeSyncService {
    constructor() {
        this.driftMs = 0; // Diferença entre o relógio do servidor e o relógio local
        this.timezone = 'America/Sao_Paulo'; // Padrão: Horário Oficial de Brasília
        this.timezoneLabel = 'Brasília (UTC-3)';
        this.coords = null;
        this.isSynced = false;
        this.subscribers = new Set();
        this.syncInterval = null;

        // Recuperar cache local se disponível
        try {
            const cachedTz = localStorage.getItem('nzt_operator_tz');
            const cachedLabel = localStorage.getItem('nzt_operator_tz_label');
            if (cachedTz) this.timezone = cachedTz;
            if (cachedLabel) this.timezoneLabel = cachedLabel;
        } catch (_) {}

        // Iniciar detecção de geolocalização e sincronização
        this.detectOperatorLocationAndTimezone();
        this.syncWithServer();

        // Ressincronizar com o servidor a cada 3 minutos
        if (typeof window !== 'undefined') {
            this.syncInterval = setInterval(() => this.syncWithServer(), 180000);
        }
    }

    /**
     * Detecta o fuso horário com base na geolocalização do operador e no fuso do navegador.
     */
    detectOperatorLocationAndTimezone() {
        // 1. Detectar fuso nativo do navegador
        try {
            const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (browserTz) {
                this.timezone = browserTz;
                this.updateTimezoneLabel(browserTz);
            }
        } catch (_) {}

        // 2. Tentar geolocalização via navegador para precisão territorial (se permitido)
        if (typeof navigator !== 'undefined' && navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (position) => {
                    const { latitude, longitude } = position.coords;
                    this.coords = { latitude, longitude };
                    this.resolveTimezoneFromCoords(latitude, longitude);
                    this.notifySubscribers();
                },
                () => {
                    // Sem permissão de GPS; mantém o fuso detectado pelo navegador
                    this.notifySubscribers();
                },
                { timeout: 10000, maximumAge: 3600000 }
            );
        }
    }

    /**
     * Mapeia coordenadas no território brasileiro para o fuso correto
     */
    resolveTimezoneFromCoords(lat, lon) {
        let tz = 'America/Sao_Paulo';

        // Regras geográficas do Brasil
        if (lon < -67.5) {
            // Acre e extremo oeste do Amazonas
            tz = 'America/Rio_Branco';
        } else if (lon < -54.0 && lat < 5.0) {
            // Amazonas, Rondônia, Roraima, Mato Grosso, Mato Grosso do Sul
            if (lat < -15.0 && lon > -58.0) {
                tz = 'America/Campo_Grande';
            } else if (lat < -8.0 && lon > -60.0) {
                tz = 'America/Cuiaba';
            } else {
                tz = 'America/Manaus';
            }
        } else if (lon > -35.0 && lat > -5.0 && lat < -3.0) {
            // Fernando de Noronha
            tz = 'America/Noronha';
        } else {
            // Maioria dos estados brasileiros (SP, RJ, MG, BA, PR, SC, RS, GO, DF, etc.)
            tz = 'America/Sao_Paulo';
        }

        this.timezone = tz;
        this.updateTimezoneLabel(tz);

        try {
            localStorage.setItem('nzt_operator_tz', tz);
            localStorage.setItem('nzt_operator_tz_label', this.timezoneLabel);
        } catch (_) {}
    }

    updateTimezoneLabel(tz) {
        const labels = {
            'America/Sao_Paulo': 'Brasília (UTC-3)',
            'America/Bahia': 'Salvador (UTC-3)',
            'America/Fortaleza': 'Fortaleza (UTC-3)',
            'America/Recife': 'Recife (UTC-3)',
            'America/Belem': 'Belém (UTC-3)',
            'America/Manaus': 'Manaus (UTC-4)',
            'America/Cuiaba': 'Cuiabá (UTC-4)',
            'America/Campo_Grande': 'Campo Grande (UTC-4)',
            'America/Porto_Velho': 'Porto Velho (UTC-4)',
            'America/Boa_Vista': 'Boa Vista (UTC-4)',
            'America/Rio_Branco': 'Rio Branco (UTC-5)',
            'America/Noronha': 'Noronha (UTC-2)'
        };
        this.timezoneLabel = labels[tz] || tz;
    }

    /**
     * Sincroniza o relógio com o backend via NTP-lite
     */
    async syncWithServer() {
        try {
            const sendTime = Date.now();
            const baseUrl = (import.meta.env?.VITE_API_URL || '').replace(/\/api$/, '') || window.location.origin;
            const res = await fetch(`${baseUrl}/time?_t=${sendTime}`, { cache: 'no-store' });
            
            if (res.ok) {
                const data = await res.json();
                const receiveTime = Date.now();
                const roundTripTime = receiveTime - sendTime;
                const serverTime = (data.epoch_ms || new Date(data.timestamp).getTime()) + Math.round(roundTripTime / 2);
                
                this.driftMs = serverTime - receiveTime;
                this.isSynced = true;
                this.notifySubscribers();
            }
        } catch (e) {
            // Fallback: mantém drift anterior ou zero
        }
    }

    /**
     * Retorna um objeto Date com o tempo corrigido pelo servidor
     */
    getSyncedDate() {
        return new Date(Date.now() + this.driftMs);
    }

    /**
     * Formata um timestamp ou Date no padrão HH:mm:ss segundo o fuso horário da geolocalização do operador
     */
    formatTime(dateInput) {
        if (!dateInput) return '--:--:--';
        try {
            const d = this.parseDate(dateInput);
            return new Intl.DateTimeFormat('pt-BR', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZone: this.timezone
            }).format(d);
        } catch {
            return '--:--:--';
        }
    }

    /**
     * Formata no padrão dd/MM/yyyy HH:mm:ss segundo o fuso horário da geolocalização do operador
     */
    formatDateTime(dateInput) {
        if (!dateInput) return '--/--/---- --:--';
        try {
            const d = this.parseDate(dateInput);
            return new Intl.DateTimeFormat('pt-BR', {
                day: '2-digit',
                month: '2-digit',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
                timeZone: this.timezone
            }).format(d);
        } catch {
            return '--/--/---- --:--';
        }
    }

    /**
     * Retorna a data no padrão YYYY-MM-DD ajustada ao fuso do operador
     */
    getTodayDateString() {
        const d = this.getSyncedDate();
        try {
            const parts = new Intl.DateTimeFormat('en-CA', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                timeZone: this.timezone
            }).formatToParts(d);
            const year = parts.find(p => p.type === 'year')?.value;
            const month = parts.find(p => p.type === 'month')?.value;
            const day = parts.find(p => p.type === 'day')?.value;
            return `${year}-${month}-${day}`;
        } catch {
            const ano = d.getFullYear();
            const mes = String(d.getMonth() + 1).padStart(2, '0');
            const dia = String(d.getDate()).padStart(2, '0');
            return `${ano}-${mes}-${dia}`;
        }
    }

    parseDate(dateInput) {
        if (dateInput instanceof Date) return dateInput;
        if (typeof dateInput === 'string') {
            const trimmed = dateInput.trim();
            if (trimmed.endsWith('Z') || /[+-]\d{2}(:?\d{2})?$/.test(trimmed)) {
                return new Date(trimmed);
            }
            if (trimmed.includes('T') || (trimmed.includes('-') && trimmed.includes(':'))) {
                return new Date(trimmed.replace(' ', 'T') + 'Z');
            }
        }
        return new Date(dateInput);
    }

    subscribe(fn) {
        this.subscribers.add(fn);
        return () => this.subscribers.delete(fn);
    }

    notifySubscribers() {
        this.subscribers.forEach(fn => {
            try { fn({ timezone: this.timezone, label: this.timezoneLabel, driftMs: this.driftMs, isSynced: this.isSynced }); } catch (_) {}
        });
    }
}

export const timeSyncService = new TimeSyncService();
export default timeSyncService;
