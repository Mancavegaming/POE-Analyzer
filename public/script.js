document.addEventListener('DOMContentLoaded', () => {
    // --- DOM Elements ---
    const pobCodeInput = document.getElementById('pob-code');
    const userQuestionInput = document.getElementById('user-question');
    const analyzeButton = document.getElementById('analyze-button');
    const buttonText = document.getElementById('button-text');
    const buttonSpinner = document.getElementById('button-spinner');
    const resultContainer = document.getElementById('result-container');
    const placeholder = document.getElementById('placeholder');
    const resultOutput = document.getElementById('result-output');
    const treeLinkContainer = document.getElementById('tree-link-container');
    const treeLink = document.getElementById('tree-link');

    // --- Event Listeners ---
    analyzeButton.addEventListener('click', handleAnalysis);

    /**
     * Main function to handle the analysis.
     */
    async function handleAnalysis() {
        const pobCode = pobCodeInput.value.trim();
        const userQuestion = userQuestionInput.value.trim();

        if (!pobCode || !userQuestion) {
            alert("Please provide both a POB Code and a question.");
            return;
        }
        
        setLoadingState(true);
        resultOutput.innerHTML = '';
        placeholder.style.display = 'none';
        treeLinkContainer.classList.add('hidden');

        try {
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pobCode, userQuestion }),
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Request failed with status ${response.status}`);
            }

            const analysisResult = await response.json();
            
            // Display the skill tree link if it exists
            if (analysisResult.buildData && analysisResult.buildData.treeURL) {
                treeLink.href = analysisResult.buildData.treeURL;
                treeLinkContainer.classList.remove('hidden');
            }
            
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
        buttonText.style.display = isLoading ? 'none' : 'inline';
        buttonSpinner.style.display = isLoading ? 'inline' : 'none';
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
});
