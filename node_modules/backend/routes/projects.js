const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const csv = require('csv-parser');
const { Readable } = require('stream');

const upload = multer({ storage: multer.memoryStorage() });

// Istniejąca trasa: Pobieranie wszystkich projektów
router.get('/', async (req, res) => {
    try {
        const result = await db.query('SELECT * FROM projects ORDER BY created_at DESC');
        res.json(result.rows);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// Istniejąca trasa: Tworzenie nowego projektu
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

// Istniejąca trasa: Pobieranie szczegółów jednego projektu wraz z keywordami
router.get('/:id', async (req, res) => {
    try {
        const projectResult = await db.query('SELECT * FROM projects WHERE id = $1', [req.params.id]);
        if (projectResult.rows.length === 0) {
            return res.status(404).send('Project not found');
        }
        const keywordsResult = await db.query('SELECT * FROM keywords WHERE project_id = $1 ORDER BY id DESC', [req.params.id]);
        const project = projectResult.rows[0];
        project.keywords = keywordsResult.rows;
        res.json(project);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// Istniejąca trasa: Upload pliku CSV z keywordami
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
    } finally {
        // Nie zwalniamy klienta tutaj, bo operacja jest asynchroniczna
    }
});

// =================================================================
// NOWA TRASA: Usuwanie słowa kluczowego
// =================================================================
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
        res.status(204).send(); // 204 No Content - standardowa odpowiedź na udane usunięcie
    } catch (error) {
        console.error('Error deleting keyword:', error);
        res.status(500).send('Server error');
    }
});

// =================================================================
// NOWA TRASA: Dodawanie wielu słów kluczowych z textarea
// =================================================================
router.post('/:projectId/keywords', async (req, res) => {
    const { projectId } = req.params;
    const { keywords } = req.body; // Oczekujemy tablicy stringów

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