const axios = require('axios');

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta/models/';
const MODEL_NAME = 'gemini-2.0-flash'; // Puedes cambiarlo por 'gemini-1.5-pro-latest' u otro modelo disponible

exports.ask = async (prompt, options = {}) => {
  try {
    const response = await axios.post(
      `${GEMINI_BASE_URL}${MODEL_NAME}:generateContent?key=${GEMINI_API_KEY}`,
      {
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt }
            ]
          }
        ],
        // Opciones adicionales pueden incluirse aquí
        generationConfig: {
          temperature: options.temperature || 0.9, // Controla la aleatoriedad (0-1)
          topP: options.topP || 0.8, // Controla la diversidad (0-1)
          topK: options.topK || 40, // Número de tokens a considerar
          maxOutputTokens: options.maxOutputTokens || 100, // Longitud máxima de respuesta
          stopSequences: options.stopSequences || [], // Secuencias para detener la generación
        },
        safetySettings: options.safetySettings || [
          // Configuración de seguridad por defecto
          {
            category: "HARM_CATEGORY_HARASSMENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_HATE_SPEECH",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          },
          {
            category: "HARM_CATEGORY_DANGEROUS_CONTENT",
            threshold: "BLOCK_MEDIUM_AND_ABOVE"
          }
        ]
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    // Extraer la respuesta de la estructura de Gemini
    const responseText = response.data?.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!responseText) {
      // Verificar si hay bloqueos por seguridad
      const safetyRatings = response.data?.candidates?.[0]?.safetyRatings;
      if (safetyRatings && safetyRatings.some(r => r.blocked)) {
        return 'La respuesta fue bloqueada por configuraciones de seguridad.';
      }
      return 'No se obtuvo una respuesta válida de Gemini.';
    }

    return responseText;
    
  } catch (error) {
    console.error('Error consultando Gemini:', 
      error.response?.data?.error?.message || error.message);
    
    // Manejar errores específicos de la API
    if (error.response?.status === 400) {
      return 'Solicitud inválida a Gemini. Verifica tu prompt.';
    } else if (error.response?.status === 429) {
      return 'Límite de tasa excedido. Por favor espera antes de hacer más solicitudes.';
    } else if (error.response?.status === 403) {
      return 'Acceso no autorizado. Verifica tu API key.';
    }
    
    return 'Ocurrió un error al consultar Gemini.';
  }
};