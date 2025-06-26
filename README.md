# API Agente de Lectura

Este proyecto es un agente conversacional diseñado para promover la lectura en niños. Utiliza técnicas de análisis emocional, actividades interactivas y respuestas empáticas para crear una experiencia de lectura atractiva y motivadora.

## Estructura del Proyecto

El proyecto está organizado en módulos que manejan diferentes aspectos de la interacción con el usuario:

- **src/app.js**: Punto de entrada de la aplicación. Inicializa Express y configura middleware y rutas.
- **src/server.js**: Inicia el servidor y establece la conexión a la base de datos.
- **src/config/db.js**: Maneja la conexión a MongoDB y eventos de conexión.
- **src/controllers/**: Contiene controladores para manejar operaciones relacionadas con sesiones, usuarios, emociones, actividades, motivación y empatía.
- **src/models/**: Define los modelos de datos para sesiones, usuarios, actividades y emociones.
- **src/routes/**: Define las rutas para las operaciones HTTP, conectando las solicitudes a los controladores correspondientes.
- **src/services/**: Contiene la lógica de negocio para análisis de mensajes, interacción con la API de Gemini, gestión de actividades, motivación y respuestas empáticas.
- **src/utils/helpers.js**: Funciones auxiliares utilizadas en diferentes partes de la aplicación.

## Instalación

1. Clona el repositorio:
   ```
   git clone <URL_DEL_REPOSITORIO>
   cd api-agente-lectura
   ```

2. Instala las dependencias:
   ```
   npm install
   ```

3. Configura las variables de entorno en el archivo `.env`:
   ```
   MONGODB_URI=<TU_URI_DE_MONGODB>
   PORT=3000
   GEMINI_API_KEY=<TU_API_KEY_DE_GEMINI>
   ```

## Uso

1. Inicia el servidor:
   ```
   npm start
   ```

2. Accede a la API en `http://localhost:3000`.

## Contribuciones

Las contribuciones son bienvenidas. Si deseas contribuir, por favor abre un issue o envía un pull request.

## Licencia

Este proyecto está bajo la Licencia MIT.