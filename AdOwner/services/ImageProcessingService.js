// services/ImageProcessingService.js
const { GoogleGenerativeAI } = require('@google/generative-ai');
const sharp = require('sharp');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

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
        .jpeg({ quality: 95, chromaSubsampling: '4:4:4' })
        .toBuffer();

      return resizedBuffer;
    } catch (error) {
      throw new Error(`Image resize failed: ${error.message}`);
    }
  }

  static async enhanceImageQuality(buffer) {
    try {
      const enhancedBuffer = await sharp(buffer)
        .sharpen({
          sigma: 1.5,
          m1: 0.8,
          m2: 0.8,
          x1: 3,
          y2: 15,
          y3: 15
        })
        .modulate({
          brightness: 1.02,
          saturation: 1.1
        })
        .normalize()
        .toColorspace('srgb')
        .jpeg({ 
          quality: 98, 
          chromaSubsampling: '4:4:4',
          mozjpeg: true 
        })
        .toBuffer();

      return enhancedBuffer;
    } catch (error) {
      throw new Error(`Image enhancement failed: ${error.message}`);
    }
  }

  static async generateAdWithAI(images, prompt, requirements, businessContext) {
    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.0-flash-exp',
        generationConfig: {
          temperature: 0.4,
          topK: 32,
          topP: 1,
          maxOutputTokens: 2048,
        }
      });

      const validationPrompt = `Analyze if this is a legitimate business advertisement request:

Business Name: ${businessContext.businessName}
Business Location: ${businessContext.businessLocation}
Business Description: ${businessContext.adDescription}
User Request: ${prompt}

Requirements:
- Size: ${requirements.width}x${requirements.height}px
- Type: Advertisement for business promotion

Respond with ONLY "VALID" or "INVALID: [reason]".
It's INVALID if:
- Request is unrelated to advertising/business promotion
- Contains inappropriate content
- Tries to generate non-business imagery
- Purpose is not clearly for advertisement
- Request seems unrelated to the business provided`;

      const validationResult = await model.generateContent(validationPrompt);
      const validationText = validationResult.response.text().trim();

      if (validationText.startsWith('INVALID')) {
        throw new Error(`Content validation failed: ${validationText.replace('INVALID: ', '')}`);
      }

      const adGenerationPrompt = `Create a professional advertisement design description based on:

Business: ${businessContext.businessName}
Location: ${businessContext.businessLocation}
Description: ${businessContext.adDescription}

User Requirements: ${prompt}

Design Specifications:
- Dimensions: ${requirements.width}x${requirements.height}px (${requirements.label})
- Style: Professional, eye-catching, brand-focused

Please provide detailed suggestions for:
1. Layout and element positioning
2. Color scheme recommendations
3. Typography style suggestions
4. Key visual elements to emphasize
5. Call-to-action placement and wording
6. Overall composition strategy

Format your response as a structured guide that would help create an effective advertisement.`;

      const designResult = await model.generateContent(adGenerationPrompt);
      const designGuidance = designResult.response.text();

      return {
        success: true,
        designGuidance: designGuidance,
        validation: 'VALID',
        message: 'Ad design guidance generated successfully'
      };

    } catch (error) {
      console.error('AI Generation Error Details:', error);
      
      if (error.message.includes('Content validation failed')) {
        throw error;
      }
      
      if (error.message.includes('API key not valid') || error.message.includes('API_KEY_INVALID')) {
        throw new Error('Invalid API key. Please check your GEMINI_API_KEY in .env file');
      }
      
      if (error.message.includes('quota') || error.message.includes('RESOURCE_EXHAUSTED')) {
        throw new Error('API quota exceeded. Please try again later or upgrade your API plan');
      }
      
      if (error.message.includes('models/') || error.message.includes('404')) {
        throw new Error('Model not available. Try using gemini-2.0-flash-exp or check your API key permissions');
      }

      if (error.message.includes('PERMISSION_DENIED')) {
        throw new Error('API access denied. Ensure your API key has proper permissions');
      }
      
      throw new Error(`AI generation failed: ${error.message}`);
    }
  }

  static async analyzeImagesForAd(imageBuffers, requirements) {
    try {
      return {
        success: true,
        analysis: JSON.stringify({
          imageCount: imageBuffers.length,
          targetDimensions: `${requirements.width}x${requirements.height}px`,
          recommendation: 'Images will be composited into the target dimensions',
          suggestion: 'Layout will be optimized for best visual impact'
        }),
        imageCount: imageBuffers.length
      };

    } catch (error) {
      return {
        success: true,
        analysis: JSON.stringify({
          imageCount: imageBuffers.length,
          targetDimensions: `${requirements.width}x${requirements.height}px`,
          status: 'Basic composition will be applied'
        }),
        imageCount: imageBuffers.length
      };
    }
  }

  static async compositeImages(imageBuffers, targetWidth, targetHeight, layout = 'grid') {
    try {
      const imageCount = imageBuffers.length;
      
      if (imageCount === 1) {
        return await this.resizeImage(imageBuffers[0], targetWidth, targetHeight);
      }

      let composite = sharp({
        create: {
          width: targetWidth,
          height: targetHeight,
          channels: 4,
          background: { r: 255, g: 255, b: 255, alpha: 1 }
        }
      });

      const overlays = [];
      
      if (layout === 'grid' && imageCount === 2) {
        const halfWidth = Math.floor(targetWidth / 2);
        for (let i = 0; i < 2; i++) {
          const resized = await sharp(imageBuffers[i])
            .resize(halfWidth, targetHeight, { fit: 'cover' })
            .toBuffer();
          
          overlays.push({
            input: resized,
            left: i * halfWidth,
            top: 0
          });
        }
      } else if (layout === 'collage' && imageCount >= 2) {
        const mainWidth = Math.floor(targetWidth * 0.6);
        const sideWidth = targetWidth - mainWidth;
        
        const mainImage = await sharp(imageBuffers[0])
          .resize(mainWidth, targetHeight, { fit: 'cover' })
          .toBuffer();
        
        overlays.push({
          input: mainImage,
          left: 0,
          top: 0
        });
        
        const sideImageHeight = Math.floor(targetHeight / (imageCount - 1));
        for (let i = 1; i < imageCount; i++) {
          const sideImage = await sharp(imageBuffers[i])
            .resize(sideWidth, sideImageHeight, { fit: 'cover' })
            .toBuffer();
          
          overlays.push({
            input: sideImage,
            left: mainWidth,
            top: (i - 1) * sideImageHeight
          });
        }
      } else if (layout === 'featured' && imageCount >= 1) {
        const mainHeight = Math.floor(targetHeight * 0.75);
        const thumbHeight = targetHeight - mainHeight;
        const thumbWidth = Math.floor(targetWidth / Math.min(imageCount - 1, 4));
        
        const mainImage = await sharp(imageBuffers[0])
          .resize(targetWidth, mainHeight, { fit: 'cover' })
          .toBuffer();
        
        overlays.push({
          input: mainImage,
          left: 0,
          top: 0
        });
        
        for (let i = 1; i < Math.min(imageCount, 5); i++) {
          const thumb = await sharp(imageBuffers[i])
            .resize(thumbWidth, thumbHeight, { fit: 'cover' })
            .toBuffer();
          
          overlays.push({
            input: thumb,
            left: (i - 1) * thumbWidth,
            top: mainHeight
          });
        }
      } else {
        const cols = 2;
        const rows = Math.ceil(imageCount / cols);
        const cellWidth = Math.floor(targetWidth / cols);
        const cellHeight = Math.floor(targetHeight / rows);

        for (let i = 0; i < Math.min(imageCount, 4); i++) {
          const row = Math.floor(i / cols);
          const col = i % cols;
          
          const resized = await sharp(imageBuffers[i])
            .resize(cellWidth, cellHeight, { fit: 'cover' })
            .toBuffer();
          
          overlays.push({
            input: resized,
            left: col * cellWidth,
            top: row * cellHeight
          });
        }
      }

      const result = await composite
        .composite(overlays)
        .jpeg({ quality: 95 })
        .toBuffer();

      return result;

    } catch (error) {
      throw new Error(`Image composition failed: ${error.message}`);
    }
  }
}

module.exports = ImageProcessingService;