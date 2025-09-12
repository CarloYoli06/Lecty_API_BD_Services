const Session = require('../models/Session');
const sessionManagerService = require('../services/sessionManagerService');
const stateService = require('../services/stateService');
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

    // --- INICIO DE LA MODIFICACIÓN ---
    // Buscar y finalizar sesiones anteriores no finalizadas para este usuario
    const unfinishedSessions = await Session.find({ US_ID: userId, FINALIZADA: false });
    if (unfinishedSessions.length > 0) {
      console.log(`Finalizando ${unfinishedSessions.length} sesiones pendientes para el usuario ${userId}...`);
      for (const oldSession of unfinishedSessions) {
        // Solo finalizar si tiene al menos un mensaje para poder generar resumen
        if (oldSession.MENSAJES && oldSession.MENSAJES.length > 0) {
          await sessionManagerService.finalizeSession(oldSession);
        } else {
          // Si no tiene mensajes, simplemente marcarla como finalizada para no dejarla abierta
          oldSession.FINALIZADA = true;
          await oldSession.save();
          console.log(`Sesión ${oldSession.SESSION_ID} marcada como finalizada (sin mensajes).`);
        }
      }
    }
    // --- FIN DE LA MODIFICACIÓN ---

const session = new Session({
      ...req.body,
      SESSION_ID: uuidv4(),
      FECHA_INICIO: new Date(),
      FINALIZADA: false,
      MENSAJES: [],
      LIBRO_ACTUAL: "",
      PROGRESO_LIBRO: 0,
      _esperandoLibro: false,
      _libroSugerido: "",
      ETAPA_ACTUAL: "saludo",
      OBJETIVO_SESION: "Fomentar el gusto por la lectura",
      // Inicializar todos los campos del modelo para consistencia
      PARAMETROS_ACTUALES: {
        comprension: 'media',
        emocion: 'neutra',
        motivacion: 'media'
      },
      HISTORIAL_PARAMETROS: [],
      HISTORIAL_AVANCE: [],
      RESUMEN_SESION: ""
    });
    // --- FIN DE LA MODIFICACIÓN ---
    console.log('createSession - session a guardar:', session); // LOG
    await session.save();
    res.status(201).json(session);
  } catch (error) {
    console.error('Error en createSession:', error); // LOG
    res.status(400).json({ message: error.message, stack: error.stack });
  }
};  

exports.addMessageToConversation = async (req, res) => {
  console.log('addMessageToConversation - headers:', req.headers);
  console.log('addMessageToConversation - raw body:', req.body);
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
    console.log('addMessageToConversation - params:', req.params);
    console.log('addMessageToConversation - body:', req.body);

    const session = await Session.findOne({ US_ID: userId, SESSION_ID: sessionId });
    if (!session) return res.status(404).json({ message: 'Conversación no encontrada' });

    console.log('addMessageToConversation - session encontrada:', session);

    const newMessage = {
      IDM: uuidv4(),
      CONTENIDO: content,
      EMISOR: sender,
      FECHA_HORA: new Date(),
      EMOCION: emotion
    };
    session.MENSAJES.push(newMessage);
    console.log('addMessageToConversation - mensaje a guardar:', newMessage);
    await session.save();

    // Orquestar el flujo conversacional para obtener solo el texto de respuesta
    const agentResponseText = await sessionManagerService.handleUserMessage({
      userId,
      sessionId,
      message: content,
      emotion
    });

    // 2. ANALIZAR LA RESPUESTA DEL AGENTE PARA OBTENER LA ANIMACIÓN
    const animation = await stateService.analyzeAgentAnimation(agentResponseText);

    // 3. ESTRUCTURAR LA RESPUESTA FINAL CON EL TEXTO Y LA ANIMACIÓN
    const agentResponse = {
      texto: agentResponseText,
      animacion: animation
    };

    res.status(201).json({ userMessage: newMessage, agentResponse });
  } catch (error) {
    console.error('Error en addMessageToConversation:', error);
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