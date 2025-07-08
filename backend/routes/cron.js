const express = require('express');
const router = express.Router();
const db = require('../db');

// Middleware do zabezpieczenia cron joba
function checkCronSecret(req, res, next) {
    const cronSecret = req.header('X-Cron-Secret');
    if (cronSecret === process.env.CRON_SECRET) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
}

// Funkcja pomocnicza do generowania losowej liczby w zakresie
function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Endpoint dla planisty, który jest wywoływany przez Railway
router.post('/plan', checkCronSecret, async (req, res) => {
    console.log('[Planner] Cron job started. Planning posts for all projects...');
    const client = await db.getClient();

    try {
        // 1. Pobierz wszystkie aktywne projekty
        const projectsResult = await client.query('SELECT * FROM projects');
        const projects = projectsResult.rows;

        if (projects.length === 0) {
            console.log('[Planner] No projects found to plan for.');
            return res.status(200).send('No projects to plan.');
        }

        let totalScheduled = 0;

        // 2. Przejdź przez każdy projekt i zaplanuj posty
        for (const project of projects) {
            console.log(`[Planner] Planning for project: ${project.name}`);
            
            // 3. Ustal, ile postów zaplanować na dziś
            const postsToSchedule = getRandomInt(project.min_posts_per_day, project.max_posts_per_day);
            console.log(`[Planner] Decided to schedule ${postsToSchedule} post(s) for today.`);

            if (postsToSchedule === 0) continue;

            // 4. Znajdź dostępne, nieużywane słowa kluczowe dla tego projektu
            const keywordsResult = await client.query(
                "SELECT id FROM keywords WHERE project_id = $1 AND status = 'pending' ORDER BY RANDOM() LIMIT $2",
                [project.id, postsToSchedule]
            );
            const keywords = keywordsResult.rows;

            if (keywords.length === 0) {
                console.log(`[Planner] No pending keywords available for project: ${project.name}`);
                continue;
            }

            console.log(`[Planner] Found ${keywords.length} available keywords. Scheduling...`);

            // 5. Dla każdego znalezionego słowa kluczowego, stwórz zadanie w harmonogramie
            for (const keyword of keywords) {
                // Ustaw losową godzinę publikacji w ciągu najbliższych 24 godzin
                const randomDelayMinutes = getRandomInt(5, 24 * 60); // od 5 min do 24h
                const publishAt = new Date(Date.now() + randomDelayMinutes * 60 * 1000);

                await client.query('BEGIN');
                // Dodaj do harmonogramu
                await client.query(
                    'INSERT INTO scheduled_posts (project_id, keyword_id, publish_at, status) VALUES ($1, $2, $3, $4)',
                    [project.id, keyword.id, publishAt, 'pending']
                );
                // Zmień status słowa kluczowego, aby nie było użyte ponownie
                await client.query("UPDATE keywords SET status = 'scheduled' WHERE id = $1", [keyword.id]);
                await client.query('COMMIT');
                
                totalScheduled++;
                console.log(`[Planner] Scheduled post for keyword ID ${keyword.id} at ${publishAt.toLocaleString()}`);
            }
        }

        console.log(`[Planner] Cron job finished. Total posts scheduled across all projects: ${totalScheduled}`);
        res.status(200).send(`Planning complete. Scheduled ${totalScheduled} posts.`);

    } catch (error) {
        console.error('[Planner] A critical error occurred during planning:', error);
        await client.query('ROLLBACK');
        res.status(500).send('Internal Server Error during planning.');
    } finally {
        client.release();
    }
});

module.exports = router;