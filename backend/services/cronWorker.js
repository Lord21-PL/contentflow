
const db = require('../db');
const aiService = require('./aiService');
const wordpressService = require('./wordpressService');

/**
 * PLANNER LOGIC
 * Runs once a day to schedule all posts for the next 24 hours.
 */
async function planDailyPosts() {
  console.log('Starting daily post planning...');
  const { rows: projects } = await db.query('SELECT * FROM projects WHERE is_active = TRUE');

  for (const project of projects) {
    try {
      const postsToSchedule = Math.floor(Math.random() * (project.max_posts_per_day - project.min_posts_per_day + 1)) + project.min_posts_per_day;
      console.log(`Project ${project.name}: planning to schedule ${postsToSchedule} posts.`);

      const { rows: keywords } = await db.query(
        'SELECT * FROM keywords WHERE project_id = $1 AND is_used = FALSE ORDER BY RANDOM() LIMIT $2',
        [project.id, postsToSchedule]
      );

      if (keywords.length < postsToSchedule) {
        console.warn(`Not enough unused keywords for project ${project.name}. Scheduled ${keywords.length}.`);
      }

      const now = new Date();
      for (const keyword of keywords) {
        // Generate a random timestamp within the next 24 hours
        const randomOffset = Math.random() * 24 * 60 * 60 * 1000; // milliseconds in 24h
        const publishAt = new Date(now.getTime() + randomOffset);

        await db.query('BEGIN');
        // Insert into schedule
        await db.query(
          'INSERT INTO scheduled_posts (project_id, keyword_id, publish_at) VALUES ($1, $2, $3)',
          [project.id, keyword.id, publishAt]
        );
        // Mark keyword as used immediately to prevent re-scheduling
        await db.query('UPDATE keywords SET is_used = TRUE WHERE id = $1', [keyword.id]);
        await db.query('COMMIT');

        console.log(`Scheduled post for keyword \"${keyword.keyword}\" at ${publishAt.toLocaleString()}`);
      }
    } catch (error) {
      await db.query('ROLLBACK');
      console.error(`Failed to plan posts for project ${project.name}:`, error.message);
    }
  }
  console.log('Daily post planning finished.');
}

/**
 * EXECUTOR LOGIC
 * Runs every few minutes to process due posts.
 */
async function executeDuePost() {
  console.log('Executor running: checking for due posts...');

  let job;
  try {
    // Atomically fetch and lock one due job to prevent multiple workers from picking it up
    const { rows } = await db.query(`
      UPDATE scheduled_posts
      SET status = 'processing'
      WHERE id = (
        SELECT id
        FROM scheduled_posts
        WHERE status = 'pending' AND publish_at <= NOW()
        ORDER BY publish_at
        LIMIT 1
        FOR UPDATE SKIP LOCKED
      )
      RETURNING *;
    `);

    if (rows.length === 0) {
      console.log('No due posts found.');
      return;
    }
    job = rows[0];

    console.log(`Processing job ID ${job.id}...`);

    // Fetch project and keyword details
    const projectRes = await db.query('SELECT * FROM projects WHERE id = $1', [job.project_id]);
    const keywordRes = await db.query('SELECT * FROM keywords WHERE id = $1', [job.keyword_id]);
    const project = projectRes.rows[0];
    const keyword = keywordRes.rows[0];

    if (!project || !keyword) {
      throw new Error('Project or Keyword not found for this job.');
    }

    // --- The actual content generation process ---
    const wpCategories = await wordpressService.getCategories(project);
    if (wpCategories.length === 0) throw new Error('No categories found on WordPress.');

    const analysis = await aiService.analyzeKeyword(keyword.keyword, wpCategories);
    let targetCategory = wpCategories.find(c => c.name === analysis.category);
    if (!targetCategory) targetCategory = wpCategories[0];

    const articleContent = await aiService.generateArticle(analysis.title, analysis.language);
    const imageUrl = await aiService.generateFeaturedImage(analysis.title, analysis.language);
    const media = await wordpressService.uploadImage(project, imageUrl, analysis.title);
    const seoMeta = await aiService.generateSeoMeta(articleContent, analysis.language);

    const postData = {
      title: analysis.title,
      content: articleContent,
      categoryId: targetCategory.id,
      featuredMediaId: media.id,
      seoMeta: seoMeta,
    };
    const newPost = await wordpressService.createPost(project, postData);

    // --- Finalize ---
    await db.query(
      'INSERT INTO articles (project_id, keyword_id, wp_post_id, post_url, title) VALUES ($1, $2, $3, $4, $5)',
      [project.id, keyword.id, newPost.id, newPost.link, newPost.title.rendered]
    );
    await db.query("UPDATE scheduled_posts SET status = 'completed' WHERE id = $1", [job.id]);
    console.log(`Successfully processed job ID ${job.id}. Post URL: ${newPost.link}`);

  } catch (error) {
    console.error(`Failed to process job ID ${job ? job.id : 'unknown'}:`, error.response ? error.response.data : error.message);
    if (job) {
      await db.query("UPDATE scheduled_posts SET status = 'failed', error_message = $1 WHERE id = $2", [error.message, job.id]);
    }
  }
}

module.exports = { planDailyPosts, executeDuePost };
