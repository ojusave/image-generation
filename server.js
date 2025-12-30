require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const BFL_API_KEY = process.env.BFL_API_KEY;
const BFL_API_BASE = 'https://api.bfl.ai/v1';

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Image generation endpoint
app.post('/api/generate', async (req, res) => {
  try {
    const { prompt, width = 1024, height = 1024, output_format = 'jpeg' } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!BFL_API_KEY) {
      return res.status(500).json({ error: 'BFL API key not configured' });
    }

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

    const { request_id, polling_url } = generateResponse.data;

    if (!polling_url) {
      return res.status(500).json({ error: 'No polling URL received from API' });
    }

    // Poll for the result
    let attempts = 0;
    const maxAttempts = 120; // 60 seconds max (0.5s * 120)
    
    while (attempts < maxAttempts) {
      await new Promise(resolve => setTimeout(resolve, 500)); // Wait 0.5 seconds

      try {
        const pollResponse = await axios.get(polling_url, {
          headers: {
            'accept': 'application/json',
            'x-key': BFL_API_KEY
          }
        });

        const { status, result, error } = pollResponse.data;

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
    console.warn('⚠️  Warning: BFL_API_KEY not found in environment variables');
  }
});

