// This is our Serverless Function. It runs on Vercel's servers.
// It's responsible for fetching data from the PoE API and calling the Gemini API.

// A helper function to fetch character data from the official GGG API.
async function fetchCharacterData(accountName, characterName) {
    // We don't need a CORS proxy here because this code runs on a server.
    const itemsApiUrl = `https://www.pathofexile.com/character-window/get-items?accountName=${encodeURIComponent(accountName)}&character=${encodeURIComponent(characterName)}`;
    const passivesApiUrl = `https://www.pathofexile.com/character-window/get-passive-skills?accountName=${encodeURIComponent(accountName)}&character=${encodeURIComponent(characterName)}`;

    const [itemsResponse, passivesResponse] = await Promise.all([
        fetch(itemsApiUrl),
        fetch(passivesApiUrl)
    ]);

    if (!itemsResponse.ok) {
        if (itemsResponse.status === 404) {
            throw new Error("Character not found. Check spelling or make sure your profile is public.");
        }
        throw new Error(`Path of Exile API request for items failed (status: ${itemsResponse.status})`);
    }
    const itemsData = await itemsResponse.json();

    let passiveTreeData = { hashes: [], jewels: [] };
    if (passivesResponse.ok) {
        const passivesData = await passivesResponse.json();
        passiveTreeData.hashes = passivesData.hashes || [];
        passiveTreeData.jewels = (passivesData.items || []).map(jewel => ({
            name: jewel.name,
            type: jewel.typeLine,
            explicitMods: jewel.explicitMods
        }));
    }

    const character = itemsData.character;
    const items = itemsData.items.map(item => ({
        name: item.name,
        type: item.typeLine,
        inventoryId: item.inventoryId,
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

// A helper function to call the Gemini API.
async function callGeminiApi(prompt) {
    // The API key is now securely stored as an Environment Variable in Vercel.
    const apiKey = process.env.GEMINI_API_KEY;
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    
    const payload = { contents: [{ parts: [{ text: prompt }] }] };

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (!response.ok) {
        throw new Error(`Gemini API request failed with status ${response.status}`);
    }

    const result = await response.json();
    return result.candidates[0].content.parts[0].text;
}

// This is the main handler for our serverless function.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { accountName, characterName, userQuestion } = req.body;

        const buildData = await fetchCharacterData(accountName, characterName);

        const prompt = `
            You are a world-class expert on the video game Path of Exile (PoE). 
            Your task is to analyze a player's build data, fetched directly from the official game API, and answer their specific question.
            The data includes the character's class, level, equipped items with their sockets/gems, and the character's passive skill tree data.

            Here is the player's build data:
            \`\`\`json
            ${JSON.stringify(buildData, null, 2)}
            \`\`\`

            Here is the player's question:
            "${userQuestion}"

            Please provide a detailed analysis and answer based on all the provided data and the user's question.
        `;

        const analysisText = await callGeminiApi(prompt);
        
        res.status(200).json({ text: analysisText });

    } catch (error) {
        console.error("Server-side error:", error);
        res.status(500).json({ error: error.message });
    }
}
