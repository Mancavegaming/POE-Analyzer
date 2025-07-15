// --- DOM Elements ---
const pobUrlInput = document.getElementById('pob-url');
const importButton = document.getElementById('import-button');
const importStatus = document.getElementById('import-status');
const analysisSection = document.getElementById('analysis-section');

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

// Store fetched build data globally
let currentBuildData = null;

// --- Event Listeners ---
importButton.addEventListener('click', handleImport);
analyzeButton.addEventListener('click', handleAnalysis);

/**
 * Step 1: Handles fetching and parsing the POB URL.
 */
async function handleImport() {
    const pobUrl = pobUrlInput.value.trim();
    if (!pobUrl) {
        alert("Please enter a POB URL.");
        return;
    }

    setImportLoadingState(true);
    analysisSection.classList.add('hidden');
    currentBuildData = null;
    
    try {
        const response = await fetch(`/api/pob?url=${encodeURIComponent(pobUrl)}`);
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }
        
        currentBuildData = await response.json();
        
        if (currentBuildData && currentBuildData.skills) {
            populateSkillSelectors(currentBuildData.skills);
            analysisSection.classList.remove('hidden');
            importStatus.textContent = "Build imported successfully!";
            importStatus.classList.remove('text-red-400');
            importStatus.classList.add('text-green-400');
        } else {
            throw new Error("Could not find skill data in the response.");
        }

    } catch (error) {
        console.error("Error fetching POB data:", error);
        importStatus.textContent = `Error: ${error.message}`;
        importStatus.classList.add('text-red-400');
        importStatus.classList.remove('text-green-400');
        currentBuildData = null;
    } finally {
        setImportLoadingState(false);
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
 * Step 2: Handles the final analysis using the stored build data.
 */
async function handleAnalysis() {
    const userQuestion = userQuestionInput.value.trim();
    const primarySkill = primarySkillSelect.value;
    const secondarySkill = secondarySkillSelect.value;

    if (!currentBuildData) {
        alert("Please import a build first.");
        return;
    }
     if (!userQuestion) {
        alert("Please enter a question about the build.");
        return;
    }
    
    setAnalyzeLoadingState(true);
    resultOutput.innerHTML = '';
    placeholder.style.display = 'none';

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
        setAnalyzeLoadingState(false);
    }
}

function setImportLoadingState(isLoading) {
    importButton.disabled = isLoading;
    importButton.textContent = isLoading ? 'Importing...' : 'Import';
}

function setAnalyzeLoadingState(isLoading) {
    analyzeButton.disabled = isLoading;
    buttonText.style.display = isLoading ? 'none' : 'inline';
    buttonSpinner.style.display = isLoading ? 'inline' : 'none';
}

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
