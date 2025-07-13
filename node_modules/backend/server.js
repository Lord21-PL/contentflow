
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

const projectRoutes = require('./routes/projects');
const cronRoutes = require('./routes/cron');

const app = express();

app.use(cors({ origin: process.env.FRONTEND_URL }));
app.use(express.json());

// API Routes
app.use('/api/projects', projectRoutes);
app.use('/api/cron', cronRoutes);

// Serve Frontend for Production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../frontend/build')));

  app.get('*', (req, res) => {
    res.sendFile(path.resolve(__dirname, '../frontend/build', 'index.html'));
  });
}

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
