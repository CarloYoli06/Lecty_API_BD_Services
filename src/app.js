const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();

const userRoutes = require('./routes/userRoutes');
const sessionRoutes = require('./routes/sessionRoutes');

const app = express();
app.use(cors()); // Habilita CORS para todas las rutas
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Conectado a MongoDB'))
  .catch(err => console.error('Error de conexión:', err));

app.use('/api/users', userRoutes);
app.use('/api/sessions', sessionRoutes);

// Elimina la línea de app.listen aquí

module.exports = app; // <-- Exporta el objeto app