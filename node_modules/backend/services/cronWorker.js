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

        // Krok 2: Pobierz szczegóły zadania
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
        const openai = new OpenAI({ apiKey: apiKey });

        // Krok 3: Wygeneruj treść
        console.log(`[Executor] Generating content for keyword: "${jobDetails.keyword}"`);
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: `Napisz artykuł na bloga na temat: "${jobDetails.keyword}". Artykuł powinien być zoptymalizowany pod SEO, zawierać nagłówki i być gotowy do publikacji.` }],
        });
        const articleContent = completion.choices[0].message.content;
        const articleTitle = jobDetails.keyword;

        // =================================================================
        // NOWY KROK 3.5: Generowanie i upload obrazka wyróżniającego
        // =================================================================
        let featuredMediaId = null;
        try {
            console.log(`[Executor] Generating featured image for: "${jobDetails.keyword}"`);
            const imagePrompt = `Fotorealistyczne zdjęcie przedstawiające: ${jobDetails.keyword}. Styl jak w magazynie podróżniczym, żywe kolory, wysoka rozdzielczość, bez tekstu na obrazie.`;
            
            const imageResponse = await openai.images.generate({
                model: "dall-e-3",
                prompt: imagePrompt,
                n: 1,
                size: "1024x1024",
                response_format: "url",
            });
            const imageUrl = imageResponse.data[0].url;
            console.log(`[Executor] Image generated. URL: ${imageUrl}`);

            // Pobierz obrazek do bufora
            const imageBufferResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageBufferResponse.data, 'binary');

            // Wgraj obrazek do biblioteki mediów WordPressa
            console.log(`[Executor] Uploading image to WordPress media library...`);
            const mediaUrl = `${jobDetails.wp_url.replace(/\/$/, '')}/wp-json/wp/v2/media`;
            const credentials = Buffer.from(`${jobDetails.wp_user}:${jobDetails.wp_password}`).toString('base64');
            
            const mediaUploadResponse = await axios.post(mediaUrl, imageBuffer, {
                headers: {
                    'Authorization': `Basic ${credentials}`,
                    'Content-Type': 'image/png',
                    'Content-Disposition': `attachment; filename="${jobDetails.keyword.replace(/\s+/g, '-').toLowerCase()}.png"`
                }
            });

            featuredMediaId = mediaUploadResponse.data.id;
            console.log(`[Executor] Image uploaded successfully. Media ID: ${featuredMediaId}`);
            
            // Zapisz ID obrazka w naszej bazie
            await client.query("UPDATE scheduled_posts SET wordpress_media_id = $1 WHERE id = $2", [featuredMediaId, jobId]);

        } catch (imageError) {
            console.error(`[Executor] Failed to generate or upload featured image for job ID: ${jobId}. Continuing without image.`, imageError.response ? imageError.response.data : imageError);
        }

        // Krok 4: Opublikuj na WordPress (z dołączeniem obrazka)
        console.log(`[Executor] Publishing article "${articleTitle}" to ${jobDetails.wp_url}`);
        const wpUrl = `${jobDetails.wp_url.replace(/\/$/, '')}/wp-json/wp/v2/posts`;
        const postPayload = {
            title: articleTitle,
            content: articleContent,
            status: 'publish',
        };

        if (featuredMediaId) {
            postPayload.featured_media = featuredMediaId;
        }
        
        const credentials = Buffer.from(`${jobDetails.wp_user}:${jobDetails.wp_password}`).toString('base64');
        const response = await axios.post(wpUrl, postPayload, {
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