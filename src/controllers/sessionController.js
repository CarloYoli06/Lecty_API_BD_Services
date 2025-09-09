const Session = require('../models/Session');
const sessionManagerService = require('../services/sessionManagerService');
const { v4: uuidv4 } = require('uuid');

exports.createSession = async (req, res) => {
  try {
     console.log('createSession - headers:', req.headers); // Log de headers
    console.log('createSession - raw body:', req.body); // Log de body crudo

    let userId;
    if (req.body.US_ID) {
      // Formato web (JSON directo)
      userId = req.body.US_ID;
    } else if (req.body.form) {
      // Formato Unity (WWWForm)
      userId = req.body.form.US_ID;
    } else {
      return res.status(400).json({ error: 'US_ID es requerido' });
    }


    const session = new Session({
      ...req.body,
      SESSION_ID: uuidv4(),
      FECHA_INICIO: new Date(),
      FINALIZADA: false,
      MENSAJES: [],
      ESTADO_ANIMO: "",
      LIBRO_ACTUAL: "",
      PROGRESO_LIBRO: 0,
      _esperandoLibro:  false ,
      _libroSugerido: "",
      EMOCION_GENERAL: "",
      ETAPA_ACTUAL: "saludo",
      OBJETIVO_SESION:"",
      OBJETIVO_SESION: "Fomentar el gusto por la lectura"
    });
    console.log('createSession - session a guardar:', session); // LOG
    await session.save();
    res.status(201).json(session);
  } catch (error) {
    console.error('Error en createSession:', error); // LOG
    res.status(400).json({ message: error.message, stack: error.stack });
  }
};  

exports.addMessageToConversation = async (req, res) => {
  console.log('createSession - headers:', req.headers); // Log de headers
  console.log('createSession - raw body:', req.body); // Log de body crudo
  try {
    const { userId, sessionId } = req.params;

 let content, sender, emotion;
    if (req.body.content) {
      // Formato web
      ({ content, sender, emotion } = req.body);
    } else if (req.body.form) {
      // Formato Unity
      content = req.body.form.content;
      sender = req.body.form.sender || 'usuario';
      emotion = req.body.form.emotion || '';
    }
    console.log('addMessageToConversation - params:', req.params); // LOG
    console.log('addMessageToConversation - body:', req.body); // LOG

    const session = await Session.findOne({ US_ID: userId, SESSION_ID: sessionId });
    if (!session) return res.status(404).json({ message: 'Conversación no encontrada' });

    console.log('addMessageToConversation - session encontrada:', session); // LOG

    const newMessage = {
      IDM: uuidv4(),
      CONTENIDO: content,
      EMISOR: sender,
      FECHA_HORA: new Date(),
      EMOCION: emotion
    };
    session.MENSAJES.push(newMessage);
    console.log('addMessageToConversation - mensaje a guardar:', newMessage); // LOG
    await session.save();

    // Orquestar el flujo conversacional
     const agentResponse = await sessionManagerService.handleUserMessage({
      userId,
      sessionId,
      message: content,
      emotion
    });

    res.status(201).json({ userMessage: newMessage, agentResponse });
  } catch (error) {
    console.error('Error en addMessageToConversation:', error); // LOG
    res.status(500).json({ message: error.message, stack: error.stack });
  }
};

// Obtener todas las sesiones de un usuario
exports.getSessionsByUser = async (req, res) => {
  try {
    const { userId } = req.params;
    const sessions = await Session.find({ US_ID: userId }, '-MENSAJES'); // Excluye mensajes para la lista
    res.json(sessions);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Obtener detalles y mensajes de una sesión específica
exports.getSessionById = async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    const session = await Session.findOne({ US_ID: userId, SESSION_ID: sessionId });
    if (!session) return res.status(404).json({ message: 'Sesión no encontrada' });
    res.json(session);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// (Opcional) Obtener solo los mensajes de una sesión
exports.getMessagesBySession = async (req, res) => {
  try {
    const { userId, sessionId } = req.params;
    const session = await Session.findOne({ US_ID: userId, SESSION_ID: sessionId }, 'MENSAJES');
    if (!session) return res.status(404).json({ message: 'Sesión no encontrada' });
    res.json(session.MENSAJES);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};