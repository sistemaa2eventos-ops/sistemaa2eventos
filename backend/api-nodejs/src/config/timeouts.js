/**
 * Configuração centralizada de timeouts
 * Garante consistência em toda a aplicação
 *
 * Uso:
 *   const { TIMEOUT_CONFIG } = require('./config/timeouts');
 *   const timeout = TIMEOUT_CONFIG.DEVICE_CONNECTION;
 */

const TIMEOUT_CONFIG = {
  // ============== DISPOSITIVOS HARDWARE ==============

  /**
   * Teste de conexão TCP com dispositivo
   * Usado quando testando conexão com Intelbras/Hikvision
   * 15 segundos: suficiente para dispositivos em redes lentas
   */
  DEVICE_CONNECTION: 15000,

  /**
   * Timeout para snapshot da câmera
   * Dispositivos podem demorar para capturar e enviar imagem
   * 25 segundos: permite captura de qualidade alta
   */
  DEVICE_SNAPSHOT: 25000,

  /**
   * Health check de dispositivo
   * Ping para verificar se está online
   * 12 segundos: dispositivos normalmente respondem rápido
   */
  DEVICE_HEALTH_CHECK: 12000,

  // ============== API REQUESTS ==============

  /**
   * Requisição normal de API
   * Queries, inserts, updates, deletes padrão
   * 10 segundos: suficiente para a maioria das operações
   */
  API_REQUEST: 10000,

  /**
   * Operações longas (relatórios, sincronização, etc)
   * Pode envolver múltiplas queries ou processamento
   * 60 segundos: para relatórios grandes e sincronizações
   */
  LONG_OPERATION: 60000,

  /**
   * Operações de arquivo (upload, download)
   * 30 segundos: para uploads/downloads de tamanho pequeno-médio
   */
  FILE_OPERATION: 30000,

  // ============== CALLBACKS DE HARDWARE ==============

  /**
   * Callback do Intelbras (online mode, push events)
   * Dispositivo enviando dados para servidor
   * 25 segundos: timeout generoso para callbacks
   */
  HARDWARE_CALLBACK: 25000,

  // ============== EMAIL ==============

  /**
   * Teste de conexão SMTP
   * Verificação de credenciais de email
   * 15 segundos: conexão SMTP é rápida
   */
  SMTP_TEST: 15000,

  /**
   * Envio de email
   * Pode envolver múltiplos emails
   * 20 segundos: envio de batch de emails
   */
  EMAIL_SEND: 20000
};

/**
 * Helper: Converter milissegundos para segundos (para logs)
 */
function timeoutInSeconds(ms) {
  return Math.round(ms / 1000);
}

/**
 * Helper: Validar timeout (avisa se muito curto ou longo)
 */
function validateTimeout(ms, context = '') {
  if (ms < 1000) {
    console.warn(`⚠️ Timeout muito curto (${timeoutInSeconds(ms)}s) ${context}`);
  }
  if (ms > 120000) {
    console.warn(`⚠️ Timeout muito longo (${timeoutInSeconds(ms)}s) ${context}`);
  }
  return ms;
}

// ============== DOCUMENTAÇÃO ==============

/**
 * GUIA DE TIMEOUTS
 *
 * BAIXO (< 5s):
 * - Health checks simples
 * - Ping/keepalive
 * - Queries rápidas
 *
 * MÉDIO (5-15s):
 * - Testes de conexão
 * - Requisições API normais
 * - SMTP verification
 *
 * ALTO (15-30s):
 * - Snapshot de câmera
 * - Sincronização
 * - Callbacks de hardware
 *
 * MUY ALTO (30-60s+):
 * - Operações longas
 * - Relatórios grandes
 * - Uploads/downloads
 *
 * REGRA DE OURO:
 * - Sempre dar timeout generoso se o dispositivo for lento
 * - Melhor demorar mais do que falhar por timeout
 * - Testar com conexão lenta para calibrar
 */

module.exports = {
  TIMEOUT_CONFIG,
  timeoutInSeconds,
  validateTimeout
};
