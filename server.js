require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BFL_API_KEY = process.env.BFL_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;
const BFL_API_BASE = 'https://api.bfl.ai/v1';
const CLAUDE_API_BASE = 'https://api.anthropic.com/v1';

// Middleware
app.use(cors());
// Increase JSON body size limit to handle base64-encoded images (up to ~10MB)
// Base64 images can be large: a 2MP image might be 1-2MB base64, larger images up to 5-10MB
app.use(express.json({ limit: '20mb' }));
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Endpoint to convert image URL to base64 (server-side to avoid CORS issues)
app.post('/api/convert-image', async (req, res) => {
  try {
    const { imageUrl } = req.body;
    
    if (!imageUrl) {
      return res.status(400).json({ error: 'Image URL is required' });
    }
    
    console.log('Converting image URL to base64:', imageUrl);
    
    // Fetch the image from the URL
    const response = await axios.get(imageUrl, {
      responseType: 'arraybuffer',
      timeout: 30000, // 30 second timeout
      validateStatus: function (status) {
        return status < 500; // Don't throw on 4xx, we'll handle it
      }
    });
    
    if (response.status >= 400) {
      console.error('Failed to fetch image:', response.status, response.statusText);
      return res.status(response.status).json({ 
        error: 'Failed to fetch image. The URL may have expired or be inaccessible.',
        status: response.status
      });
    }
    
    // Convert to base64
    const base64 = Buffer.from(response.data, 'binary').toString('base64');
    const contentType = response.headers['content-type'] || 'image/jpeg';
    const dataUri = `data:${contentType};base64,${base64}`;
    
    console.log('Image converted successfully, size:', base64.length, 'bytes');
    
    return res.json({ 
      success: true,
      base64: dataUri,
      contentType: contentType
    });
    
  } catch (error) {
    console.error('Error converting image:', error.message);
    
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return res.status(504).json({ 
        error: 'Request to fetch image timed out. The URL may have expired.' 
      });
    }
    
    if (error.response) {
      return res.status(error.response.status).json({ 
        error: 'Failed to fetch image. The URL may have expired or be inaccessible.',
        status: error.response.status
      });
    }
    
    return res.status(500).json({ 
      error: error.message || 'Failed to convert image' 
    });
  }
});

// Enhance prompt endpoint using Claude API
app.post('/api/enhance-prompt', async (req, res) => {
  try {
    const { prompt } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!CLAUDE_API_KEY) {
      return res.status(500).json({ error: 'Claude API key not configured' });
    }

    // Call Claude API to enhance the prompt using Claude 3.5 Haiku (fastest model)
    // Try latest models in order: 3.5 Haiku -> 3 Haiku -> 3.5 Sonnet
    const modelNames = [
      'claude-3-5-haiku-20241022',
      'claude-3-5-haiku',
      'claude-3-haiku-20240307'
    ];

    let enhanceResponse;
    let lastError;

    for (const modelName of modelNames) {
      try {
        enhanceResponse = await axios.post(
          `${CLAUDE_API_BASE}/messages`,
          {
            model: modelName,
            max_tokens: 512,
            messages: [
              {
                role: 'user',
                content: `You are helping to enhance a text prompt for AI image generation. The user has provided a text description, and you need to make it more detailed, descriptive, and optimized for high-quality image generation. Add more specific details about visual elements, style, composition, lighting, mood, and artistic qualities. Return ONLY the enhanced text prompt, nothing else - no explanations, no additional text, just the enhanced prompt.\n\nOriginal prompt: ${prompt}\n\nEnhanced prompt:`
              }
            ]
          },
          {
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': CLAUDE_API_KEY,
              'anthropic-version': '2023-06-01'
            }
          }
        );
        // If successful, break out of the loop
        break;
      } catch (error) {
        lastError = error;
        // If it's not a model not found error, throw immediately
        if (error.response?.data?.error?.type !== 'not_found_error') {
          throw error;
        }
        // Otherwise, try the next model
        continue;
      }
    }

    // If all models failed, throw the last error
    if (!enhanceResponse) {
      throw lastError;
    }

    const enhancedPrompt = enhanceResponse.data.content[0].text.trim();

    if (!enhancedPrompt) {
      return res.status(500).json({ error: 'No enhanced prompt received from Claude API' });
    }

    return res.json({
      success: true,
      enhanced_prompt: enhancedPrompt
    });

  } catch (error) {
    console.error('Enhance prompt error:', error.response?.data || error.message);
    
    // Provide more helpful error messages
    let errorMessage = 'Failed to enhance prompt';
    if (error.response?.data?.error) {
      if (error.response.data.error.type === 'not_found_error') {
        errorMessage = 'Claude API model not found. Please check your API key and available models.';
      } else {
        errorMessage = error.response.data.error.message || errorMessage;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    return res.status(500).json({
      error: errorMessage
    });
  }
});

