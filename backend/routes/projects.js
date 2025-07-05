
const express = require('express');
const multer = require('multer');
const db = require('../db');
const router = express.Router();

const upload = multer({ dest: 'uploads/' });

// GET all projects and their articles
router.get('/', async (req, res) => {
    try {
        const { rows } = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// GET a single project by ID with its articles
router.get('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const projectRes = await db.query('SELECT * FROM projects WHERE id = $1', [id]);
        if (projectRes.rows.length === 0) {
            return res.status(404).send('Project not found');
        }
        const articlesRes = await db.query('SELECT * FROM articles WHERE project_id = $1 ORDER BY published_at DESC', [id]);
        res.json({ project: projectRes.rows[0], articles: articlesRes.rows });
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// POST a new project
router.post('/', async (req, res) => {
    const { name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day } = req.body;
    try {
        const { rows } = await db.query(
            'INSERT INTO projects (name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day]
        );
        res.status(201).json(rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// POST keywords from a file
router.post('/:id/keywords', upload.single('keywordsFile'), async (req, res) => {
    const { id } = req.params;
    const fs = require('fs');
    const path = require('path');

    try {
        const filePath = path.join(__dirname, '../../', req.file.path);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const keywords = fileContent.split(/\r?\n/).filter(line => line.trim() !== '');

        let count = 0;
        for (const keyword of keywords) {
            await db.query('INSERT INTO keywords (project_id, keyword) VALUES ($1, $2)', [id, keyword.trim()]);
            count++;
        }

        fs.unlinkSync(filePath); // Clean up uploaded file
        res.send(`${count} keywords uploaded successfully.`);
    } catch (error) {
        console.error(error);
        res.status(500).send('Error uploading keywords.');
    }
});

// DELETE a project by ID
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        // Dzięki 'ON DELETE CASCADE' w naszej definicji bazy danych,
        // usunięcie projektu automatycznie usunie wszystkie powiązane z nim
        // słowa kluczowe, artykuły i zaplanowane posty.
        // To jest potęga dobrze zaprojektowanej bazy danych!
        const deleteOp = await db.query('DELETE FROM projects WHERE id = $1', [id]);

        if (deleteOp.rowCount === 0) {
            return res.status(404).send('Project not found.');
        }

        res.status(200).send({ message: 'Project and all associated data deleted successfully.' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).send('Server error while deleting project.');
    }
});

module.exports = router;
