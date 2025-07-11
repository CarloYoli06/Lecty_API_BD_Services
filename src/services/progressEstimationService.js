const { safeAsk } = require('./geminiWrapper');

exports.estimateProgress = async ({ libro, descripcion }) => {
  const prompt = `El usuario está leyendo "${libro}" y dijo: "${descripcion}".
    ¿Contiene información clara sobre el progreso (ej. capítulo, página, evento)? 
    Responde SOLO con un  número (0-100) segun el porcentaje de avance o "NO".`;
  
  const respuesta = await safeAsk(prompt);
  
  if (respuesta.includes("NO")) return null;
  
  const match = respuesta.match(/\d+/);
  const progress = match ? parseInt(match[0]) : null;
  
  // Asegurarnos que el progreso esté entre 0 y 100
  return progress !== null ? Math.min(100, Math.max(0, progress)) : null;
};