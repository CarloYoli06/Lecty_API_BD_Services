const app = require('./app');
require('dotenv').config();
const connectDB = require('./config/db');

const PORT = process.env.PORT || 3000;

// Conectar a la base de datos
connectDB();

// Iniciar el servidor
app.listen(PORT, () => {
  console.log(`Servidor corriendo en el puerto ${PORT}`);
});