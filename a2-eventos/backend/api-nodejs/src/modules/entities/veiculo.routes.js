const express = require('express');
const router = express.Router();
const veiculoController = require('./veiculo.controller');
const { authenticate, checkPermission } = require('../../middleware/auth');
const { requireEvent } = require('../../middleware/eventMiddleware');

/**
 * --- ROTA PÚBLICA LPR (Hardware Externo) ---
 * Sem authenticate pois hardware LPR externo (Câmeras IP) pode não ter suporte a tokens JWT dinâmicos.
 * A segurança é baseada na verificação do evento_id via query string no controller.
 */
router.get('/lpr/:placa', veiculoController.consultarPlacaLPR);

/**
 * --- ROTAS PROTEGIDAS ---
 * Validar sessão de usuário autenticado e contexto de evento ativo ('Event-Id' header)
 */
router.use(authenticate, requireEvent);

// Rotas de Listagem e Busca
router.get('/', veiculoController.list);
router.get('/consulta/:placa', veiculoController.consultarPlaca);
router.get('/:id', veiculoController.getById);
router.get('/:id/historico', veiculoController.historico);

// Cadastro e Edição protegidos por RBAC
router.post('/', checkPermission('veiculos', 'escrita'), veiculoController.create);
router.put('/:id', checkPermission('veiculos', 'escrita'), veiculoController.update);

// Controle Operacional (Status e Passagens)
router.patch('/:id/status', checkPermission('veiculos', 'escrita'), veiculoController.updateStatus);
router.post('/passagem', checkPermission('veiculos', 'escrita'), veiculoController.registrarPassagem);

// Exclusão estrita
router.delete('/:id', checkPermission('veiculos', 'exclusao'), veiculoController.delete);

module.exports = router;
