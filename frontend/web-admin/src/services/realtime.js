import io from 'socket.io-client';

/**
 * Conexão de tempo real ÚNICA por aba do navegador.
 *
 * Antes cada tela abria a sua (alertas globais + Monitor/Check-in/CFTV = 2 conexões por aba).
 * Agora todos compartilham esta; cada tela registra seus ouvintes e os remove ao sair.
 *
 * - Token lido a cada (re)conexão: a sessão é renovada a cada hora e reconectar com o
 *   token antigo era recusado.
 * - Um evento ativo por vez: ao trocar, sai da sala anterior (senão o feed misturaria eventos).
 * - Salas (evento, system_admin) são refeitas automaticamente em cada reconexão.
 */

const URL_SOCKET = (import.meta.env.VITE_API_URL || '').replace(/\/api$/, '') || window.location.origin;
const tokenAtual = () => sessionStorage.getItem('token') || localStorage.getItem('token');

let socket = null;
let usuarios = 0;
let eventoAtual = null;
let usuariosSalaAdmin = 0;
let timerFechar = null;

function criarSocket() {
    socket = io(URL_SOCKET, {
        transports: ['polling', 'websocket'],
        reconnectionAttempts: Infinity, // estação não pode ficar "surda" após queda do servidor
        reconnectionDelayMax: 5000,
        auth: (cb) => cb({ token: tokenAtual() })
    });
    socket.on('connect', () => {
        if (eventoAtual) socket.emit('join_event', eventoAtual);
        if (usuariosSalaAdmin > 0) socket.emit('join_system_admin');
    });
}

/**
 * Passa a usar a conexão compartilhada. Chame liberar() na limpeza do useEffect.
 */
export function usarConexao() {
    // Uma tela que libera e outra (ou a mesma, ao re-renderizar) que pega logo em seguida
    // reaproveitam a conexão: o fechamento só acontece após 2 s sem ninguém usando.
    if (timerFechar) { clearTimeout(timerFechar); timerFechar = null; }
    if (!socket) criarSocket();
    usuarios++;

    const registrados = []; // [alvo, nomeEvento, função]
    let usaSalaAdmin = false;
    let liberado = false;

    const conexao = {
        get socket() { return socket; },
        get conectado() { return !!socket?.connected; },

        on(nome, fn) {
            socket.on(nome, fn);
            registrados.push([socket, nome, fn]);
        },

        /** Eventos do gerenciador (reconnect_attempt etc.) */
        onGerenciador(nome, fn) {
            socket.io.on(nome, fn);
            registrados.push([socket.io, nome, fn]);
        },

        /** Executa fn a cada conexão — e já agora, se a conexão estiver aberta */
        aoConectar(fn) {
            conexao.on('connect', fn);
            if (socket.connected) fn();
        },

        entrarEvento(eventoId) {
            if (!eventoId || eventoId === eventoAtual) return;
            if (eventoAtual && socket.connected) socket.emit('leave_event', eventoAtual);
            eventoAtual = eventoId;
            if (socket.connected) socket.emit('join_event', eventoId);
        },

        entrarSalaAdmin() {
            if (usaSalaAdmin) return;
            usaSalaAdmin = true;
            usuariosSalaAdmin++;
            if (usuariosSalaAdmin === 1 && socket.connected) socket.emit('join_system_admin');
        },

        liberar() {
            if (liberado) return;
            liberado = true;
            registrados.forEach(([alvo, nome, fn]) => alvo.off(nome, fn));
            if (usaSalaAdmin) usuariosSalaAdmin--;
            usuarios--;
            if (usuarios <= 0) {
                usuarios = 0;
                if (timerFechar) clearTimeout(timerFechar);
                timerFechar = setTimeout(() => {
                    timerFechar = null;
                    if (usuarios > 0 || !socket) return;
                    socket.disconnect();
                    socket = null;
                    eventoAtual = null;
                    usuariosSalaAdmin = 0;
                }, 2000);
            }
        }
    };
    return conexao;
}
