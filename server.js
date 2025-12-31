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
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
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

// Image generation endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, width = 1024, height = 1024, output_format = 'jpeg' } = req.body;

    console.log('Received generation request:', { prompt, width, height, output_format });

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!BFL_API_KEY) {
      console.error('BFL API key not configured');
      return res.status(500).json({ error: 'BFL API key not configured' });
    }

    console.log('Sending request to BFL API:', `${BFL_API_BASE}/flux-pro-1.1`);

    // Submit generation request to BFL API
    const generateResponse = await axios.post(
      `${BFL_API_BASE}/flux-pro-1.1`,
      {
        prompt,
        width,
        height,
        output_format
      },
      {
        headers: {
          'accept': 'application/json',
          'x-key': BFL_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('BFL API response status:', generateResponse.status);
    console.log('BFL API response data:', JSON.stringify(generateResponse.data, null, 2));

    const { request_id, polling_url } = generateResponse.data;

    if (!polling_url) {
      console.error('No polling URL received from BFL API');
      return res.status(500).json({ error: 'No polling URL received from API' });
    }

    console.log('Polling URL received:', polling_url);
    console.log('Request ID:', request_id);

    // Poll for the result
    let attempts = 0;
    const maxAttempts = 120; // 60 seconds max (0.5s * 120)
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 0.5 seconds

      try {
        console.log(`Polling attempt ${attempts + 1}/${maxAttempts}...`);
        const pollResponse = await axios.get(polling_url, {
          headers: {
            'accept': 'application/json',
            'x-key': BFL_API_KEY
          }
        });

        const { status, result, error } = pollResponse.data;
        console.log('Poll response status:', status);

        if (status === 'Ready') {
          return res.json({
            success: true,
            image_url: result.sample || result.image_url || result.url,
            request_id
          });
        } else if (status === 'Error' || status === 'Failed') {
          return res.status(500).json({
            error: error || 'Image generation failed',
            request_id
          });
        }
        // If status is 'Processing' or similar, continue polling
      } catch (pollError) {
        console.error('Polling error:', pollError.message);
        // Continue polling on network errors
      }

      attempts++;
    }

    // Timeout
    return res.status(504).json({
      error: 'Image generation timed out',
      request_id
    });

  } catch (error) {
    console.error('Generation error:', error.response?.data || error.message);
    console.error('Error details:', {
      message: error.message,
      status: error.response?.status,
      statusText: error.response?.statusText,
      data: error.response?.data
    });
    return res.status(500).json({
      error: error.response?.data?.error || error.message || 'Internal server error'
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
  if (!CLAUDE_API_KEY) {
    console.warn('Warning: CLAUDE_API_KEY not found in environment variables (prompt enhancement will be disabled)');
  }
});

