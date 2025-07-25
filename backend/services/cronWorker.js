const db = require('../db');
const OpenAI = require('openai');
const axios = require('axios');

const MAX_RETRIES = 3;

async function getWordPressCategories(jobDetails) {
    const { wp_url, wp_user, wp_password } = jobDetails;
    const categoriesUrl = `${wp_url.replace(/\/$/, '')}/wp-json/wp/v2/categories?per_page=100`;
    const credentials = Buffer.from(`${wp_user}:${wp_password}`).toString('base64');
    
    try {
        console.log('[Executor] Fetching categories from WordPress...');
        const response = await axios.get(categoriesUrl, {
            headers: { 'Authorization': `Basic ${credentials}` }
        });
        return response.data.map(cat => ({ id: cat.id, name: cat.name }));
    } catch (error) {
        console.error('[Executor] Failed to fetch WordPress categories.', error.response ? error.response.data : error);
        return [];
    }
}

async function findBestCategoryId(keyword, categories, openai) {
    if (categories.length === 0) {
        return 0;
    }
    
    const prompt = `
        Na podstawie słowa kluczowego: "${keyword}"
        Wybierz JEDNĄ, najbardziej pasującą kategorię z poniższej listy.
        Lista kategorii (w formacie JSON):
        ${JSON.stringify(categories)}

        Twoim zadaniem jest odpowiedzieć TYLKO I WYŁĄCZNIE numerem ID wybranej kategorii.
        Jeśli absolutnie żadna kategoria nie pasuje, odpowiedz TYLKO numerem 0.
        Nie dodawaj żadnych wyjaśnień, komentarzy ani kropek. Tylko numer.
    `;

    try {
        console.log('[Executor] Asking AI to choose the best category...');
        const completion = await openai.chat.completions.create({
            model: "gpt-4-turbo-preview",
            messages: [{ role: "user", content: prompt }],
        });
        const responseText = completion.choices[0].message.content.trim();
        const categoryId = parseInt(responseText, 10);

        if (isNaN(categoryId)) {
            console.error(`[Executor] AI returned a non-numeric category ID: "${responseText}". Defaulting to 0.`);
            return 0;
        }
        
        console.log(`[Executor] AI chose category ID: ${categoryId}`);
        return categoryId;

    } catch (error) {
        console.error('[Executor] Error while asking AI for category.', error);
        return 0;
    }
}

