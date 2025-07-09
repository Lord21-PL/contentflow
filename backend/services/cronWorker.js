const db = require('../db');
const OpenAI = require('openai');
const axios = require('axios');

async function runExecutor() {
    console.log('[Executor] Worker logic started. Looking for a job to process...');
    const client = await db.getClient();
    let jobId = null;

    try {
        // Krok 1: Znajdź i zablokuj zadanie do wykonania
        await client.query('BEGIN');
        const jobResult = await client.query(`
            SELECT id FROM scheduled_posts
            WHERE status = 'pending' AND publish_at <= NOW()
            ORDER BY publish_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `);

        if (jobResult.rows.length === 0) {
            console.log('[Executor] No pending jobs found. Worker logic finished.');
            await client.query('COMMIT');
            return;
        }

        jobId = jobResult.rows[0].id;
        console.log(`[Executor] Found job ID: ${jobId}. Locking and setting to 'processing'.`);
        await client.query("UPDATE scheduled_posts SET status = 'processing' WHERE id = $1", [jobId]);
        await client.query('COMMIT');

        // Krok 2: Pobierz pełne szczegóły zadania
        const fullJobDetailsResult = await client.query(`
            SELECT
                p.wordpress_url, p.wordpress_user, p.wordpress_app_password, p.openai_api_key,
                k.keyword
            FROM scheduled_posts sp
            JOIN projects p ON sp.project_id = p.id
            JOIN keywords k ON sp.keyword_id = k.id
            WHERE sp.id = $1
        `, [jobId]);
        const jobDetails = fullJobDetailsResult.rows[0];

        // Krok 3: Wygeneruj treść za pomocą OpenAI
        console.log(`[Executor] Generating content for keyword: "${jobDetails.keyword}"`);
        const openai = new OpenAI({ apiKey: jobDetails.openai_api_key });
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: `Napisz artykuł na bloga na temat: "${jobDetails.keyword}". Artykuł powinien być zoptymalizowany pod SEO, zawierać nagłówki i być gotowy do publikacji.` }],
        });
        const articleContent = completion.choices[0].message.content;
        const articleTitle = jobDetails.keyword;

        // Krok 4: Opublikuj na WordPress
        console.log(`[Executor] Publishing article "${articleTitle}" to ${jobDetails.wordpress_url}`);
        const wpUrl = `${jobDetails.wordpress_url.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
        const credentials = Buffer.from(`${jobDetails.wordpress_user}:${jobDetails.wordpress_app_password}`).toString('base64');
        
        const response = await axios.post(wpUrl, {
            title: articleTitle,
            content: articleContent,
            status: 'publish'
        }, {
            headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' }
        });

        const postUrl = response.data.link;
        console.log(`[Executor] Successfully published post. URL: ${postUrl}`);

        // Krok 5: Oznacz zadanie jako ukończone
        await client.query("UPDATE scheduled_posts SET status = 'completed', wordpress_post_url = $1 WHERE id = $2", [postUrl, jobId]);
        console.log(`[Executor] Job ID: ${jobId} marked as 'completed'.`);

    } catch (error) {
        console.error(`[Executor] CRITICAL ERROR processing job ID: ${jobId || 'UNKNOWN'}.`, error.response ? error.response.data : error);
        if (jobId) {
            const errorMessage = error.message + (error.response ? JSON.stringify(error.response.data) : '');
            await client.query("UPDATE scheduled_posts SET status = 'failed', error_message = $1 WHERE id = $2", [errorMessage, jobId]);
        }
        await client.query('ROLLBACK').catch(rbError => console.error('Error during rollback:', rbError));
    } finally {
        client.release();
        console.log('[Executor] Worker logic finished its run.');
    }
}

// Eksportujemy naszą funkcję, aby mogła być używana przez inne pliki
module.exports = { runExecutor };