import pako from 'pako';
import { ZstdCodec } from 'zstd-codec';

// Helper to parse the raw POB code.
async function parsePobCode(pobCode) {
    // POB uses URL-safe Base64, so replace '-' with '+' and '_' with '/'
    const base64String = pobCode.trim().replace(/-/g, '+').replace(/_/g, '/');
    
    // Convert base64 to a byte array
    const binaryString = atob(base64String);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }

    let inflatedData;
    try {
        // Try decompressing with Zlib first (older POBs)
        inflatedData = pako.inflate(bytes, { to: 'string' });
    } catch (e) {
        // If Zlib fails, try decompressing with ZSTD (newer POBs)
        if (String(e).includes("incorrect header check") || String(e).includes("invalid block type")) {
            try {
                const zstd = await ZstdCodec.load();
                const streaming = new zstd.Streaming();
                const decompressed = streaming.decompress(bytes);
                inflatedData = new TextDecoder().decode(decompressed);
            } catch (zstdError) {
                throw new Error("Failed to decompress POB data with both Zlib and ZSTD.");
            }
        } else {
             throw e; // Re-throw other unexpected errors
        }
    }

    const parser = new DOMParser();
    const xmlDoc = parser.parseFromString(inflatedData, "application/xml");
    if (xmlDoc.getElementsByTagName("parsererror").length) {
        throw new Error("Failed to parse POB XML.");
    }

    const buildElement = xmlDoc.getElementsByTagName('Build')[0];
    const itemsElement = xmlDoc.getElementsByTagName('Items')[0];
    const skillsElement = xmlDoc.getElementsByTagName('Skills')[0];
    const treeElement = xmlDoc.getElementsByTagName('Tree')[0];

    if (!buildElement) {
        throw new Error("POB data is incomplete or malformed.");
    }

    const stats = {};
    for (const stat of buildElement.getElementsByTagName('Stat')) {
        stats[stat.getAttribute('stat')] = stat.getAttribute('value');
    }

    const skills = [];
    if (skillsElement) {
        for (const group of skillsElement.getElementsByTagName('Skill')) {
            const firstGem = group.getElementsByTagName('Gem')[0];
            if (firstGem?.getAttribute('nameSpec')) {
                skills.push({
                    mainSkillId: firstGem.getAttribute('nameSpec'),
                    slot: group.getAttribute('slot') || 'Unknown',
                    level: firstGem.getAttribute('level'),
                    quality: firstGem.getAttribute('quality'),
                    isEnabled: group.getAttribute('enabled') === 'true',
                    links: Array.from(group.getElementsByTagName('Gem')).slice(1).map(g => g.getAttribute('nameSpec'))
                });
            }
        }
    }
    
    const items = [];
    if (itemsElement) {
        for (const item of itemsElement.getElementsByTagName('Item')) {
             const itemText = item.textContent || "";
             const nameMatch = itemText.match(/Rarity: .*\n(.*?)\n/);
             items.push({ 
                name: nameMatch ? nameMatch[1] : 'Unknown Item',
                data: itemText.trim() 
            });
        }
    }

    const keystoneNames = [];
    if (treeElement) {
        const spec = treeElement.getElementsByTagName('Spec')[0];
        if (spec) {
             for (const node of spec.getElementsByTagName('Node')) {
                if (node.getAttribute('isKeystone') === 'true') {
                    keystoneNames.push(node.getAttribute('name'));
                }
            }
        }
    }

    return {
        character: {
            class: buildElement.getAttribute('className'),
            ascendancy: buildElement.getAttribute('ascendancyName'),
            level: buildElement.getAttribute('level'),
            stats
        },
        skills,
        items,
        keystones: keystoneNames,
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
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { pobCode, userQuestion } = req.body;

        const buildData = await parsePobCode(pobCode);

        const prompt = `
            You are a world-class expert on the video game Path of Exile (PoE). 
            Your task is to analyze a player's build data and answer their question.
            The data includes the character's class, level, items, gems, and passive tree.

            Here is the player's build data:
            \`\`\`json
            ${JSON.stringify(buildData, null, 2)}
            \`\`\`
            
            Here is the player's question:
            "${userQuestion}"

            Please provide a detailed analysis and answer. Look at the entire build: tree, gear, auras, flasks, etc. If the user asks about DPS, use your extensive knowledge of the game to provide a reasonable estimate based on the provided gems, links, gear, and passive tree.
        `;

        const analysisText = await callGeminiApi(prompt);
        return res.status(200).json({ text: analysisText });

    } catch (error) {
        console.error("Server-side error:", error);
        return res.status(500).json({ error: error.message });
    }
}
