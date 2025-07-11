const db = require('../db');
const OpenAI = require('openai');
const axios = require('axios');

const MAX_RETRIES = 3; // Definiujemy maksymalną liczbę prób

async function runExecutor() {
    console.log('[Executor] Worker logic started. Looking for a job to process...');
    const client = await db.getClient();
    let jobId = null;

    try {
        // Krok 1: Znajdź i zablokuj zadanie do wykonania
        await client.query('BEGIN');
        
        // =================================================================
        // KRYTYCZNA ZMIANA #1: Zmieniamy logikę wyboru zadań
        // Teraz bierzemy zadania 'pending' LUB 'failed' z liczbą prób < MAX_RETRIES
        // =================================================================
        const jobResult = await client.query(`
            SELECT id FROM scheduled_posts
            WHERE (status = 'pending' AND publish_at <= NOW()) 
               OR (status = 'failed' AND retry_count < $1)
            ORDER BY publish_at
            LIMIT 1
            FOR UPDATE SKIP LOCKED
        `, [MAX_RETRIES]);

        if (jobResult.rows.length === 0) {
            console.log('[Executor] No pending or retryable jobs found. Worker logic finished.');
            await client.query('COMMIT');
            return;
        }

        jobId = jobResult.rows[0].id;
        console.log(`[Executor] Found job ID: ${jobId}. Locking and setting to 'processing'.`);
        await client.query("UPDATE scheduled_posts SET status = 'processing' WHERE id = $1", [jobId]);
        await client.query('COMMIT');

        // Krok 2: Pobierz szczegóły zadania (bez zmian)
        const fullJobDetailsResult = await client.query(`
            SELECT p.wp_url, p.wp_user, p.wp_password, k.keyword
            FROM scheduled_posts sp
            JOIN projects p ON sp.project_id = p.id
            JOIN keywords k ON sp.keyword_id = k.id
            WHERE sp.id = $1
        `, [jobId]);
        const jobDetails = fullJobDetailsResult.rows[0];

        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error("Zmienna środowiskowa OPENAI_API_KEY nie jest ustawiona!");
        }

        // Krok 3: Wygeneruj treść (bez zmian)
        console.log(`[Executor] Generating content for keyword: "${jobDetails.keyword}"`);
        const openai = new OpenAI({ apiKey: apiKey });
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: `Napisz artykuł na bloga na temat: "${jobDetails.keyword}". Artykuł powinien być zoptymalizowany pod SEO, zawierać nagłówki i być gotowy do publikacji.` }],
        });
        const articleContent = completion.choices[0].message.content;
        const articleTitle = jobDetails.keyword;

        // Krok 4: Opublikuj na WordPress (bez zmian)
        console.log(`[Executor] Publishing article "${articleTitle}" to ${jobDetails.wp_url}`);
        const wpUrl = `${jobDetails.wp_url.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
        const credentials = Buffer.from(`${jobDetails.wp_user}:${jobDetails.wp_password}`).toString('base64');
        
        const response = await axios.post(wpUrl, {
            title: articleTitle,
            content: articleContent,
            status: 'publish'
        }, {
            headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' }
        });

        const postUrl = response.data.link;
        console.log(`[Executor] Successfully published post. URL: ${postUrl}`);

        // Krok 5: Oznacz zadanie jako ukończone (bez zmian)
        await client.query("UPDATE scheduled_posts SET status = 'completed', wordpress_post_url = $1 WHERE id = $2", [postUrl, jobId]);
        console.log(`[Executor] Job ID: ${jobId} marked as 'completed'.`);

    } catch (error) {
        // =================================================================
        // KRYTYCZNA ZMIANA #2: Zmieniamy logikę obsługi błędów
        // Teraz zwiększamy licznik prób przy każdym błędzie
        // =================================================================
        console.error(`[Executor] CRITICAL ERROR processing job ID: ${jobId || 'UNKNOWN'}.`, error.response ? error.response.data : error);
        if (jobId) {
            const errorMessage = error.message + (error.response ? JSON.stringify(error.response.data) : '');
            await client.query(`
                UPDATE scheduled_posts 
                SET status = 'failed', 
                    error_message = $1, 
                    retry_count = retry_count + 1 
                WHERE id = $2
            `, [errorMessage, jobId]);
            console.log(`[Executor] Job ID: ${jobId} marked as 'failed'. Incrementing retry count.`);
        }
        await client.query('ROLLBACK').catch(rbError => console.error('Error during rollback:', rbError));
    } finally {
        client.release();
        console.log('[Executor] Worker logic finished its run.');
    }
}

module.exports = { runExecutor };