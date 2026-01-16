// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt');
    const widthSelect = document.getElementById('width');
    const heightSelect = document.getElementById('height');
    const formatSelect = document.getElementById('format');
    const generateBtn = document.getElementById('generateBtn');
    const errorMessage = document.getElementById('errorMessage');
    const resultSection = document.getElementById('resultSection');
    const generatedImage = document.getElementById('generatedImage');
    const downloadLink = document.getElementById('downloadLink');
    
    // Image upload elements
    const inputImageFile = document.getElementById('inputImage');
    const uploadImageBtn = document.getElementById('uploadImageBtn');
    const removeImageBtn = document.getElementById('removeImageBtn');
    const imageFileName = document.getElementById('imageFileName');
    const imagePreview = document.getElementById('imagePreview');
    const previewImage = document.getElementById('previewImage');
    const editImageBtn = document.getElementById('editImageBtn');
    
    let selectedImageBase64 = null;
    let currentGeneratedImageUrl = null; // Store the current generated image URL
    
    if (!generateBtn) {
        console.error('Generate button not found!');
        return;
    }
    
    // Debug: Check if edit button exists
    if (!editImageBtn) {
        console.warn('Edit button not found in DOM');
    } else {
        console.log('Edit button found:', editImageBtn);
    }
    
    const btnText = generateBtn.querySelector('.btn-text');
    const btnLoader = generateBtn.querySelector('.btn-loader');

    console.log('Setting up generate button handler');
    generateBtn.addEventListener('click', handleGenerate);

    async function handleGenerate() {
        console.log('Generate button clicked!');
        // Get the prompt from the input
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
            console.log('Sending request to /api/generate with prompt:', prompt);
            
            // Build request body
            const requestBody = {
                prompt: prompt,
                output_format: formatSelect.value
            };
            
            // Add input_image if user uploaded one (for image editing)
            if (selectedImageBase64) {
                // Check if it's a URL (starts with __URL__) or base64
                if (selectedImageBase64.startsWith('__URL__')) {
                    // Extract the actual URL - BFL API supports URLs directly
                    const imageUrl = selectedImageBase64.replace('__URL__', '');
                    requestBody.input_image = imageUrl;
                    console.log('Including input image URL for editing:', imageUrl);
                } else {
                    // It's base64 (from file upload)
                    requestBody.input_image = selectedImageBase64;
                    console.log('Including input image (base64) for editing');
                }
                // For image editing, width/height are optional (API uses input image dimensions if omitted)
                // Include them if user wants to resize the output
                const selectedWidth = parseInt(widthSelect.value);
                const selectedHeight = parseInt(heightSelect.value);
                requestBody.width = selectedWidth;
                requestBody.height = selectedHeight;
            } else {
                // Text-to-image mode - width and height are required
                requestBody.width = parseInt(widthSelect.value);
                requestBody.height = parseInt(heightSelect.value);
            }
            
            const response = await fetch('/api/generate', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            console.log('Response status:', response.status);
            const data = await response.json();
            console.log('Response data:', data);

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
        console.log('showResult called with URL:', imageUrl);
        generatedImage.src = imageUrl;
        downloadLink.href = imageUrl;
        downloadLink.download = `generated-image-${Date.now()}.${formatSelect.value}`;
        resultSection.style.display = 'block';
        
        // Store the image URL for potential editing
        currentGeneratedImageUrl = imageUrl;
        console.log('Stored image URL for editing:', currentGeneratedImageUrl);
        
        // Ensure edit button is visible and enabled
        if (editImageBtn) {
            editImageBtn.style.display = 'inline-block';
            editImageBtn.disabled = false;
            console.log('Edit button should be visible now');
        }
        
        // Scroll to result
        resultSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
    
    // For editing generated images, we can use the URL directly
    // BFL API supports URLs for input_image, so no conversion needed
    // This avoids CORS issues and is more efficient
    
    // Handle "Edit this Image" button click
    if (editImageBtn) {
        console.log('Edit button found, attaching click handler');
        editImageBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('Edit button clicked!', e);
            console.log('currentGeneratedImageUrl:', currentGeneratedImageUrl);
            
            if (!currentGeneratedImageUrl) {
                console.error('No image URL available to edit');
                showError('No image available to edit');
                return;
            }
            
            try {
                // Show loading state
                editImageBtn.disabled = true;
                editImageBtn.textContent = 'Loading...';
                console.log('Loading image for editing from URL:', currentGeneratedImageUrl);
                
                // BFL API supports URLs directly for input_image, so we don't need to convert
                // Store the URL with a special marker to indicate it's a URL (not base64)
                const imageUrlForEditing = currentGeneratedImageUrl;
                selectedImageBase64 = `__URL__${imageUrlForEditing}`;
                
                // Try to load for preview (may fail due to CORS, but that's okay - API will work)
                // Set preview source - if it fails, we'll still be able to edit via API
                previewImage.src = imageUrlForEditing;
                previewImage.onerror = () => {
                    console.warn('Preview image failed to load (CORS), but API call will still work');
                };
                
                // Update UI to show the image is ready for editing
                imagePreview.style.display = 'block';
                imageFileName.textContent = 'Generated image (ready to edit)';
                removeImageBtn.style.display = 'inline-block';
                uploadImageBtn.textContent = 'Change Image';
                updateGenerateButtonText();
                
                // Clear the prompt (or keep it - user can modify)
                // promptInput.value = '';
                
                // Scroll to top so user can enter new prompt
                window.scrollTo({ top: 0, behavior: 'smooth' });
                promptInput.focus();
                
                // Show a hint
                hideError(); // Clear any errors
                const hint = document.createElement('div');
                hint.className = 'success-message';
                hint.style.cssText = 'background: #D1FAE5; border: 1px solid #10B981; color: #065F46; padding: 12px 16px; border-radius: 6px; margin-top: 12px; font-size: 14px;';
                hint.textContent = '✓ Image loaded! Enter a new prompt describing the changes you want to make, then click "Edit Image".';
                const formGroup = promptInput.closest('.form-group');
                if (formGroup) {
                    // Remove any existing success message
                    const existingHint = formGroup.querySelector('.success-message');
                    if (existingHint) {
                        existingHint.remove();
                    }
                    formGroup.appendChild(hint);
                    setTimeout(() => hint.remove(), 5000);
                }
                
                console.log('Image loaded successfully for editing');
                
            } catch (error) {
                console.error('Error loading image for editing:', error);
                showError(error.message || 'Failed to load image for editing');
            } finally {
                editImageBtn.disabled = false;
                editImageBtn.textContent = 'Edit this Image';
            }
        });
    } else {
        console.error('Edit button not found! Cannot attach click handler.');
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

    // Image upload functionality
    uploadImageBtn.addEventListener('click', () => {
        inputImageFile.click();
    });
    
    inputImageFile.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            if (!file.type.startsWith('image/')) {
                showError('Please select a valid image file');
                return;
            }
            
            // Check file size (max 10MB)
            if (file.size > 10 * 1024 * 1024) {
                showError('Image file size must be less than 10MB');
                return;
            }
            
            const reader = new FileReader();
            reader.onload = (event) => {
                selectedImageBase64 = event.target.result;
                imageFileName.textContent = file.name;
                previewImage.src = selectedImageBase64;
                imagePreview.style.display = 'block';
                removeImageBtn.style.display = 'inline-block';
                uploadImageBtn.textContent = 'Change Image';
                updateGenerateButtonText();
            };
            reader.readAsDataURL(file);
        }
    });
    
    removeImageBtn.addEventListener('click', () => {
        selectedImageBase64 = null;
        inputImageFile.value = '';
        imageFileName.textContent = '';
        imagePreview.style.display = 'none';
        removeImageBtn.style.display = 'none';
        uploadImageBtn.textContent = 'Choose Image';
        updateGenerateButtonText();
    });
    
    // Update button text based on whether image is uploaded
    function updateGenerateButtonText() {
        const btnTextElement = document.getElementById('generateBtnText') || btnText;
        if (btnTextElement) {
            btnTextElement.textContent = selectedImageBase64 ? 'Edit Image' : 'Generate Image';
        }
    }

    // Update deploy button with GitHub repo if available
    const githubBtn = document.getElementById('githubBtn');
    const deployBtn = document.getElementById('deployBtn');
    if (githubBtn && deployBtn) {
        const githubUrl = githubBtn.href;
        // If GitHub URL is set (not the placeholder), update deploy button
        if (githubUrl && !githubUrl.includes('YOUR_USERNAME')) {
            deployBtn.href = `https://render.com/deploy?repo=${encodeURIComponent(githubUrl)}`;
        }
    }
});