// Image generation endpoint using FLUX.2 Klein
// FLUX.2 Klein is optimized for:
// - Real-time/interactive generation (sub-second inference)
// - Rapid iteration and high-volume workflows
// - Cost-effective bulk generation
// - Multi-reference image support (up to 4 images) - not currently implemented in UI
// - Image editing capabilities - not currently implemented in UI
// Reference: https://docs.bfl.ml/flux_2/flux2_text_to_image
app.post('/api/generate', async (req, res) => {
  try {
    // Extract parameters with defaults matching BFL API specification
    // Supports both text-to-image and image editing (when input_image is provided)
    const { prompt, width = 1024, height = 1024, output_format = 'jpeg', seed, safety_tolerance, input_image } = req.body;

    console.log('Received generation request:', { prompt, width, height, output_format, seed, safety_tolerance });

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!BFL_API_KEY) {
      console.error('BFL API key not configured');
      return res.status(500).json({ error: 'BFL API key not configured' });
    }

    // Validate dimensions according to FLUX.2 Klein requirements
    // For image editing: width/height are optional (defaults to input image size)
    // For text-to-image: width/height are required
    const minDimension = 64; // Minimum is 64x64 pixels
    const maxMegapixels = 4; // Maximum is 4 megapixels
    const maxDimension = 2048; // Example: 2048x2048 = 4.19MP (within 4MP limit)
    
    if (input_image) {
      // Image editing mode - width/height are optional
      // Only validate if explicitly provided
      if (width !== 1024 || height !== 1024) {
        if (width % 16 !== 0 || height % 16 !== 0) {
          return res.status(400).json({ 
            error: `Width and height must be multiples of 16. Received: ${width}x${height}` 
          });
        }
        
        if (width < minDimension || height < minDimension) {
          return res.status(400).json({ 
            error: `Width and height must be at least ${minDimension} pixels. Received: ${width}x${height}` 
          });
        }
        
        const totalMegapixels = (width * height) / 1000000;
        if (totalMegapixels > maxMegapixels) {
          return res.status(400).json({ 
            error: `Total resolution cannot exceed ${maxMegapixels} megapixels. Current: ${totalMegapixels.toFixed(2)}MP (${width}x${height})` 
          });
        }
      }
    } else {
      // Text-to-image mode - width/height are required
      if (width % 16 !== 0 || height % 16 !== 0) {
        return res.status(400).json({ 
          error: `Width and height must be multiples of 16. Received: ${width}x${height}` 
        });
      }

      if (width < minDimension || height < minDimension) {
        return res.status(400).json({ 
          error: `Width and height must be at least ${minDimension} pixels. Received: ${width}x${height}` 
        });
      }

      // Check total megapixels (more accurate than just checking individual dimensions)
      const totalMegapixels = (width * height) / 1000000;
      if (totalMegapixels > maxMegapixels) {
        return res.status(400).json({ 
          error: `Total resolution cannot exceed ${maxMegapixels} megapixels. Current: ${totalMegapixels.toFixed(2)}MP (${width}x${height})` 
        });
      }
      
      // Also check individual dimensions don't exceed practical limits
      if (width > maxDimension || height > maxDimension) {
        return res.status(400).json({ 
          error: `Width and height cannot exceed ${maxDimension} pixels. Received: ${width}x${height}` 
        });
      }
    }

    // Validate output_format
    if (output_format && !['jpeg', 'png'].includes(output_format)) {
      return res.status(400).json({ 
        error: `output_format must be 'jpeg' or 'png'. Received: ${output_format}` 
      });
    }

    // Validate safety_tolerance if provided (0-5)
    if (safety_tolerance !== undefined) {
      if (!Number.isInteger(safety_tolerance) || safety_tolerance < 0 || safety_tolerance > 5) {
        return res.status(400).json({ 
          error: 'safety_tolerance must be an integer between 0 (strict) and 5 (permissive)' 
        });
      }
    }

    // Build request body with only provided optional parameters
    const requestBody = {
      prompt,
      output_format
    };

    // For image editing, input_image is required and width/height are optional (defaults to input image size)
    // For text-to-image, width and height are required
    if (input_image) {
      // Image editing mode - include input_image
      requestBody.input_image = input_image;
      // Width and height are optional for editing
      // Only include if user explicitly wants different dimensions than input image
      // If omitted, API will use input image dimensions automatically
      // For now, we'll include them if they differ from default, but ideally we'd track if user changed them
      // Note: In a full implementation, we'd track whether user explicitly set dimensions vs using defaults
    } else {
      // Text-to-image mode - width and height are required
      requestBody.width = width;
      requestBody.height = height;
    }

    // Add optional parameters if provided
    if (seed !== undefined && seed !== null) {
      requestBody.seed = seed;
    }
    if (safety_tolerance !== undefined) {
      requestBody.safety_tolerance = safety_tolerance;
    }

    const isEditing = !!input_image;
    console.log('Sending request to BFL API:', `${BFL_API_BASE}/flux-2-klein-4b`);
    console.log(`Mode: ${isEditing ? 'Image Editing' : 'Text-to-Image'}`);
    if (isEditing) {
      console.log('Input image provided for editing');
    } else {
      console.log(`Resolution: ${width}x${height} (${((width * height) / 1000000).toFixed(2)} MP)`);
    }
    const requestStartTime = Date.now();

    // Submit generation request to BFL API
    // Reference: https://docs.bfl.ml/flux_2/flux2_text_to_image
    const generateResponse = await axios.post(
      `${BFL_API_BASE}/flux-2-klein-4b`,
      requestBody,
      {
        headers: {
          'accept': 'application/json',
          'x-key': BFL_API_KEY,
          'Content-Type': 'application/json'
        },
        validateStatus: function (status) {
          // Don't throw on 4xx/5xx, handle them explicitly
          return status < 600;
        }
      }
    );

    // Handle API errors from initial request
    if (generateResponse.status >= 400) {
      const errorData = generateResponse.data;
      console.error('BFL API error response:', errorData);
      
      // Handle rate limiting (429)
      if (generateResponse.status === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Maximum 24 active tasks allowed. Please wait and try again.',
          retry_after: errorData.retry_after || 60
        });
      }
      
      return res.status(generateResponse.status).json({
        error: errorData?.error || errorData?.message || 'BFL API request failed',
        details: errorData
      });
    }

    console.log('BFL API response status:', generateResponse.status);
    console.log('BFL API response data:', JSON.stringify(generateResponse.data, null, 2));

    // FLUX.2 API returns 'id' (not 'request_id') and 'polling_url'
    const { id, request_id, polling_url, cost, input_mp, output_mp } = generateResponse.data;
    const taskId = id || request_id; // Support both for compatibility
    
    // Log cost information for Klein (useful for tracking)
    if (cost !== undefined) {
      console.log(`Task cost: ${cost} credits, Input: ${input_mp} MP, Output: ${output_mp} MP`);
    }

    if (!polling_url) {
      console.error('No polling URL received from BFL API');
      return res.status(500).json({ error: 'No polling URL received from API' });
    }

    console.log('Polling URL received:', polling_url);
    console.log('Task ID:', taskId);

    // Poll for the result
    // FLUX.2 Klein Performance Notes:
    // - Typical generation: <1 second (per BFL documentation)
    // - Uses fixed 4 inference steps (distilled model for speed)
    // - Optimized for speed and real-time applications
    // - Supports up to 4 reference images (not currently implemented)
    // - Queue times: Tasks can sit in "Pending" for 10-60+ seconds during high load
    // - Using 0.5 second polling interval for faster response
    let attempts = 0;
    const maxAttempts = 120; // 1 minute max (0.5s * 120 = 60s) - Klein is much faster
    const pollInterval = 500; // 0.5 second between polls for faster response
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, pollInterval));

      try {
        const pollResponse = await axios.get(polling_url, {
          headers: {
            'accept': 'application/json',
            'x-key': BFL_API_KEY
          },
          validateStatus: function (status) {
            // Don't throw on 4xx/5xx, handle them explicitly
            return status < 600;
          }
        });
        
        // Handle HTTP errors from polling
        if (pollResponse.status >= 400 && pollResponse.status < 500) {
          // Client errors - might be invalid polling URL or task not found
          console.error('Polling error:', pollResponse.status, pollResponse.data);
          // Continue polling in case it's temporary
        }

        const { status, result, error } = pollResponse.data;
        
        // Log status with timing information
        const elapsedSeconds = Math.floor(attempts * pollInterval / 1000);
        if (attempts % 5 === 0 || status === 'Ready' || status === 'Error' || status === 'Failed' || status === 'Processing') {
          console.log(`[${elapsedSeconds}s] Polling attempt ${attempts + 1}/${maxAttempts}... Status: ${status}`);
          
          // Warn if stuck in Pending for too long (likely BFL queue issue)
          if (status === 'Pending' && elapsedSeconds > 30) {
            console.warn(`Task has been in 'Pending' status for ${elapsedSeconds} seconds. This may indicate high queue times on BFL's servers.`);
          }
        }

        if (status === 'Ready') {
          const totalTime = ((Date.now() - requestStartTime) / 1000).toFixed(1);
          console.log(`✓ Image generation completed successfully in ${totalTime} seconds (FLUX.2 Klein)`);
          // FLUX.2 API returns the image URL in result.sample
          const imageUrl = result?.sample || result?.image_url || result?.url;
          if (!imageUrl) {
            console.error('No image URL in result:', result);
            return res.status(500).json({
              error: 'Image generated but no URL found in response',
              task_id: taskId
            });
          }
          // Note: Signed URLs from BFL API expire after ~10 minutes
          // The frontend should download/display the image promptly
          return res.json({
            success: true,
            image_url: imageUrl,
            task_id: taskId,
            request_id: taskId, // Keep for backward compatibility
            expires_in: 600 // Signed URL expires in ~10 minutes (600 seconds)
          });
        } else if (status === 'Error' || status === 'Failed') {
          console.error('Image generation failed:', error);
          return res.status(500).json({
            error: error || 'Image generation failed',
            task_id: taskId,
            request_id: taskId // Keep for backward compatibility
          });
        }
        // Continue polling for 'Pending' or 'Processing' status
        // These are valid intermediate states
      } catch (pollError) {
        // Log errors but continue polling (network issues might be temporary)
        const elapsedSeconds = Math.floor(attempts * pollInterval / 1000);
        if (attempts % 10 === 0) { // Log every 10 seconds to reduce noise
          console.error(`[${elapsedSeconds}s] Polling error:`, pollError.message);
        }
        // Continue polling on network errors
      }

      attempts++;
    }

    // Timeout after max attempts
    const totalSeconds = Math.floor(maxAttempts * pollInterval / 1000);
    console.error(`Image generation timed out after ${totalSeconds} seconds (${maxAttempts} polling attempts)`);
    console.error(`Task ID: ${taskId}`);
    console.error(`Polling URL: ${polling_url}`);
    console.error('This could indicate:');
    console.error('  1. High queue times on BFL servers (task stuck in "Pending")');
    console.error('  2. Very high resolution image taking longer than expected');
    console.error('  3. Network issues preventing status updates');
    return res.status(504).json({
      error: `Image generation timed out after ${totalSeconds} seconds. The task may still be processing on BFL's servers.`,
      task_id: taskId,
      request_id: taskId, // Keep for backward compatibility
      polling_url: polling_url, // Return polling URL so user can check manually
      note: 'You can check the task status directly using the polling_url. Typical FLUX.2 Klein generation takes <1 second, but queue times can vary.'
    });

  } catch (error) {
    console.error('Generation error:', error.response?.data || error.message);
    console.error('Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    
    // Handle network/timeout errors
    if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
      return res.status(504).json({
        error: 'Request to BFL API timed out. Please try again.',
        details: error.message
      });
    }
    
    // Handle axios errors
    if (error.response) {
      const status = error.response.status;
      const errorData = error.response.data;
      
      // Handle rate limiting
      if (status === 429) {
        return res.status(429).json({
          error: 'Rate limit exceeded. Maximum 24 active tasks allowed.',
          retry_after: errorData?.retry_after || 60
        });
      }
      
      return res.status(status).json({
        error: errorData?.error || errorData?.message || 'BFL API error',
        details: errorData
      });
    }
    
    return res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});

// Serve the frontend
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  if (!BFL_API_KEY) {
    console.warn('Warning: BFL_API_KEY not found in environment variables');
  }
});

