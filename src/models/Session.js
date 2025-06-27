const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  IDM: String,
  CONTENIDO: String,
  EMISOR: String,
  FECHA_HORA: Date,
  EMOCION: String
});

const sessionSchema = new mongoose.Schema({
  US_ID: { type: String, required: true },
  SESSION_ID: { type: String, required: true, unique: true },
  ESTADO_ANIMO: String,
  LIBRO_ACTUAL: String,
  PROGRESO_LIBRO: Number,
  EMOCION_GENERAL: String,
  FECHA_INICIO: Date,
  FINALIZADA: Boolean,
  MENSAJES: [messageSchema],
  ETAPA_ACTUAL: { type: String, default: 'saludo' }, // NUEVO: etapa de la sesión
  OBJETIVO_SESION: String,// NUEVO: objetivo/meta de la sesión
  
 HISTORIAL_AVANCE: [
    {
      libro: String,
      avanceAnterior: Number,
      avanceActual: Number,
      fecha: Date,
      resumen: String // Nuevo campo para resumen de avance
    }
  ],
  
  HISTORIAL_PARAMETROS: [  // Nuevo campo para historial de parámetros
    {
      fecha: Date,
      comprension: String,
      emocion: String,
      motivacion: String
    }
  ],
  
  ULTIMAS_ACTIVIDADES: [  // Nuevo campo para historial de actividades
    {
      fecha: Date,
      tipo: String,
      parametro: String,
      respuestaUsuario: String
    }
  ],
  COMPRENSION: { type: String, default: 'media' },
  EMOCION: { type: String, default: 'media' },
  MOTIVACION: { type: String, default: 'media' }
});


module.exports = mongoose.model('Session', sessionSchema);