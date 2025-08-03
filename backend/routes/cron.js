const express = require('express');
const router = express.Router();
const db = require('../db');
const { runExecutor } = require('../services/cronWorker');

// =================================================================
// MODYFIKACJA: Ulepszamy middleware, aby działał z nagłówkiem ORAZ z adresem URL
// =================================================================
function checkCronSecret(req, res, next) {
    const secretFromHeader = req.header('X-Cron-Secret'); // Dla cron-jobs.org
    const secretFromQuery = req.query.secret;             // Dla naszych testów w przeglądarce

    // Sprawdzamy, czy sekret zgadza się w którymkolwiek z tych miejsc
    if ((secretFromHeader && secretFromHeader === process.env.CRON_SECRET) ||
        (secretFromQuery && secretFromQuery === process.env.CRON_SECRET)) {
        next();
    } else {
        console.warn('[API] Unauthorized attempt to access a cron endpoint via cron.js.');
        res.status(401).send('Unauthorized');
    }
}

// Funkcja pomocnicza do generowania losowej liczby w zakresie (bez zmian)
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// TRASA #1: PLANNER (bez zmian)
router.post('/plan', checkCronSecret, async (req, res) => {
    console.log('[Planner] Cron job started. Planning posts for all projects...');
    const client = await db.getClient();
    try {
        const projectsResult = await client.query('SELECT * FROM projects');
        const projects = projectsResult.rows;
        if (projects.length === 0) {
            console.log('[Planner] No projects found to plan for.');
            return res.status(200).send('No projects to plan.');
        }
        let totalScheduled = 0;
        for (const project of projects) {
            const postsToSchedule = getRandomInt(project.min_posts_per_day, project.max_posts_per_day);
            if (postsToSchedule === 0) continue;
            const keywordsResult = await client.query(
                "SELECT id FROM keywords WHERE project_id = $1 AND status = 'pending' ORDER BY RANDOM() LIMIT $2",
                [project.id, postsToSchedule]
            );
            const keywords = keywordsResult.rows;
            if (keywords.length === 0) continue;
            for (const keyword of keywords) {
                const randomDelayMinutes = getRandomInt(5, 24 * 60);
                const publishAt = new Date(Date.now() + randomDelayMinutes * 60 * 1000);
                await client.query('BEGIN');
                await client.query(
                    'INSERT INTO scheduled_posts (project_id, keyword_id, publish_at, status) VALUES ($1, $2, $3, $4)',
                    [project.id, keyword.id, publishAt, 'pending']
                );
                await client.query("UPDATE keywords SET status = 'scheduled' WHERE id = $1", [keyword.id]);
                await client.query('COMMIT');
                totalScheduled++;
            }
        }
        console.log(`[Planner] Cron job finished. Total posts scheduled: ${totalScheduled}`);
        res.status(200).send(`Planning complete. Scheduled ${totalScheduled} posts.`);
    } catch (error) {
        console.error('[Planner] A critical error occurred during planning:', error);
        await client.query('ROLLBACK');
        res.status(500).send('Internal Server Error during planning.');
    } finally {
        client.release();
    }
});


// TRASA #2: EXECUTOR (bez zmian)
router.post('/execute', checkCronSecret, (req, res) => {
    console.log('[Executor Trigger] Received request. Starting worker logic in the background.');

    runExecutor().catch(err => {
        console.error('[Executor Trigger] The worker logic encountered an unhandled exception:', err);
    });

    res.status(202).send('Executor task accepted and is running in the background.');
});


// =================================================================
// NOWY KOD: TESTOWY ENDPOINT DO NATYCHMIASTOWEGO URUCHOMIENIA WORKERA
// =================================================================
router.get('/test-executor', checkCronSecret, (req, res) => {
    console.log('[API] /test-executor MANUAL TRIGGER hit with correct secret.');
    res.status(200).send('OK. Executor task started in the background. Check logs for progress.');

    // Uruchamiamy logikę workera "w tle", aby nie blokować odpowiedzi HTTP
    runExecutor().catch(error => {
        console.error('[API] CRITICAL ERROR during manual /test-executor run:', error);
    });
});


module.exports = router;