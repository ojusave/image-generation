const promptInput = document.getElementById('prompt');
const widthSelect = document.getElementById('width');
const heightSelect = document.getElementById('height');
const formatSelect = document.getElementById('format');
const generateBtn = document.getElementById('generateBtn');
const errorMessage = document.getElementById('errorMessage');
const resultSection = document.getElementById('resultSection');
const generatedImage = document.getElementById('generatedImage');
const downloadLink = document.getElementById('downloadLink');
const btnText = generateBtn.querySelector('.btn-text');
const btnLoader = generateBtn.querySelector('.btn-loader');

generateBtn.addEventListener('click', handleGenerate);

async function handleGenerate() {
    const prompt = promptInput.value.trim();
    
    if (!prompt) {
        showError('Please enter a prompt');
        return;
    }

    // Hide previous results and errors
    hideError();
    hideResult();

    // Show loading state
    setLoading(true);

    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                prompt: prompt,
                width: parseInt(widthSelect.value),
                height: parseInt(heightSelect.value),
                output_format: formatSelect.value
            })
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Failed to generate image');
        }

        if (data.success && data.image_url) {
            showResult(data.image_url);
        } else {
            throw new Error('No image URL received');
        }

    } catch (error) {
        console.error('Error:', error);
        showError(error.message || 'An error occurred while generating the image');
    } finally {
        setLoading(false);
    }
}

function setLoading(isLoading) {
    generateBtn.disabled = isLoading;
    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'flex';
    } else {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    }
}

function showError(message) {
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function hideError() {
    errorMessage.style.display = 'none';
}

function showResult(imageUrl) {
    generatedImage.src = imageUrl;
    downloadLink.href = imageUrl;
    downloadLink.download = `generated-image-${Date.now()}.${formatSelect.value}`;
    resultSection.style.display = 'block';
    
    // Scroll to result
    resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function hideResult() {
    resultSection.style.display = 'none';
}

// Allow Enter key to submit (Ctrl/Cmd + Enter)
promptInput.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        handleGenerate();
    }
});

