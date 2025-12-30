# Image Generation Site - BlackForest Labs API

A web application that generates images using the BlackForest Labs FLUX API based on user prompts.

## Features

- Generate images from text prompts
- Customizable image dimensions (512x512 to 1280x1280)
- Download generated images
- Modern, responsive UI
- Real-time generation status

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- BlackForest Labs API key

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create a `.env` file in the root directory:**
   ```bash
   BFL_API_KEY=your_bfl_api_key_here
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

## How It Works

1. User enters a prompt and selects image dimensions/format
2. Frontend sends request to backend `/api/generate` endpoint
3. Backend submits request to BlackForest Labs API (`flux-pro-1.1` model)
4. Backend polls the API until image is ready
5. Generated image URL is returned to frontend
6. Image is displayed and can be downloaded

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
│   └── script.js     # Frontend JavaScript
└── README.md         # This file
```

## Notes

- The API uses asynchronous processing, so the backend polls for results
- Maximum polling time is 60 seconds (120 attempts × 0.5s)
- Make sure your BFL API key is kept secure and never committed to version control

## Troubleshooting

- **"BFL API key not configured"**: Make sure you've created a `.env` file with your `BFL_API_KEY`
- **Generation timeout**: The image generation may take longer than expected. Try again or check your API quota
- **CORS errors**: The server includes CORS middleware, but if issues persist, check your API key permissions

