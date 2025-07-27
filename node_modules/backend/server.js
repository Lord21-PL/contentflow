const express = require('express');
const cors =require('cors');
const path = require('path'); // Potrzebujemy modułu 'path'
const projectRoutes = require('./routes/projects');
const cronRoutes = require('./routes/cron');

const app = express();

// Ustawienia CORS
const corsOptions = {
  origin: '*',
  methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
  credentials: true,
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

// Zwiększamy limit wielkości zapytania
app.use(express.json({ limit: '50mb' }));

// Trasy API
app.use('/api/projects', projectRoutes);
app.use('/api/cron', cronRoutes);

// =================================================================
// NOWA SEKCJA: Serwowanie statycznych plików frontendu
// =================================================================
// Wskazujemy Expressowi, gdzie szukać zbudowanych plików Reacta
const buildPath = path.join(__dirname, '..', 'frontend', 'build');
app.use(express.static(buildPath));

// =================================================================
// NOWA SEKCJA: Reguła "catch-all" dla React Routera
// =================================================================
// Ta reguła musi być PO definicji tras API.
// Dla każdego innego zapytania GET, wysyłamy główny plik aplikacji React.
// To pozwala na działanie routingu po stronie klienta (np. odświeżanie strony na /projects/1)
app.get('*', (req, res) => {
  res.sendFile(path.join(buildPath, 'index.html'));
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});