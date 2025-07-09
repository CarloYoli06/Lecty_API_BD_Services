const { safeAsk } = require('./geminiWrapper');

exports.estimateProgress = async ({ libro, descripcion }) => {
  const prompt = `El usuario está leyendo "${libro}" y dijo: "${descripcion}". 
    Basado en esto, estima el porcentaje de avance (0-100). 
    Responde SOLO con el número o "NO" si no se puede determinar.`;
  
  const respuesta = await safeAsk(prompt);
  
  if (respuesta.includes("NO")) return null;
  
  const match = respuesta.match(/\d+/);
  const progress = match ? parseInt(match[0]) : null;
  
  // Asegurarnos que el progreso esté entre 0 y 100
  return progress !== null ? Math.min(100, Math.max(0, progress)) : null;
};