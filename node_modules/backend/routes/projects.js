const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const upload = multer({ storage: multer.memoryStorage() });

// Pobieranie wszystkich projektów
router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// Tworzenie nowego projektu
router.post('/', async (req, res) => {
    const { name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day } = req.body;
    try {
        const result = await db.query(
            'INSERT INTO projects (name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
            [name, wp_url, wp_user, wp_password, min_posts_per_day, max_posts_per_day]
        );
        res.status(201).json(result.rows[0]);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// Pobieranie szczegółów jednego projektu (wraz z keywordami i postami)
router.get('/:id', async (req, res) => {
    try {
        const projectResult = await db.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
        if (projectResult.rows.length === 0) {
            return res.status(404).send('Project not found');
        }
        const project = projectResult.rows[0];

        const keywordsResult = await db.query('SELECT * FROM keywords WHERE project_id = $1 ORDER BY id DESC', [req.params.id]);
        project.keywords = keywordsResult.rows;

        const scheduledPostsResult = await db.query(`
            SELECT sp.*, k.keyword 
            FROM scheduled_posts sp
            JOIN keywords k ON sp.keyword_id = k.id
            WHERE sp.project_id = $1 
            ORDER BY sp.publish_at DESC
        `, [req.params.id]);
        project.scheduledPosts = scheduledPostsResult.rows;

        res.json(project);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// Upload pliku CSV z keywordami
router.post('/:id/upload', upload.single('file'), async (req, res) => {
    const projectId = req.params.id;
    if (!req.file) {
        return res.status(400).send('No file uploaded.');
    }
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const stream = Readable.from(req.file.buffer.toString());
        stream.pipe(csv({ headers: false }))
            .on('data', async (row) => {
                const keyword = row[0];
                if (keyword) {
                    await client.query(
                        "INSERT INTO keywords (project_id, keyword, status) VALUES ($1, $2, 'pending')",
                        [projectId, keyword.trim()]
                    );
                }
            })
            .on('end', async () => {
                await client.query('COMMIT');
                res.status(200).send('Keywords uploaded successfully.');
            });
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error processing CSV file:', error);
        res.status(500).send('Error processing file.');
    }
});

// =================================================================
// NOWA TRASA: Masowe usuwanie słów kluczowych
// =================================================================
router.delete('/:projectId/keywords', async (req, res) => {
    const { projectId } = req.params;
    const { keywordIds } = req.body; // Oczekujemy tablicy ID

    if (!keywordIds || !Array.isArray(keywordIds) || keywordIds.length === 0) {
        return res.status(400).send('An array of keyword IDs is required.');
    }

    try {
        const deleteResult = await db.query(
            'DELETE FROM keywords WHERE id = ANY($1::int[]) AND project_id = $2',
            [keywordIds, projectId]
        );
        console.log(`Deleted ${deleteResult.rowCount} keywords for project ${projectId}.`);
        res.status(204).send();
    } catch (error) {
        console.error('Error bulk deleting keywords:', error);
        res.status(500).send('Server error');
    }
});

// Usuwanie pojedynczego słowa kluczowego
router.delete('/:projectId/keywords/:keywordId', async (req, res) => {
    const { projectId, keywordId } = req.params;
    try {
        const deleteResult = await db.query(
            'DELETE FROM keywords WHERE id = $1 AND project_id = $2',
            [keywordId, projectId]
        );
        if (deleteResult.rowCount === 0) {
            return res.status(404).send('Keyword not found or does not belong to this project.');
        }
        res.status(204).send();
    } catch (error) {
        console.error('Error deleting keyword:', error);
        res.status(500).send('Server error');
    }
});

// Dodawanie wielu słów kluczowych
router.post('/:projectId/keywords', async (req, res) => {
    const { projectId } = req.params;
    const { keywords } = req.body;
    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
        return res.status(400).send('Keywords array is required.');
    }
    const client = await db.getClient();
    try {
        await client.query('BEGIN');
        const newKeywords = [];
        for (const keyword of keywords) {
            const result = await client.query(
                "INSERT INTO keywords (project_id, keyword, status) VALUES ($1, $2, 'pending') RETURNING *",
                [projectId, keyword.trim()]
            );
            newKeywords.push(result.rows[0]);
        }
        await client.query('COMMIT');
        res.status(201).json(newKeywords);
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error adding keywords:', error);
        res.status(500).send('Server error');
    } finally {
        client.release();
    }
});

module.exports = router;