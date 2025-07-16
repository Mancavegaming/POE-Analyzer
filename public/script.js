// --- DOM Elements ---
const accountNameInput = document.getElementById('account-name');
const characterNameInput = document.getElementById('character-name');
const importButton = document.getElementById('import-button');
const importButtonText = document.getElementById('import-button-text');
const importButtonSpinner = document.getElementById('import-button-spinner');
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
 * Step 1: Handles fetching character data from our serverless function.
 */
async function handleImport() {
    const accountName = accountNameInput.value.trim();
    const characterName = characterNameInput.value.trim();

    if (!accountName || !characterName) {
        alert("Please provide both an Account Name and a Character Name.");
        return;
    }

    setImportLoadingState(true);
    analysisSection.classList.add('hidden');
    resultOutput.innerHTML = '';
    placeholder.style.display = 'block';
    currentBuildData = null;

    try {
        // This is a GET request to our serverless function
        const response = await fetch(`/api/analyze?accountName=${encodeURIComponent(accountName)}&characterName=${encodeURIComponent(characterName)}`);

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: 'The server returned an unreadable error.' }));
            throw new Error(errorData.error || `Request failed with status ${response.status}`);
        }

        currentBuildData = await response.json();
        
        if (currentBuildData && currentBuildData.character) {
            populateSkillSelectors(currentBuildData.items);
            analysisSection.classList.remove('hidden');
            importStatus.textContent = `Successfully imported '${currentBuildData.character.name}' (Level ${currentBuildData.character.level} ${currentBuildData.character.class}).`;
            importStatus.classList.remove('text-red-400');
            importStatus.classList.add('text-green-400');
        } else {
            throw new Error("Received invalid data from the server.");
        }

    } catch (error) {
        console.error("Import Error:", error);
        importStatus.textContent = `Error: ${error.message}`;
        importStatus.classList.add('text-red-400');
        importStatus.classList.remove('text-green-400');
        currentBuildData = null;
    } finally {
        setImportLoadingState(false);
    }
}

/**
 * Populates the skill selection dropdowns from the character's items.
 */
function populateSkillSelectors(items) {
    primarySkillSelect.innerHTML = '';
    secondarySkillSelect.innerHTML = '';
    secondarySkillSelect.add(new Option("None (Optional)", "None"));

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

    // A simple guess for the main skill (often in body armour or a 6-link)
    const mainItem = items.find(item => item.inventoryId === "BodyArmour") || items.find(item => item.sockets.length === 6);
    if (mainItem && mainItem.gems) {
        const mainSkill = mainItem.gems.find(gem => !gem.name.includes('Support'));
        if (mainSkill) {
            primarySkillSelect.value = mainSkill.name;
        }
    }
}


/**
 * Step 2: Handles sending the imported data and question to Gemini for analysis.
 */
async function handleAnalysis() {
    const userQuestion = userQuestionInput.value.trim();
    const primarySkill = primarySkillSelect.value;
    const secondarySkill = secondarySkillSelect.value;

    if (!currentBuildData) {
        alert("Please import a character first.");
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
        // This is a POST request to our serverless function
        const response = await fetch('/api/analyze', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                buildData: currentBuildData,
                userQuestion: userQuestion,
                primarySkill: primarySkill,
                secondarySkill: secondarySkill
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
    importButtonText.style.display = isLoading ? 'none' : 'inline';
    importButtonSpinner.style.display = isLoading ? 'inline' : 'none';
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
