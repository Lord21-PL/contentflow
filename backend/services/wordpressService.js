
const axios = require('axios');
const { Buffer } = require('buffer');

function getWpApi(project) {
  const credentials = Buffer.from(`${project.wp_user}:${project.wp_password}`).toString('base64');
  return axios.create({
    baseURL: `${project.wp_url}/wp-json/wp/v2`,
    headers: {
      'Authorization': `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
  });
}

async function getCategories(project) {
  const wpApi = getWpApi(project);
  const response = await wpApi.get('/categories?per_page=100');
  return response.data.map(cat => ({ id: cat.id, name: cat.name }));
}

async function uploadImage(project, imageUrl, title) {
  const wpApi = getWpApi(project);

  // Fetch the image from DALL-E URL
  const imageResponse = await axios.get(imageUrl, { responseType: 'arraybuffer' });
  const imageBuffer = Buffer.from(imageResponse.data, 'binary');
  const imageName = `${title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;

  const response = await wpApi.post('/media', imageBuffer, {
    headers: {
      'Content-Type': 'image/png',
      'Content-Disposition': `attachment; filename=\"${imageName}\"`,
    },
    params: {
        title: title,
        alt_text: title,
    }
  });
  return response.data;
}

async function createPost(project, { title, content, categoryId, featuredMediaId, seoMeta }) {
  const wpApi = getWpApi(project);
  const postData = {
    title,
    content,
    status: 'publish',
    categories: [categoryId],
    featured_media: featuredMediaId,
    meta: {
      // Yoast SEO / Rank Math compatibility
      _yoast_wpseo_title: seoMeta.meta_title,
      _yoast_wpseo_metadesc: seoMeta.meta_description,
      rank_math_title: seoMeta.meta_title,
      rank_math_description: seoMeta.meta_description,
    },
  };

  const response = await wpApi.post('/posts', postData);
  return response.data;
}

module.exports = { getCategories, uploadImage, createPost };
