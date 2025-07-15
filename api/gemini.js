// This serverless function's only job is to call the Gemini API.
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { buildData, userQuestion, primarySkill, secondarySkill } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error("GEMINI_API_KEY environment variable not set.");
        }

        let prompt = `
            You are a world-class expert on the video game Path of Exile (PoE). 
            Your task is to analyze a player's build data and answer their specific question.
            The data includes character stats, skills, keystones, and item data.

            Here is the player's build data:
            \`\`\`json
            ${JSON.stringify(buildData, null, 2)}
            \`\`\`

            The user has identified their Primary Damage Skill as: "${primarySkill}".
        `;

        if (secondarySkill && secondarySkill !== "None") {
             prompt += `They are also interested in a Secondary Skill: "${secondarySkill}".`;
        }

        prompt += `
            Here is the user's question:
            "${userQuestion}"

            Please provide a detailed analysis and answer based on all the provided data and the user's question. If the user asks about DPS, use your extensive knowledge to estimate the damage potential based on the provided gems, links, and item data.
        `;

        const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
        const payload = { contents: [{ parts: [{ text: prompt }] }] };

        const geminiResponse = await fetch(apiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!geminiResponse.ok) {
            const errorBody = await geminiResponse.json();
            console.error("Gemini API Error:", errorBody);
            throw new Error(`Gemini API request failed with status ${geminiResponse.status}`);
        }

        const result = await geminiResponse.json();
        const analysisText = result.candidates[0].content.parts[0].text;
        
        res.status(200).json({ text: analysisText });

    } catch (error) {
        console.error("--- GEMINI ANALYZER FAILED ---", error);
        res.status(500).json({ error: error.message });
    }
}
