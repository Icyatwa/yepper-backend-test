// controllers/aiController.js - Real web image search
const promptEngine = require('../utils/promptEngine');

// Improved entity extraction - gets people, brands, products
const extractEntities = (text) => {
  const entities = new Set();
  
  // 1. Extract people names (First Last, or First Middle Last)
  const peoplePattern = /\b([A-Z][a-z]+\s+(?:[A-Z][a-z]+\s+)?[A-Z][a-z]+)\b/g;
  const people = text.matchAll(peoplePattern);
  for (const match of people) {
    if (match[1] && match[1].split(' ').length >= 2) {
      entities.add(match[1]);
    }
  }
  
  // 2. Extract company/brand names (capitalized single or multi-word)
  const brandPattern = /\b([A-Z][a-z]*(?:[A-Z][a-z]*)*(?:\s+[A-Z][a-z]+)*)\b/g;
  const brands = text.matchAll(brandPattern);
  for (const match of brands) {
    if (match[1] && match[1].length > 2 && !['The', 'This', 'That', 'When', 'What', 'Where', 'Why', 'How', 'Your'].includes(match[1])) {
      entities.add(match[1]);
    }
  }
  
  // 3. Extract quoted terms
  const quotedTerms = text.match(/"([^"]+)"/g) || [];
  quotedTerms.forEach(term => entities.add(term.replace(/"/g, '')));
  
  // 4. Common CEO/founder names in tech/business context
  const famousPeople = ['Elon Musk', 'Jeff Bezos', 'Mark Zuckerberg', 'Sam Altman', 
    'Satya Nadella', 'Tim Cook', 'Bill Gates', 'Steve Jobs', 'Warren Buffett',
    'Jack Ma', 'Larry Page', 'Sergey Brin', 'Sundar Pichai'];
  
  famousPeople.forEach(name => {
    if (text.includes(name)) {
      entities.add(name);
    }
  });
  
  // 5. Famous brands
  const famousBrands = ['Apple', 'Google', 'Microsoft', 'Amazon', 'Facebook', 'Meta',
    'Tesla', 'Nike', 'Coca-Cola', 'McDonald\'s', 'Starbucks', 'Netflix', 'OpenAI',
    'Airbnb', 'Uber', 'Instagram', 'TikTok', 'Twitter', 'LinkedIn'];
  
  famousBrands.forEach(brand => {
    if (text.toLowerCase().includes(brand.toLowerCase())) {
      entities.add(brand);
    }
  });
  
  return Array.from(entities).slice(0, 10);
};

// OPTION 1: Google Custom Search API (Best quality, most accurate)
const searchImagesGoogle = async (query) => {
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  const GOOGLE_CSE_ID = process.env.GOOGLE_CSE_ID;
  
  if (!GOOGLE_API_KEY || !GOOGLE_CSE_ID) {
    console.warn('Google API not configured');
    return null;
  }
  
  try {
    const url = `https://www.googleapis.com/customsearch/v1?key=${GOOGLE_API_KEY}&cx=${GOOGLE_CSE_ID}&q=${encodeURIComponent(query)}&searchType=image&num=1&imgSize=large&safe=active`;
    
    console.log(`Searching Google Images for: "${query}"`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('Google API error:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    if (data.items && data.items.length > 0) {
      const item = data.items[0];
      return {
        url: item.link,
        thumbnail: item.image?.thumbnailLink || item.link,
        alt: item.title || query,
        context: item.snippet || '',
        source: 'Google Images',
        pageUrl: item.image?.contextLink
      };
    }
  } catch (error) {
    console.error('Google search error:', error);
  }
  
  return null;
};

// OPTION 2: Bing Image Search API (Also excellent, often faster)
const searchImagesBing = async (query) => {
  const BING_API_KEY = process.env.BING_SEARCH_API_KEY;
  
  if (!BING_API_KEY) {
    console.warn('Bing API not configured');
    return null;
  }
  
  try {
    const url = `https://api.bing.microsoft.com/v7.0/images/search?q=${encodeURIComponent(query)}&count=1&safeSearch=Moderate&imageType=Photo`;
    
    console.log(`Searching Bing Images for: "${query}"`);
    
    const response = await fetch(url, {
      headers: {
        'Ocp-Apim-Subscription-Key': BING_API_KEY
      }
    });
    
    if (!response.ok) {
      console.error('Bing API error:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    if (data.value && data.value.length > 0) {
      const item = data.value[0];
      return {
        url: item.contentUrl,
        thumbnail: item.thumbnailUrl,
        alt: item.name || query,
        context: item.hostPageDisplayUrl || '',
        source: 'Bing Images',
        pageUrl: item.hostPageUrl,
        width: item.width,
        height: item.height
      };
    }
  } catch (error) {
    console.error('Bing search error:', error);
  }
  
  return null;
};

// OPTION 3: SerpApi (Scrapes Google Images - easiest to set up)
const searchImagesSerpApi = async (query) => {
  const SERPAPI_KEY = process.env.SERPAPI_KEY;
  
  if (!SERPAPI_KEY) {
    console.warn('SerpApi not configured');
    return null;
  }
  
  try {
    const url = `https://serpapi.com/search.json?engine=google_images&q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}&num=1`;
    
    console.log(`Searching via SerpApi for: "${query}"`);
    
    const response = await fetch(url);
    
    if (!response.ok) {
      console.error('SerpApi error:', response.statusText);
      return null;
    }
    
    const data = await response.json();
    
    if (data.images_results && data.images_results.length > 0) {
      const item = data.images_results[0];
      return {
        url: item.original,
        thumbnail: item.thumbnail,
        alt: item.title || query,
        context: item.source || '',
        source: 'Google Images (SerpApi)',
        pageUrl: item.link
      };
    }
  } catch (error) {
    console.error('SerpApi search error:', error);
  }
  
  return null;
};

// Main search function - tries multiple sources
const searchWebImages = async (query) => {
  // Try sources in order of preference
  let image = null;
  
  // Try Google first (best quality)
  image = await searchImagesGoogle(query);
  if (image) return image;
  
  // Try Bing second
  image = await searchImagesBing(query);
  if (image) return image;
  
  // Try SerpApi third
  image = await searchImagesSerpApi(query);
  if (image) return image;
  
  console.log(`No images found for: "${query}"`);
  return null;
};

// Main controller
exports.generateResponse = async (req, res) => {
  try {
    const { message } = req.body;

    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message is required'
      });
    }

    const engineResult = promptEngine.process(message);
    const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
    
    if (!GEMINI_API_KEY) {
      return res.status(500).json({
        success: false,
        message: 'AI service not configured - GEMINI_API_KEY is missing'
      });
    }

    console.log('Calling Gemini API with intent:', engineResult.intent);
    const structuredPrompt = `
      ${engineResult.systemPrompt}

      Now follow this strict output format:

      - Title: (short, compelling headline)
      - Slides:
        1. (Hook)
        2. (Emotional truth)
        3. (Main insight)
        4. (Action step)
        5. (Reflection or summary)
      - Tone: clear, confident, rhythmic
      - Add a short visual concept suggestion for each slide.
      - Avoid corporate or academic tone.

      USER QUESTION: ${message}
    `;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-exp:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: structuredPrompt
            }]
          }],
          generationConfig: {
            temperature: 0.7,
            topK: 40,
            topP: 0.95,
            maxOutputTokens: 2048,
          },
          safetySettings: [
            {
              category: "HARM_CATEGORY_HARASSMENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_HATE_SPEECH",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_SEXUALLY_EXPLICIT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            },
            {
              category: "HARM_CATEGORY_DANGEROUS_CONTENT",
              threshold: "BLOCK_MEDIUM_AND_ABOVE"
            }
          ]
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Gemini API Error:', errorData);
      throw new Error(`Gemini API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    let aiResponseText = '';
    
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
      aiResponseText = data.candidates[0].content.parts[0].text;
    } else {
      throw new Error('Invalid response structure from Gemini API');
    }
    
    // Extract entities from both user message and AI response
    const userEntities = extractEntities(message);
    const responseEntities = extractEntities(aiResponseText);
    const allEntities = [...new Set([...userEntities, ...responseEntities])];
    
    console.log('Extracted entities for image search:', allEntities);
    
    // Search for real images from the web
    const entityImages = {};
    const imagePromises = allEntities.slice(0, 8).map(async (entity) => {
      const image = await searchWebImages(entity);
      if (image) {
        entityImages[entity] = image;
        console.log(`✓ Found image for "${entity}" from ${image.source}`);
      } else {
        console.log(`✗ No image found for "${entity}"`);
      }
    });
    
    await Promise.all(imagePromises);
    
    console.log(`Successfully fetched ${Object.keys(entityImages).length} real images from the web`);
    
    return res.json({
      success: true,
      response: aiResponseText,
      metadata: {
        intent: engineResult.intent,
        entities: allEntities,
        entityImages: entityImages,
        suggestions: engineResult.suggestions,
        context: engineResult.context,
        imageCount: Object.keys(entityImages).length
      }
    });

  } catch (error) {
    console.error('AI generation error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to generate response',
      error: error.message
    });
  }
};