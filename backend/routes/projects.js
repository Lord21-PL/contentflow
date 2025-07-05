
const express = require('express');
const multer = require('multer');
const { parse } = require('csv-parse/sync');
const db = require('../db');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

// GET all projects
router.get('/', async (req, res) => {
  try {
    const { rows } = await db.query(`
      SELECT p.*, 
      (SELECT COUNT(*) FROM keywords k WHERE k.project_id = p.id) as total_keywords,
      (SELECT COUNT(*) FROM keywords k WHERE k.project_id = p.id AND k.is_used = true) as used_keywords
      FROM projects p
      ORDER BY p.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// GET single project details
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const projectRes = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
        if (projectRes.rows.length === 0) {
            return res.status(404).json({ msg: 'Project not found' });
        }
        const articlesRes = await db.query('SELECT * FROM articles WHERE project_id = $1 ORDER BY published_at DESC', [id]);

        res.json({
            project: projectRes.rows[0],
            articles: articlesRes.rows,
        });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// POST create a new project
router.post('/', async (req, res) => {
  const { name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day } = req.body;
  try {
    const { rows } = await db.query(
      'INSERT INTO projects (name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    console.error(err.message);
    res.status(500).send('Server Error');
  }
});

// POST upload keywords for a project
router.post('/:id/keywords', upload.single('keywordsFile'), async (req, res) => {
  const { id } = req.params;
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  try {
    const fileContent = req.file.buffer.toString('utf-8');
    let keywords;

    if (req.file.mimetype === 'text/csv') {
      const records = parse(fileContent, {
        columns: false,
        skip_empty_lines: true
      });
      keywords = records.map(record => record[0]);
    } else { // Assume text/plain
      keywords = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');
    }

    const client = await db.query('BEGIN');
    const queryText = 'INSERT INTO keywords (project_id, keyword) VALUES ($1, $2)';
    for (const keyword of keywords) {
      await db.query(queryText, [id, keyword.trim()]);
    }
    await db.query('COMMIT');

    res.status(201).send(`${keywords.length} keywords imported successfully.`);
  } catch (err) {
    await db.query('ROLLBACK');
    console.error(err.message);
    res.status(500).send('Server Error during keyword import.');
  }
});

module.exports = router;
