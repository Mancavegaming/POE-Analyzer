// --- DOM Elements ---
const pobUrlInput = document.getElementById('pob-url');
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
pobUrlInput.addEventListener('change', handlePobUrlChange);


/**
 * Handles fetching and parsing the POB URL.
 */
async function handlePobUrlChange() {
    const pobUrl = pobUrlInput.value.trim();
    if (!pobUrl) {
        skillSelectionContainer.classList.add('hidden');
        return;
    }

    setLoadingState(true, 'Parsing...');
    skillSelectionContainer.classList.remove('hidden');
    primarySkillSelect.innerHTML = '<option>Parsing POB...</option>';
    secondarySkillSelect.innerHTML = '<option>Parsing POB...</option>';
    
    try {
        const response = await fetch(`/api/pob?url=${encodeURIComponent(pobUrl)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }
        
        currentBuildData = await response.json();
        
        if (currentBuildData && currentBuildData.skills) {
            populateSkillSelectors(currentBuildData.skills);
        } else {
            throw new Error("Could not find skill data in the response.");
        }

    } catch (error) {
        console.error("Error fetching POB data:", error);
        primarySkillSelect.innerHTML = `<option>Error parsing POB</option>`;
        secondarySkillSelect.innerHTML = `<option>Please try again</option>`;
        currentBuildData = null; // Clear data on error
    } finally {
        setLoadingState(false);
    }
}


/**
 * Populates the skill selection dropdowns from the parsed build data.
 */
function populateSkillSelectors(skills) {
    primarySkillSelect.innerHTML = '';
    secondarySkillSelect.innerHTML = '';
    secondarySkillSelect.add(new Option("None (Optional)", "None"));

    const activeSkills = skills.filter(skill => skill.isEnabled && !skill.mainSkillId.includes('Support'));

    if (activeSkills.length === 0) {
        primarySkillSelect.innerHTML = '<option>No active skills found</option>';
        secondarySkillSelect.innerHTML = '<option>None</option>';
        return;
    }

    activeSkills.forEach(skill => {
        const optionText = `${skill.mainSkillId} (Lvl ${skill.level} in ${skill.slot})`;
        primarySkillSelect.add(new Option(optionText, skill.mainSkillId));
        secondarySkillSelect.add(new Option(optionText, skill.mainSkillId));
    });

    const mainSkillGuess = activeSkills.find(s => s.slot === "Body Armour" || s.slot === "Weapon 1");
    if (mainSkillGuess) {
        primarySkillSelect.value = mainSkillGuess.mainSkillId;
    }
}

/**
 * Main function to handle the final analysis.
 */
async function handleAnalysis() {
    const userQuestion = userQuestionInput.value.trim();
    const primarySkill = primarySkillSelect.value;
    const secondarySkill = secondarySkillSelect.value;

    if (!currentBuildData) {
        alert("Please enter a valid POB URL first.");
        return;
    }
     if (!userQuestion) {
        alert("Please enter a question about the build.");
        return;
    }
    
    setLoadingState(true, 'Analyzing...');

    try {
        const response = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
function setLoadingState(isLoading, text = 'Analyzing...') {
    analyzeButton.disabled = isLoading;
    if (isLoading) {
        buttonText.classList.add('hidden');
        buttonSpinner.classList.remove('hidden');
        buttonSpinner.innerHTML = `<svg class="animate-spin -ml-1 mr-3 h-5 w-5 inline-block" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg> ${text}`;
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
