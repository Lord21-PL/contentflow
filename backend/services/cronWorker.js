const { Pool } = require('pg');
const OpenAI = require('openai');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

async function processJob(job) {
    const client = await pool.connect();
    try {
        console.log(`[Executor] Processing job ID ${job.id} for keyword: "${job.keyword}"`);
        await client.query('UPDATE scheduled_posts SET status = $1, updated_at = NOW() WHERE id = $2', ['processing', job.id]);

        const projectResult = await client.query('SELECT * FROM projects WHERE id = $1', [job.project_id]);
        const project = projectResult.rows[0];

        const prompt = `Napisz artykuł na bloga na temat: "${job.keyword}". Artykuł powinien być zoptymalizowany pod SEO, mieć co najmniej 800 słów, zawierać nagłówki H2 i H3. Tytuł artykułu powinien być chwytliwy i zawierać słowo kluczowe. Artykuł musi być w języku polskim. Na końcu artykułu nie dodawaj żadnego podsumowania ani stopki.`;
        const model = 'gpt-4-turbo-preview';

        console.log(`[Executor] Full prompt being sent to OpenAI for job ID ${job.id}:`);
        console.log(prompt);

        const completion = await openai.chat.completions.create({
            model: model,
            messages: [{ role: 'user', content: prompt }],
        });

        const articleContent = completion.choices[0].message.content;
        const articleTitleMatch = articleContent.match(/^(.*?)(\n|$)/);
        const articleTitle = articleTitleMatch ? articleTitleMatch[1].replace(/#/g, '').trim() : job.keyword;
        const articleBody = articleContent.substring(articleTitle.length).trim();

        const authString = `${project.wp_user}:${project.wp_password}`;
        const encodedAuth = Buffer.from(authString).toString('base64');

        const response = await fetch(`${project.wp_url}/wp-json/wp/v2/posts`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Basic ${encodedAuth}`
            },
            body: JSON.stringify({
                title: articleTitle,
                content: articleBody,
                status: 'publish'
            })
        });

        if (!response.ok) {
            const errorBody = await response.json();
            throw new Error(`WordPress API Error: ${response.status} ${JSON.stringify(errorBody)}`);
        }

        const postData = await response.json();

        await client.query('BEGIN');
        await client.query('UPDATE scheduled_posts SET status = $1, updated_at = NOW() WHERE id = $2', ['completed', job.id]);
        await client.query(
            'INSERT INTO articles (project_id, title, content, post_url, published_at) VALUES ($1, $2, $3, $4, NOW())',
            [job.project_id, articleTitle, articleBody, postData.link]
        );
        await client.query('COMMIT');

        console.log(`[Executor] Successfully processed and published job ID ${job.id}. Post URL: ${postData.link}`);

    } catch (error) {
        console.error(`[Executor] Failed to process job ID ${job.id}:`, error);
        await client.query('UPDATE scheduled_posts SET status = $1, updated_at = NOW() WHERE id = $2', ['failed', job.id]);
    } finally {
        client.release();
    }
}

async function runExecutor() {
    console.log('[Executor] Cron worker started. Looking for pending jobs...');
    const client = await pool.connect();
    try {
        const res = await client.query(
            `SELECT sp.id, sp.project_id, sp.publish_at, k.keyword
             FROM scheduled_posts sp
             JOIN keywords k ON sp.keyword_id = k.id
             WHERE sp.status = 'pending' AND sp.publish_at <= NOW()
             LIMIT 5`
        );

        if (res.rows.length === 0) {
            console.log('[Executor] No pending jobs to process at this time.');
            return; // Zwróć, jeśli nie ma pracy, ale nie kończ puli jeszcze
        }

        console.log(`[Executor] Found ${res.rows.length} jobs to process.`);
        for (const job of res.rows) {
            await processJob(job);
        }

    } catch (error) {
        console.error('[Executor] Error during cron worker execution:', error);
    } finally {
        client.release();
        // =================================================================
        // WAŻNA ZMIANA: Zamykamy pulę połączeń na samym końcu,
        // aby skrypt mógł się poprawnie zakończyć.
        // =================================================================
        await pool.end();
        console.log('[Executor] Cron worker finished and pool closed.');
    }
}

runExecutor().catch(err => {
    console.error("A critical error occurred in the cron worker:", err);
    pool.end(); // Upewnij się, że pula jest zamykana nawet przy krytycznym błędzie
    process.exit(1);
});