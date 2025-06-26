const Session = require('../models/Session');

module.exports = {
  getCurrentStage: (session) => session.ETAPA_ACTUAL || 'saludo',

  getMissingFields: (user, session, stage) => {
    const missing = [];
    if (stage === 'diagnostico') {
      if (!user.EDAD) missing.push('EDAD');
      if (!user.NOMBRE) missing.push('NOMBRE');
      if (!session.LIBRO_ACTUAL) missing.push('LIBRO_ACTUAL');
      if (!session.PROGRESO_LIBRO) missing.push('PROGRESO_LIBRO');
    }
    return missing;
  },

  updateStage: async (session, nextStage) => {
    session.ETAPA_ACTUAL = nextStage;
    await session.save();
  },

  initExplorationQuestions: (session) => {
    if (!session._exploracionPreguntas) {
      session._exploracionPreguntas = [];
      return [
        '¿Qué te ha gustado más del libro hasta ahora?',
        '¿Hay algún personaje que te parezca interesante?',
        '¿Te gustaría recomendar este libro a un amigo?',
        '¿Qué crees que pasará después en la historia?'
      ];
    }
    return null;
  }
};