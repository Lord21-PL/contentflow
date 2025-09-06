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
        const result = await db.query(`
            SELECT p.*, 
                   COALESCE(p.used_keywords_count, 0) as used_keywords_count,
                   COUNT(k.id) as total_keywords_count
            FROM projects p 
            LEFT JOIN keywords k ON p.id = k.project_id 
            GROUP BY p.id 
            ORDER BY p.created_at DESC
        `);
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
        const projectResult = await db.query(`
            SELECT p.*, 
                   COALESCE(p.used_keywords_count, 0) as used_keywords_count,
                   (SELECT COUNT(*) FROM keywords WHERE project_id = p.id) as total_keywords_count
            FROM projects p 
            WHERE p.id = $1
        `, [req.params.id]);
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

        const stream = Readable.from(req.file.buffer.toString()).pipe(csv({ headers: false }));

        for await (const row of stream) {
            const keyword = row[0];
            if (keyword) {
                await client.query(
                    "INSERT INTO keywords (project_id, keyword, status) VALUES ($1, $2, 'pending')",
                    [projectId, keyword.trim()]
                );
            }
        }

        await client.query('COMMIT');
        res.status(200).send('Keywords uploaded successfully.');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('Error processing CSV file:', error);
        res.status(500).send('Error processing file.');
    } finally {
        client.release();
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

// Eksport wszystkich słów kluczowych z projektu do CSV
router.get('/:projectId/keywords/export', async (req, res) => {
    const { projectId } = req.params;
    
    try {
        // Pobierz informacje o projekcie
        const projectResult = await db.query('SELECT name FROM projects WHERE id = $1', [projectId]);
        if (projectResult.rows.length === 0) {
            return res.status(404).send('Project not found');
        }
        const projectName = projectResult.rows[0].name;
        
        // Pobierz wszystkie słowa kluczowe z informacją o użyciu
        const keywordsResult = await db.query(`
            SELECT 
                k.keyword,
                k.language,
                k.title,
                k.category,
                k.created_at,
                CASE 
                    WHEN sp.keyword_id IS NOT NULL THEN 'used' 
                    ELSE 'unused' 
                END as usage_status,
                sp.publish_at,
                sp.status as post_status,
                sp.wordpress_post_url
            FROM keywords k
            LEFT JOIN scheduled_posts sp ON k.id = sp.keyword_id AND sp.status = 'completed'
            WHERE k.project_id = $1
            ORDER BY k.created_at DESC
        `, [projectId]);
        
        // Przygotuj CSV header
        const csvHeader = 'keyword,language,title,category,created_at,usage_status,publish_at,post_status,wordpress_post_url\n';
        
        // Konwertuj dane do CSV
        const csvData = keywordsResult.rows.map(row => {
            return [
                `"${row.keyword || ''}"`,
                `"${row.language || ''}"`,
                `"${row.title || ''}"`,
                `"${row.category || ''}"`,
                `"${row.created_at ? row.created_at.toISOString() : ''}"`,
                `"${row.usage_status}"`,
                `"${row.publish_at ? row.publish_at.toISOString() : ''}"`,
                `"${row.post_status || ''}"`,
                `"${row.wordpress_post_url || ''}"`
            ].join(',');
        }).join('\n');
        
        const csvContent = csvHeader + csvData;
        
        // Ustaw headers dla pobierania pliku
        const fileName = `keywords_${projectName.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`;
        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
        res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8'));
        
        res.send(csvContent);
    } catch (error) {
        console.error('Error exporting keywords:', error);
        res.status(500).send('Server error');
    }
});

module.exports = router;