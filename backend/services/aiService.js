
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

async function analyzeKeyword(keyword, existingCategories) {
  const prompt = `
    Analyze the keyword: \"${keyword}\".
    Based on this keyword, provide the following in JSON format:
    1.  \"language\": The ISO 639-1 code for the language of the keyword (e.g., \"en\", \"pl\", \"de\").
    2.  \"title\": A compelling, SEO-friendly article title in that language.
    3.  \"category\": The most relevant category from the following list: [${existingCategories.map(c => `\"${c.name}\"`).join(', ')}]. Choose only one.

    Your response must be a single, valid JSON object and nothing else.
    Example response:
    {
      \"language\": \"en\",
      \"title\": \"The Ultimate Guide to ${keyword}\",
      \"category\": \"Technology\"
    }
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content);
}

async function generateArticle(title, language) {
  const prompt = `
    Write a high-quality, unique article of at least 200 words in ${language}.
    The title of the article is: \"${title}\".
    The article should be well-structured with a clear introduction, body with headings (using <h2> tags), and a conclusion.
    The tone should be informative and engaging.
    Do not include the main title in the body of your response. Start directly with the first paragraph.
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4",
    messages: [{ role: "user", content: prompt }],
  });

  return response.choices[0].message.content;
}

async function generateFeaturedImage(articleTitle, language) {
  const prompt = `
    Create a photorealistic, high-quality image that visually represents the theme of an article titled: \"${articleTitle}\".
    The image should be visually appealing and suitable as a featured image for a blog post. Avoid text in the image.
    Style: photorealistic, vibrant colors, professional photography.
    Language for context: ${language}.
  `;

  const response = await openai.images.generate({
    model: "dall-e-3",
    prompt: prompt,
    n: 1,
    size: "1024x1024",
    quality: "standard",
  });

  return response.data[0].url;
}

async function generateSeoMeta(articleContent, language) {
  const prompt = `
    Based on the following article content, generate SEO metadata in ${language}.
    Provide the response in a valid JSON object format with two keys: \"meta_title\" and \"meta_description\".
    - \"meta_title\": A concise and SEO-optimized title, max 60 characters.
    - \"meta_description\": A compelling summary, max 160 characters.

    Article Content:
    ---
    ${articleContent.substring(0, 1500)}...
    ---

    Your response must be a single, valid JSON object and nothing else.
  `;

  const response = await openai.chat.completions.create({
    model: "gpt-4-turbo-preview",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  return JSON.parse(response.choices[0].message.content);
}

module.exports = {
  analyzeKeyword,
  generateArticle,
  generateFeaturedImage,
  generateSeoMeta,
};
