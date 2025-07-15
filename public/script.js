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

// Store fetched build data globally to avoid re-fetching
let currentBuildData = null;

// --- Event Listeners ---
analyzeButton.addEventListener('click', handleAnalysis);
// Add listeners to fetch data when user types in both fields
accountNameInput.addEventListener('change', fetchAndPopulateSkills);
characterNameInput.addEventListener('change', fetchAndPopulateSkills);


/**
 * Fetches character data and populates skill dropdowns.
 */
async function fetchAndPopulateSkills() {
    const accountName = accountNameInput.value.trim();
    const characterName = characterNameInput.value.trim();

    // Only fetch if both fields have values
    if (!accountName || !characterName) {
        skillSelectionContainer.classList.add('hidden');
        return;
    }

    skillSelectionContainer.classList.remove('hidden');
    primarySkillSelect.innerHTML = '<option>Fetching skills...</option>';
    secondarySkillSelect.innerHTML = '<option>Fetching skills...</option>';
    
    try {
        const response = await fetch(`/api/analyze?accountName=${encodeURIComponent(accountName)}&characterName=${encodeURIComponent(characterName)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }
        
        currentBuildData = await response.json();
        
        if (currentBuildData && currentBuildData.items) {
            populateSkillSelectors(currentBuildData.items);
        } else {
            throw new Error("Could not find item data in the response.");
        }

    } catch (error) {
        console.error("Error fetching character data:", error);
        primarySkillSelect.innerHTML = `<option>Error fetching data</option>`;
        secondarySkillSelect.innerHTML = `<option>Please try again</option>`;
    }
}


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
    const userQuestion = userQuestionInput.value.trim();
    const primarySkill = primarySkillSelect.value;
    const secondarySkill = secondarySkillSelect.value;

    if (!currentBuildData) {
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

    try {
        // We no longer need to fetch here, as the data is already in currentBuildData
        // We just need to call the Gemini part of our API
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                buildData: currentBuildData, 
                userQuestion,
                primarySkill,
                secondarySkill
            }),
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
