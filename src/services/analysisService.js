const { analyzeMessage } = require('./bardService');

const processUserMessage = async (messageContent, userId) => {
  const analysis = await analyzeMessage(messageContent);
  
  return {
    EMOCION_DETECTADA: analysis.emocion.toUpperCase(),
    CONFIANZA_EMOCION: analysis.confianza_emocion,
    ANALISIS: {
      PALABRAS_CLAVE: analysis.palabras_clave,
      TEMA_PRINCIPAL: analysis.tema_principal
    }
  };
};

const updateUserEmotionalState = async (userId, emotionData) => {
  // Aquí se puede implementar la lógica para actualizar el estado emocional del usuario en la base de datos
};

const analyzeAndUpdateUserProfile = async (messageContent, userId) => {
  const analysisResult = await processUserMessage(messageContent, userId);
  await updateUserEmotionalState(userId, analysisResult);
  
  return analysisResult;
};

module.exports = { processUserMessage, analyzeAndUpdateUserProfile };