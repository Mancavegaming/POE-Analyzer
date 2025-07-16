import pako from 'pako';
import { ZstdCodec } from 'zstd-codec';
import { XMLParser } from 'fast-xml-parser';

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

    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "@_" });
    const jsonObj = parser.parse(inflatedData);

    if (!jsonObj.PathOfBuilding || !jsonObj.PathOfBuilding.Build) {
        throw new Error("POB data is incomplete or malformed.");
    }

    const build = jsonObj.PathOfBuilding.Build;
    const skills = jsonObj.PathOfBuilding.Skills.Skill;
    const items = jsonObj.PathOfBuilding.Items.Item;
    const tree = jsonObj.PathOfBuilding.Tree.Spec;

    const stats = {};
    if (build.Stat) {
        build.Stat.forEach(stat => {
            stats[stat['@_stat']] = stat['@_value'];
        });
    }

    const parsedSkills = [];
    if (skills) {
        const skillList = Array.isArray(skills) ? skills : [skills];
        skillList.forEach(group => {
            if (group.Gem) {
                const gemList = Array.isArray(group.Gem) ? group.Gem : [group.Gem];
                const firstGem = gemList[0];
                if (firstGem?.['@_nameSpec']) {
                    parsedSkills.push({
                        mainSkillId: firstGem['@_nameSpec'],
                        slot: group['@_slot'] || 'Unknown',
                        level: firstGem['@_level'],
                        quality: firstGem['@_quality'],
                        isEnabled: group['@_enabled'] === 'true',
                        links: gemList.slice(1).map(g => g['@_nameSpec'])
                    });
                }
            }
        });
    }
    
    const parsedItems = [];
    if (items) {
        const itemList = Array.isArray(items) ? items : [items];
        itemList.forEach(item => {
            const itemText = item['#text'] || "";
            const nameMatch = itemText.match(/Rarity: .*\n(.*?)\n/);
            parsedItems.push({ 
                name: nameMatch ? nameMatch[1] : 'Unknown Item',
                data: itemText.trim() 
            });
        });
    }

    const keystoneNames = [];
    let treeURL = "";
    if (tree) {
        // Extract the skill tree URL
        treeURL = tree['@_url'] || "";
        if (tree.Node) {
            const nodeList = Array.isArray(tree.Node) ? tree.Node : [tree.Node];
            nodeList.forEach(node => {
                if (node['@_isKeystone'] === 'true') {
                    keystoneNames.push(node['@_name']);
                }
            });
        }
    }

    return {
        character: {
            class: build['@_className'],
            ascendancy: build['@_ascendancyName'],
            level: build['@_level'],
            stats
        },
        skills: parsedSkills,
        items: parsedItems,
        keystones: keystoneNames,
        treeURL: treeURL // Add the URL to the returned data
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
        // Return both the analysis text and the build data (which includes the tree URL)
        return res.status(200).json({ text: analysisText, buildData: buildData });

    } catch (error) {
        console.error("Server-side error:", error);
        return res.status(500).json({ error: error.message });
    }
}
