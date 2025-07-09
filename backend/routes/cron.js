const express = require('express');
const router = express.Router();
const db = require('../db');
const { spawn } = require('child_process');
const path = require('path'); // ZMIANA #1: Importujemy moduł 'path'

// Middleware do zabezpieczenia cron joba
function checkCronSecret(req, res, next) {
    const cronSecret = req.header('X-Cron-Secret');
    if (cronSecret === process.env.CRON_SECRET) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
}

// ... (reszta funkcji, jak getRandomInt i trasa /plan, pozostaje bez zmian) ...
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

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


// NOWA TRASA #2: EXECUTOR (z poprawionym logowaniem)
router.post('/execute', checkCronSecret, (req, res) => {
    console.log('[Executor Trigger] Received request to run the executor script.');

    // ZMIANA #2: Budujemy pewną, absolutną ścieżkę do skryptu
    const scriptPath = path.join(process.cwd(), 'backend', 'services', 'cronworker.js');
    console.log(`[Executor Trigger] Attempting to execute script at: ${scriptPath}`);

    const executorProcess = spawn('node', [scriptPath], {
        detached: true,
        // ZMIANA #3: Zmieniamy 'ignore' na 'inherit', aby logi pojawiały się w głównym strumieniu
        stdio: 'inherit' 
    });

    executorProcess.on('error', (err) => {
        console.error('[Executor Trigger] Failed to start subprocess.', err);
    });

    executorProcess.unref();

    res.status(202).send('Executor process started. Check Railway logs for details.');
});


module.exports = router;