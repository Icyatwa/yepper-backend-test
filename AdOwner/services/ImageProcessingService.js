// services/ImageProcessingService.js - FIXED FOR DALL-E 2
const sharp = require('sharp');
const OpenAI = require('openai');

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY
});

class ImageProcessingService {

  static async resizeImage(buffer, targetWidth, targetHeight) {
    try {
      const resizedBuffer = await sharp(buffer)
        .resize(targetWidth, targetHeight, {
          fit: 'fill',
          kernel: 'lanczos3',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .sharpen()
        .jpeg({ 
          quality: 95, 
          chromaSubsampling: '4:4:4' 
        })
        .toBuffer();
      
      return resizedBuffer;
    } catch (error) {
      throw new Error(`Image resize failed: ${error.message}`);
    }
  }

  static async generateImageWithAI(images, prompt, requirements, businessContext) {
    try {
      // Build comprehensive prompt for DALL-E
      const generationPrompt = `Create a professional advertisement banner for ${businessContext.businessName}, located in ${businessContext.businessLocation}. 

Business Description: ${businessContext.adDescription}

Design Request: ${prompt}

Requirements:
- Modern, eye-catching design suitable for ${requirements.width}x${requirements.height}px (${requirements.label})
- Include business name prominently
- Professional typography and clear hierarchy  
- Vibrant colors that attract attention
- Clear call-to-action
- High-quality commercial advertisement style
- Clean, polished, ready for publication`;

      console.log('[DALL-E] Generating advertisement...');

      // Generate with DALL-E 2 (cheaper: $0.02 vs $0.08)
      // NOTE: DALL-E 2 does NOT support 'quality' parameter
      const response = await openai.images.generate({
        model: "dall-e-2",
        prompt: generationPrompt,
        n: 1,
        size: this.getOptimalDALLESize(requirements.width, requirements.height),
        response_format: "b64_json"
        // Don't include 'quality' - it's only for DALL-E 3
      });

      if (!response.data || response.data.length === 0) {
        throw new Error('DALL-E did not generate an image. Please try again.');
      }

      const base64Image = response.data[0].b64_json;
      const imageBuffer = Buffer.from(base64Image, 'base64');

      console.log('[DALL-E] Image generated successfully, resizing to exact dimensions...');

      // Resize to exact requirements
      const finalBuffer = await sharp(imageBuffer)
        .resize(requirements.width, requirements.height, {
          fit: 'fill',
          kernel: 'lanczos3',
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        })
        .sharpen(0.5)
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();

      return {
        success: true,
        buffer: finalBuffer,
        message: 'Advertisement generated successfully with AI'
      };

    } catch (error) {
      console.error('DALL-E Generation Error:', error);
      
      // Handle specific OpenAI errors
      if (error.status === 401 || error.message?.includes('Incorrect API key')) {
        throw new Error('Invalid OpenAI API key. Please check your configuration.');
      }
      
      if (error.status === 429 || error.message?.includes('rate limit')) {
        throw new Error('Too many requests. Please wait a moment and try again.');
      }

      if (error.status === 402 || error.message?.includes('insufficient_quota')) {
        throw new Error('API credits exhausted. Please upgrade to continue generating advertisements.');
      }

      if (error.message?.includes('content_policy_violation')) {
        throw new Error('Your prompt was rejected by content filters. Please rephrase your request to be more appropriate.');
      }

      if (error.message?.includes('billing_hard_limit_reached')) {
        throw new Error('API usage limit reached. Please upgrade your plan to continue.');
      }
      
      throw new Error(`Image generation failed: ${error.message || 'Unknown error'}`);
    }
  }

  // Get optimal DALL-E size based on requirements
  static getOptimalDALLESize(width, height) {
    // DALL-E 2 supports: 256x256, 512x512, 1024x1024
    // Always use 1024x1024 for best quality, then resize
    return "1024x1024";
  }
}

module.exports = ImageProcessingService;