async function runExecutor() {
    console.log('[Executor] Worker logic started. Looking for a job to process...');
    const client = await db.getClient();
    let jobId = null;

    try {
        await client.query('BEGIN');
        const jobResult = await client.query(`SELECT id FROM scheduled_posts WHERE (status = 'pending' AND publish_at <= NOW()) OR (status = 'failed' AND retry_count < $1) ORDER BY publish_at LIMIT 1 FOR UPDATE SKIP LOCKED`, [MAX_RETRIES]);
        if (jobResult.rows.length === 0) {
            await client.query('COMMIT');
            return;
        }
        jobId = jobResult.rows[0].id;
        await client.query("UPDATE scheduled_posts SET status = 'processing' WHERE id = $1", [jobId]);
        await client.query('COMMIT');
        
        const fullJobDetailsResult = await client.query(`SELECT p.wp_url, p.wp_user, p.wp_password, k.keyword FROM scheduled_posts sp JOIN projects p ON sp.project_id = p.id JOIN keywords k ON sp.keyword_id = k.id WHERE sp.id = $1`, [jobId]);
        const jobDetails = fullJobDetailsResult.rows[0];
        
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) throw new Error("Zmienna środowiskowa OPENAI_API_KEY nie jest ustawiona!");
        const openai = new OpenAI({ apiKey: apiKey });

        console.log(`[Executor] Generating content for keyword: "${jobDetails.keyword}"`);
        const completion = await openai.chat.completions.create({ model: "gpt-4-turbo-preview", messages: [{ role: "user", content: `Napisz artykuł na bloga na temat: "${jobDetails.keyword}". Artykuł powinien być zoptymalizowany pod SEO, zawierać nagłówki i być gotowy do publikacji.` }] });
        const articleContent = completion.choices[0].message.content;
        const articleTitle = jobDetails.keyword;

        let featuredMediaId = null;
        try {
            console.log(`[Executor] Generating featured image for: "${jobDetails.keyword}"`);
            const imagePrompt = `Fotorealistyczne zdjęcie przedstawiające: ${jobDetails.keyword}. Styl jak w magazynie podróżniczym, żywe kolory, wysoka rozdzielczość, bez tekstu na obrazie.`;
            
            const imageResponse = await openai.images.generate({ model: "dall-e-3", prompt: imagePrompt, n: 1, size: "1024x1024", response_format: "url" });
            
            const imageUrl = imageResponse.data[0].url;
            const imageBufferResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
            const imageBuffer = Buffer.from(imageBufferResponse.data, 'binary');
            const mediaUrl = `${jobDetails.wp_url.replace(/\/$/, '')}/wp-json/wp/v2/media`;
            const credentials = Buffer.from(`${jobDetails.wp_user}:${jobDetails.wp_password}`).toString('base64');

            // =================================================================
            // ZMIANA: Tworzymy "bezpieczną" nazwę pliku, usuwając niedozwolone znaki
            // =================================================================
            const safeFilename = jobDetails.keyword
                .toLowerCase()
                .replace(/\s+/g, '-') // Zamień spacje na myślniki
                .replace(/[^a-z0-9-]/g, '') // Usuń wszystko, co nie jest literą, cyfrą lub myślnikiem
                + '.png';

            const mediaUploadResponse = await axios.post(mediaUrl, imageBuffer, { 
                headers: { 
                    'Authorization': `Basic ${credentials}`, 
                    'Content-Type': 'image/png', 
                    'Content-Disposition': `attachment; filename="${safeFilename}"` // Używamy bezpiecznej nazwy
                } 
            });

            featuredMediaId = mediaUploadResponse.data.id;
            console.log(`[Executor] Image uploaded successfully. Media ID: ${featuredMediaId}`);
            await client.query("UPDATE scheduled_posts SET wordpress_media_id = $1 WHERE id = $2", [featuredMediaId, jobId]);
        } catch (imageError) {
            console.error(`[Executor] Failed to generate or upload featured image for job ID: ${jobId}. Continuing without image.`, imageError);
        }

        const categories = await getWordPressCategories(jobDetails);
        const categoryId = await findBestCategoryId(jobDetails.keyword, categories, openai);

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
        if (categoryId > 0) {
            postPayload.categories = [categoryId];
            console.log(`[Executor] Assigning post to category ID: ${categoryId}`);
        } else {
            console.log('[Executor] No suitable category found. Posting as uncategorized.');
        }
        
        const credentials = Buffer.from(`${jobDetails.wp_user}:${jobDetails.wp_password}`).toString('base64');
        const response = await axios.post(wpUrl, postPayload, { headers: { 'Authorization': `Basic ${credentials}`, 'Content-Type': 'application/json' } });
        const postUrl = response.data.link;
        console.log(`[Executor] Successfully published post. URL: ${postUrl}`);

        await client.query("UPDATE scheduled_posts SET status = 'completed', wordpress_post_url = $1 WHERE id = $2", [postUrl, jobId]);
        console.log(`[Executor] Job ID: ${jobId} marked as 'completed'.`);

    } catch (error) {
        console.error(`[Executor] CRITICAL ERROR processing job ID: ${jobId || 'UNKNOWN'}.`, error);
        if (jobId) {
            const errorMessage = error.message + (error.response ? JSON.stringify(error.response.data) : '');
            await client.query(`UPDATE scheduled_posts SET status = 'failed', error_message = $1, retry_count = retry_count + 1 WHERE id = $2`, [errorMessage, jobId]);
            console.log(`[Executor] Job ID: ${jobId} marked as 'failed'. Incrementing retry count.`);
        }
        await client.query('ROLLBACK').catch(rbError => console.error('Error during rollback:', rbError));
    } finally {
        client.release();
        console.log('[Executor] Worker logic finished its run.');
    }
}

module.exports = { runExecutor };