// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', () => {
    const promptInput = document.getElementById('prompt');
    const enhanceBtn = document.getElementById('enhanceBtn');
    const errorMessage = document.getElementById('errorMessage');
    const enhancedPromptSection = document.getElementById('enhancedPromptSection');
    const enhancedPromptInput = document.getElementById('enhancedPrompt');
    const useEnhancedCheckbox = document.getElementById('useEnhancedPrompt');

    if (!enhanceBtn) {
        console.error('Enhance button not found!');
        return;
    }

    let isEnhancing = false;
    let originalPrompt = '';

    enhanceBtn.addEventListener('click', handleEnhancePrompt);

    // Handle checkbox change - hide section when unchecked
    useEnhancedCheckbox.addEventListener('change', () => {
        if (!useEnhancedCheckbox.checked) {
            // If unchecked, hide the enhanced section
            enhancedPromptSection.style.display = 'none';
        } else {
            // If checked, ensure section is visible
            enhancedPromptSection.style.display = 'block';
        }
    });

    async function handleEnhancePrompt() {
        const currentPrompt = promptInput.value.trim();
        
        if (!currentPrompt) {
            showError('Please enter a prompt to enhance');
            return;
        }

        if (isEnhancing) {
            return; // Prevent multiple simultaneous requests
        }

        // Store the original prompt
        originalPrompt = currentPrompt;

        // Hide previous errors
        hideError();

        // Set loading state
        setEnhancingState(true);

        try {
            const response = await fetch('/api/enhance-prompt', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    prompt: currentPrompt
                })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to enhance prompt');
            }

            if (data.enhanced_prompt) {
                // Show the enhanced prompt section
                enhancedPromptInput.value = data.enhanced_prompt;
                enhancedPromptSection.style.display = 'block';
                useEnhancedCheckbox.checked = false; // Default to not using enhanced
            } else {
                throw new Error('No enhanced prompt received');
            }

        } catch (error) {
            console.error('Enhance error:', error);
            showError(error.message || 'An error occurred while enhancing the prompt');
        } finally {
            setEnhancingState(false);
        }
    }

    function setEnhancingState(isLoading) {
        isEnhancing = isLoading;
        enhanceBtn.disabled = isLoading;
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
    }

    function hideError() {
        errorMessage.style.display = 'none';
    }

    // Export function to get the active prompt (original or enhanced)
    window.getActivePrompt = function() {
        if (useEnhancedCheckbox.checked && enhancedPromptInput.value.trim()) {
            return enhancedPromptInput.value.trim();
        }
        return promptInput.value.trim();
    };
});
