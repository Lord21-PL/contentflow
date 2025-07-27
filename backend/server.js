const express = require('express');
const cors = require('cors');
const projectRoutes = require('./routes/projects');
const cronRoutes = require('./routes/cron'); // Importujemy nowe trasy

const app = express();

// Ustawienia CORS
const corsOptions = {
  origin: '*', // W środowisku produkcyjnym warto to zawęzić
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

// =================================================================
// ZMIANA: Zwiększamy limit wielkości zapytania do 50mb
// =================================================================
app.use(express.json({ limit: '50mb' }));

// Trasy API
app.use('/api/projects', projectRoutes);
app.use('/api/cron', cronRoutes); // Rejestrujemy nowe trasy crona

// Podstawowa trasa
app.get('/', (req, res) => {
  res.send('ContentFlow AI Backend is running!');
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});