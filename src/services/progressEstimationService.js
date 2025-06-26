const geminiClient = require('../utils/geminiClient');

exports.estimateProgress = async ({ libro, descripcion }) => {
  const prompt = `El usuario está leyendo "${libro}". Le pregunté por dónde va y respondió: "${descripcion}". 
  Basado en esto, estima aproximadamente el porcentaje de avance en el libro (0 a 100). 
  Responde solo con un número entero.`;
  const respuesta = await geminiClient.ask(prompt);
  // Extrae el número de la respuesta de Gemini
  const match = respuesta.match(/\d+/);
  return match ? parseInt(match[0]) : null;
};