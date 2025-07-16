// Version 2 - Forcing a fresh build to load environment variables.
// This single serverless function handles both fetching data and calling Gemini.
// It differentiates based on the request method (GET vs POST).

// Helper to fetch data from the official PoE API
async function fetchCharacterData(accountName, characterName) {
    const itemsApiUrl = `https://www.pathofexile.com/character-window/get-items?accountName=${encodeURIComponent(accountName)}&character=${encodeURIComponent(characterName)}`;
    const passivesApiUrl = `https://www.pathofexile.com/character-window/get-passive-skills?accountName=${encodeURIComponent(accountName)}&character=${encodeURIComponent(characterName)}`;

    // This makes the request look like it's from a logged-in user, bypassing the 403 error.
    const poeSessionId = process.env.POESESSID;
    
    // This check confirms if the Vercel environment has the required secret key.
    if (!poeSessionId) {
        throw new Error("CRITICAL CONFIGURATION ERROR: The POESESSID environment variable was not found on the Vercel server. Please double-check that it is set correctly in your Vercel Project Settings and trigger a new deployment.");
    }

    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/109.0.0.0 Safari/537.36',
        'Cookie': `POESESSID=${poeSessionId}`
    };

    // Fetch both endpoints at the same time
    const [itemsResponse, passivesResponse] = await Promise.all([
        fetch(itemsApiUrl, { headers }),
        fetch(passivesApiUrl, { headers })
    ]);

    if (!itemsResponse.ok) {
        if (itemsResponse.status === 404) {
            throw new Error("Character not found. Check spelling or make sure your profile is public.");
        }
        if (itemsResponse.status === 403) {
            throw new Error("PoE API request was forbidden. Your POESESSID may be invalid or expired.");
        }
        throw new Error(`PoE API request for items failed (status: ${itemsResponse.status})`);
    }
    const itemsData = await itemsResponse.json();

    let passiveTreeData = { hashes: [], jewels: [] };
    if (passivesResponse.ok) {
        const passivesData = await passivesResponse.json();
        passiveTreeData.hashes = passivesData.hashes || [];
        passiveTreeData.jewels = (passivesData.items || []).map(jewel => ({
            name: jewel.name, type: jewel.typeLine, explicitMods: jewel.explicitMods
        }));
    }

    const character = itemsData.character;
    const items = itemsData.items.map(item => ({
        name: item.name, type: item.typeLine, inventoryId: item.inventoryId,
        sockets: item.sockets ? item.sockets.map(socket => ({ group: socket.group, color: socket.sColour })) : [],
        gems: item.socketedItems ? item.socketedItems.map(gem => ({
            name: gem.typeLine,
            level: gem.properties?.find(p => p.name === "Level")?.values[0][0] || 'N/A',
            quality: gem.properties?.find(p => p.name === "Quality")?.values[0][0] || '0'
        })) : []
    }));

    return {
        character: { name: character.name, class: character.class, level: character.level },
        items: items,
        passive_tree: passiveTreeData
    };
}

// Helper to call the Gemini API
async function callGeminiApi(prompt) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY environment variable not set.");
    
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Gemini API request failed`);
    }

    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
}

// Main handler for the serverless function
export default async function handler(req, res) {
    // A GET request is for importing a build
    if (req.method === 'GET') {
        try {
            const { accountName, characterName } = req.query;
            const buildData = await fetchCharacterData(accountName, characterName);
            return res.status(200).json(buildData);
        } catch (error) {
            console.error("Server-side GET error:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    // A POST request is for analyzing a build
    if (req.method === 'POST') {
        try {
            const { buildData, userQuestion, primarySkill, secondarySkill } = req.body;

            const prompt = `
                You are a world-class expert on the video game Path of Exile (PoE). 
                Your task is to analyze a player's build data and answer their question.
                The data includes the character's class, level, items, gems, and passive tree.

                Here is the player's build data:
                \`\`\`json
                ${JSON.stringify(buildData, null, 2)}
                \`\`\`
                
                The user has identified their Primary Damage Skill as: "${primarySkill}".
                ${secondarySkill && secondarySkill !== 'None' ? `They are also interested in a Secondary Skill: "${secondarySkill}".` : ''}

                Here is the player's question:
                "${userQuestion}"

                Please provide a detailed analysis and answer. Look at the entire build: tree, gear, auras, flasks, etc. If the user asks about DPS, use your extensive knowledge of the game to provide a reasonable estimate based on the provided gems, links, gear, and passive tree.
            `;

            const analysisText = await callGeminiApi(prompt);
            return res.status(200).json({ text: analysisText });

        } catch (error) {
            console.error("Server-side POST error:", error);
            return res.status(500).json({ error: error.message });
        }
    }

    // Handle any other methods
    return res.status(405).json({ error: 'Method Not Allowed' });
}
