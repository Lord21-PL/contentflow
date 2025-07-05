
const db = require('../db');
const aiService = require('./aiService');
const wordpressService = require('./wordpressService');

async function runContentFlow() {
  console.log('Starting ContentFlow worker process...');
  const { rows: projects } = await db.query('SELECT * FROM projects WHERE is_active = TRUE');

  for (const project of projects) {
    console.log(`Processing project: ${project.name}`);
    try {
      await processProject(project);
    } catch (error) {
      console.error(`Failed to process project ${project.name}:`, error.message);
    }
  }
  console.log('ContentFlow worker process finished.');
}

async function processProject(project) {
  const postsToCreate = Math.floor(Math.random() * (project.max_posts_per_day - project.min_posts_per_day + 1)) + project.min_posts_per_day;
  console.log(`Project ${project.name} will attempt to create ${postsToCreate} posts today.`);

  const { rows: keywords } = await db.query(
    'SELECT * FROM keywords WHERE project_id = $1 AND is_used = FALSE ORDER BY RANDOM() LIMIT $2',
    [project.id, postsToCreate]
  );

  if (keywords.length === 0) {
    console.log(`No unused keywords for project ${project.name}. Skipping.`);
    // Here you could add a notification logic
    return;
  }

  const wpCategories = await wordpressService.getCategories(project);
  if (wpCategories.length === 0) {
      console.error(`No categories found on WordPress for project ${project.name}. Cannot proceed.`);
      return;
  }

  for (const keyword of keywords) {
    try {
      console.log(`Processing keyword: \"${keyword.keyword}\"`);

      // 1. AI Analysis (Title, Category)
      const analysis = await aiService.analyzeKeyword(keyword.keyword, wpCategories);
      const targetCategory = wpCategories.find(c => c.name === analysis.category);
      if (!targetCategory) {
          console.warn(`AI suggested category \"${analysis.category}\" not found. Defaulting to first available.`);
          targetCategory = wpCategories[0];
      }

      // 2. AI Article Generation
      const articleContent = await aiService.generateArticle(analysis.title, analysis.language);

      // 3. AI Image Generation
      const imageUrl = await aiService.generateFeaturedImage(analysis.title, analysis.language);

      // 4. Upload Image to WordPress
      const media = await wordpressService.uploadImage(project, imageUrl, analysis.title);

      // 5. AI SEO Meta Generation
      const seoMeta = await aiService.generateSeoMeta(articleContent, analysis.language);

      // 6. Publish Post to WordPress
      const postData = {
        title: analysis.title,
        content: articleContent,
        categoryId: targetCategory.id,
        featuredMediaId: media.id,
        seoMeta: seoMeta,
      };
      const newPost = await wordpressService.createPost(project, postData);
      console.log(`Successfully published post: ${newPost.link}`);

      // 7. Update Database
      await db.query('BEGIN');
      await db.query('UPDATE keywords SET is_used = TRUE WHERE id = $1', [keyword.id]);
      await db.query(
        'INSERT INTO articles (project_id, keyword_id, wp_post_id, post_url, title) VALUES ($1, $2, $3, $4, $5)',
        [project.id, keyword.id, newPost.id, newPost.link, newPost.title.rendered]
      );
      await db.query('COMMIT');

    } catch (error) {
      console.error(`Error processing keyword ID ${keyword.id} (\"${keyword.keyword}\"):`, error.response ? error.response.data : error.message);
      await db.query('ROLLBACK');
    }
  }
}

module.exports = { runContentFlow };
