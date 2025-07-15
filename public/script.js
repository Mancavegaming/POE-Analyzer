// --- DOM Elements ---
const accountNameInput = document.getElementById('account-name');
const characterNameInput = document.getElementById('character-name');
const userQuestionInput = document.getElementById('user-question');
const analyzeButton = document.getElementById('analyze-button');
const buttonText = document.getElementById('button-text');
const buttonSpinner = document.getElementById('button-spinner');
const resultContainer = document.getElementById('result-container');
const placeholder = document.getElementById('placeholder');
const resultOutput = document.getElementById('result-output');

// --- Event Listeners ---
analyzeButton.addEventListener('click', handleAnalysis);

/**
 * Main function to handle the final analysis.
 */
async function handleAnalysis() {
    const accountName = accountNameInput.value.trim();
    const characterName = characterNameInput.value.trim();
    const userQuestion = userQuestionInput.value.trim();

    if (!accountName || !characterName || !userQuestion) {
        alert("Please provide an Account Name, Character Name, and a question.");
        return;
    }
    
    setLoadingState(true);
    resultOutput.innerHTML = '';
    placeholder.classList.add('hidden');

    try {
        // This now calls our own serverless function instead of doing the work in the browser
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ accountName, characterName, userQuestion }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        const analysisResult = await response.json();
        resultOutput.innerHTML = formatResponse(analysisResult.text);

    } catch (error) {
        console.error("Analysis Error:", error);
        resultOutput.innerHTML = `<p class="text-red-400"><strong>Error:</strong> ${error.message}</p>`;
    } finally {
        setLoadingState(false);
    }
}

/**
 * Toggles the UI loading state.
 */
function setLoadingState(isLoading) {
    analyzeButton.disabled = isLoading;
    if (isLoading) {
        buttonText.classList.add('hidden');
        buttonSpinner.classList.remove('hidden');
    } else {
        buttonText.classList.remove('hidden');
        buttonSpinner.classList.add('hidden');
    }
}

/**
 * Basic formatter to convert markdown-like text to simple HTML.
 */
function formatResponse(text) {
    let html = text
        .replace(/^### (.*$)/gim, '<h3>$1</h3>')
        .replace(/^## (.*$)/gim, '<h2>$1</h2>')
        .replace(/^# (.*$)/gim, '<h1>$1</h1>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>')
        .replace(/^- (.*$)/gim, '<ul><li>$1</li></ul>')
        .replace(/<\/ul>\s?<ul>/g, '')
        .replace(/\n/g, '<br>');
    return html;
}
