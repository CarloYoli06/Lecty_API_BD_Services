const { safeAsk } = require('./geminiWrapper');
const { formatResponse } = require('./responseService');

module.exports = {
  askForMissingInfo: async ({ campo, user, session, mensajes }) => {
    const prompts = {
      EDAD: `¡Hola! Para recomendarte libros geniales, dime ¿cuántos años tienes?`,
      NOMBRE: `¡Qué gusto leer contigo! ¿Cómo te llamas?`,
      LIBRO_ACTUAL: `¿Qué libro estás leyendo ahora? Puedes decirme el título o contarme de qué trata.`,
      PROGRESO_LIBRO: `¿Por qué parte vas en "${session.LIBRO_ACTUAL}"? (Ejemplo: "voy por el capítulo donde...")`
    };

    const promptPersonalizado = await safeAsk(
      `Contexto: Niño de ${user.EDAD || 'X'} años. ` +
      `Conversación reciente: ${mensajes.slice(-3).map(m => m.CONTENIDO).join(' | ')}. ` +
      `Necesito preguntar: ${campo}. Genera una pregunta amigable y natural.`
    );

    return formatResponse(user, promptPersonalizado || prompts[campo], { isQuestion: true });
  }
};