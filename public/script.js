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
const skillSelectionContainer = document.getElementById('skill-selection-container');
const primarySkillSelect = document.getElementById('primary-skill-select');
const secondarySkillSelect = document.getElementById('secondary-skill-select');

// --- Event Listeners ---
analyzeButton.addEventListener('click', handleAnalysis);

/**
 * Populates the skill selection dropdowns from the fetched item data.
 */
function populateSkillSelectors(items) {
    primarySkillSelect.innerHTML = '';
    secondarySkillSelect.innerHTML = '';
    secondarySkillSelect.add(new Option("None (Optional)", "None")); // Add a "None" option

    const allGems = [];
    items.forEach(item => {
        if (item.gems) {
            item.gems.forEach(gem => {
                // We only care about active skills, not supports
                if (!gem.name.includes('Support')) {
                    allGems.push(gem);
                }
            });
        }
    });

    if (allGems.length === 0) {
        primarySkillSelect.innerHTML = '<option>No active skills found</option>';
        secondarySkillSelect.innerHTML = '<option>None</option>';
        return;
    }

    allGems.forEach(gem => {
        const optionText = `${gem.name} (Lvl ${gem.level})`;
        primarySkillSelect.add(new Option(optionText, gem.name));
        secondarySkillSelect.add(new Option(optionText, gem.name));
    });
}


/**
 * Main function to handle the final analysis.
 */
async function handleAnalysis() {
    const accountName = accountNameInput.value.trim();
    const characterName = characterNameInput.value.trim();
    const userQuestion = userQuestionInput.value.trim();

    if (!accountName || !characterName) {
        alert("Please enter an Account and Character name first.");
        return;
    }
     if (!userQuestion) {
        alert("Please enter a question about the build.");
        return;
    }
    
    setLoadingState(true);
    resultOutput.innerHTML = '';
    placeholder.classList.add('hidden');
    skillSelectionContainer.classList.remove('hidden');
    primarySkillSelect.innerHTML = '<option>Fetching skills...</option>';
    secondarySkillSelect.innerHTML = '<option>Fetching skills...</option>';

    try {
        // Step 1: Fetch the character data directly when the button is clicked.
        const response = await fetch(`/api/analyze?accountName=${encodeURIComponent(accountName)}&characterName=${encodeURIComponent(characterName)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }
        
        const buildData = await response.json();
        
        if (buildData && buildData.items) {
            // Step 2: Populate the skill selectors with the fresh data.
            populateSkillSelectors(buildData.items);
        } else {
            throw new Error("Could not find item data in the response.");
        }

        // Now that skills are populated, get the selected values.
        const primarySkill = primarySkillSelect.value;
        const secondarySkill = secondarySkillSelect.value;

        // Step 3: Call the Gemini API with all the necessary data.
        const analysisResponse = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                buildData: buildData, 
                userQuestion,
                primarySkill,
                secondarySkill
            }),
        });

        if (!analysisResponse.ok) {
            const errorData = await analysisResponse.json();
            throw new Error(errorData.error || `Request failed with status ${analysisResponse.status}`);
        }

        const analysisResult = await analysisResponse.json();
        resultOutput.innerHTML = formatResponse(analysisResult.text);

    } catch (error) {
        console.error("Analysis Error:", error);
        resultOutput.innerHTML = `<p class="text-red-400"><strong>Error:</strong> ${error.message}</p>`;
        skillSelectionContainer.classList.add('hidden'); // Hide dropdowns on error
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
