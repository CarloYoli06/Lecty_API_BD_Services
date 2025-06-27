// activityService.js
const stateService = require('./stateService');

const ACTIVIDADES = {
  emocion: [
    {
      tipo: 'chiste',
      prompt: (libro, progreso) => `Genera un chiste breve y apropiado sobre "${libro}" o sus personajes.`
    },
    {
      tipo: 'dato_curioso',
      prompt: (libro, progreso) => `Comparte un dato curioso o interesante sobre "${libro}" que sea relevante para la parte que el usuario ha leído (alrededor del ${progreso}% del libro).`
    },
    {
      tipo: 'animar',
      prompt: (libro) => `Motiva al usuario con un mensaje positivo relacionado con la lectura de "${libro}".`
    }
  ],
  motivacion: [
    {
      tipo: 'reto',
      prompt: (libro, progreso) => `Propón un pequeño reto divertido relacionado con "${libro}" para motivar al usuario a seguir leyendo.`
    },
    {
      tipo: 'pregunta_intriga',
      prompt: (libro, progreso) => `Haz una pregunta intrigante sobre lo que podría pasar después en "${libro}" (basado en el ${progreso}% de avance).`
    }
  ],
  comprension: [
    {
      tipo: 'pregunta_comprension',
      prompt: (libro, progreso) => `Haz una pregunta sencilla para verificar la comprensión de la parte reciente de "${libro}".`
    },
    {
      tipo: 'resumen',
      prompt: (libro, progreso) => `Pide al usuario que resuma brevemente lo que ha leído recientemente en "${libro}".`
    }
  ],
  general: [
    {
      tipo: 'pregunta_exploracion',
      prompt: (libro, progreso, historial) => `Haz una pregunta exploratoria sobre "${libro}" considerando que el usuario ya ha leído hasta el ${progreso}% y el historial previo: ${historial}.`
    },
    {
      tipo: 'conexion_personal',
      prompt: (libro) => `Pregunta cómo se relaciona la historia de "${libro}" con experiencias personales del usuario.`
    }
  ]
};

module.exports = {
  getActivityPrompt: (session) => {
    const activityType = stateService.getActivityType(session);
    const actividades = activityType ? ACTIVIDADES[activityType] : ACTIVIDADES.general;
    
    const actividad = actividades[Math.floor(Math.random() * actividades.length)];
    return actividad.prompt(
      session.LIBRO_ACTUAL,
      session.PROGRESO_LIBRO,
      session.HISTORIAL_AVANCE.slice(-3).map(h => `${h.libro} (${h.avanceActual}%)`).join(', ')
    );
  },

  getProgressContext: (session) => {
    if (!session.HISTORIAL_AVANCE.length) return '';
    
    const lastProgress = session.HISTORIAL_AVANCE[session.HISTORIAL_AVANCE.length - 1];
    return `En la última sesión, el usuario leyó hasta el ${lastProgress.avanceActual}% de "${lastProgress.libro}".`;
  }
};