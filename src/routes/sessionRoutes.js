const express = require('express');
const router = express.Router();
const sessionController = require('../controllers/sessionController');

router.post('/', sessionController.createSession);
router.post('/:userId/:sessionId/messages', sessionController.addMessageToConversation);

// Listar todas las sesiones de un usuario
router.get('/:userId', sessionController.getSessionsByUser);
// Obtener detalles y mensajes de una sesión específica
router.get('/:userId/:sessionId', sessionController.getSessionById);
// (Opcional) Obtener solo los mensajes de una sesión
router.get('/:userId/:sessionId/messages', sessionController.getMessagesBySession);

module.exports = router;