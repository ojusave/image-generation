# Image Generation Site - BlackForest Labs API

A web application that generates images using the BlackForest Labs FLUX API based on user prompts.

## Features

- Generate images from text prompts
- AI-powered prompt enhancement using Claude API
- Customizable image dimensions (512x512 to 1280x1280)
- Download generated images
- Modern, responsive UI
- Real-time generation status

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- BlackForest Labs API key
- Anthropic Claude API key (for prompt enhancement feature)

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file in the root directory:**
   ```bash
   BFL_API_KEY=your_bfl_api_key_here
   CLAUDE_API_KEY=your_claude_api_key_here
   ```

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Open your browser:**
   Navigate to `http://localhost:3000`

## API Endpoints

### POST `/api/generate`

Generates an image based on the provided prompt.

**Request Body:**
```json
{
  "prompt": "A beautiful sunset over mountains, digital art style",
  "width": 1024,
  "height": 1024,
  "output_format": "jpeg"
}
```

**Response:**
```json
{
  "success": true,
  "image_url": "https://...",
  "request_id": "..."
}
```

### POST `/api/enhance-prompt`

Enhances a prompt using Claude API to make it more detailed and optimized for image generation.

**Request Body:**
```json
{
  "prompt": "sunset over mountains"
}
```

**Response:**
```json
{
  "success": true,
  "enhanced_prompt": "A breathtaking sunset over majestic snow-capped mountains, with vibrant orange and pink hues painting the sky, dramatic clouds, digital art style, highly detailed, cinematic lighting"
}
```

## How It Works

1. User enters a prompt and selects image dimensions/format
2. (Optional) User can click the enhance button to improve the prompt using Claude API
3. Frontend sends request to backend `/api/generate` endpoint
4. Backend submits request to BlackForest Labs API (`flux-pro-1.1` model)
5. Backend polls the API until image is ready
6. Generated image URL is returned to frontend
7. Image is displayed and can be downloaded

## Project Structure

```
image-generation/
├── server.js          # Express backend server
├── package.json       # Dependencies and scripts
├── .env              # Environment variables (create this)
├── .gitignore        # Git ignore file
├── public/           # Frontend files
│   ├── index.html    # Main HTML page
│   ├── styles.css    # Styling
│   ├── script.js     # Frontend JavaScript (image generation)
│   └── enhancePrompt.js # Frontend JavaScript (prompt enhancement)
└── README.md         # This file
```

## Notes

- The API uses asynchronous processing, so the backend polls for results
- Maximum polling time is 60 seconds (120 attempts × 0.5s)
- Make sure your API keys (BFL and Claude) are kept secure and never committed to version control
- The enhance prompt feature uses Claude 3.5 Sonnet model for prompt enhancement

## Troubleshooting

- **"BFL API key not configured"**: Make sure you've created a `.env` file with your `BFL_API_KEY`
- **"Claude API key not configured"**: Add `CLAUDE_API_KEY` to your `.env` file (required for prompt enhancement feature)
- **Generation timeout**: The image generation may take longer than expected. Try again or check your API quota
- **Enhance prompt not working**: Verify your Claude API key is valid and has sufficient credits
- **CORS errors**: The server includes CORS middleware, but if issues persist, check your API key permissions

