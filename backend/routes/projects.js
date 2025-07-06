const express = require('express');
const multer = require('multer');
const db = require('../db');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const os = require('os'); // <-- NOWY IMPORT

// POPRAWIONA KONFIGURACJA MULTERA
// Zamiast tworzyć folder 'uploads', używamy systemowego folderu tymczasowego,
// który zawsze istnieje i jest zapisywalny w środowiskach chmurowych.
const upload = multer({ dest: os.tmpdir() });

// GET all projects
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
    
    if (!req.file) {
        return res.status(400).json({ message: 'No file uploaded.' });
    }

    // Ścieżka do pliku jest teraz w folderze tymczasowym, ale kod pozostaje ten sam
    const filePath = req.file.path;

    try {
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const keywords = fileContent.split(/\\r?\\n/).filter(line => line.trim() !== '');

        let count = 0;
        const client = await db.getClient();
        try {
            await client.query('BEGIN');
            for (const keyword of keywords) {
                await client.query('INSERT INTO keywords (project_id, keyword) VALUES ($1, $2)', [id, keyword.trim()]);
                count++;
            }
            await client.query('COMMIT');
        } catch (e) {
            await client.query('ROLLBACK');
            throw e;
        } finally {
            client.release();
        }

        res.json({ message: `${count} keywords uploaded successfully.` });

    } catch (error) {
        console.error('Error processing keywords file:', error);
        res.status(500).json({ message: 'Error processing keywords file.' });
    } finally {
        // Zawsze usuwamy plik tymczasowy po operacji
        fs.unlink(filePath, (err) => {
            if (err) console.error("Error cleaning up temp file:", err);
        });
    }
});

// DELETE a project by ID
router.delete('/:id', async (req, res) => {
    const { id } = req.params;
    try {
        const deleteOp = await db.query('DELETE FROM projects WHERE id = $1', [id]);

        if (deleteOp.rowCount === 0) {
            return res.status(404).json({ message: 'Project not found.' });
        }

        res.status(200).json({ message: 'Project and all associated data deleted successfully.' });
    } catch (error) {
        console.error('Error deleting project:', error);
        res.status(500).json({ message: 'Server error while deleting project.' });
    }
});

module.exports = router;