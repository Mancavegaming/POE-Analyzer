// This serverless function fetches POB data using the reliable pob.party API.
export default async function handler(req, res) {
    try {
        const { url } = req.query;
        if (typeof url !== 'string' || url.trim() === '') {
            return res.status(400).json({ error: "Invalid or empty URL provided." });
        }

        // Extract the code from the URL (e.g., 'FNSGYXu2QUgG')
        const urlParts = url.trim().split('/');
        const pobCode = urlParts[urlParts.length - 1];

        if (!pobCode) {
            throw new Error("Could not extract POB code from URL.");
        }

        // Call the pob.party API directly from the server. No CORS proxy needed.
        const apiUrl = `https://pob.party/api/v2/pastebin/${pobCode}`;
        
        const response = await fetch(apiUrl);
        if (!response.ok) {
            throw new Error(`The pob.party API could not find the build. Please check your link. (status: ${response.status})`);
        }

        const buildJson = await response.json();
        
        if (!buildJson || !buildJson.build) {
            throw new Error("Invalid response from pob.party API.");
        }

        const build = buildJson.build;
        
        // Reformat the pob.party JSON into the structure our app expects
        const stats = {};
        if (build.stats) {
            build.stats.forEach(stat => {
                stats[stat.id] = stat.value;
            });
        }
        
        const skills = [];
        if (build.skills) {
            build.skills.forEach(group => {
                if (group.gems && group.gems.length > 0) {
                    const firstGem = group.gems[0];
                     skills.push({
                        mainSkillId: firstGem.id,
                        slot: group.slot || 'Unknown',
                        level: firstGem.level,
                        quality: firstGem.quality,
                        isEnabled: group.enabled,
                        links: group.gems.slice(1).map(g => g.id)
                    });
                }
            });
        }
        
        const items = [];
        if (build.items) {
            build.items.forEach(item => {
                 items.push({
                    name: item.name,
                    data: item.raw
                });
            });
        }
        
        const keystoneNames = build.keystones ? build.keystones.map(k => k.name) : [];

        const buildData = {
            character: {
                class: build.class,
                ascendancy: build.ascendancy,
                level: build.level,
                stats
            },
            skills,
            items,
            keystones: keystoneNames,
        };
        
        res.status(200).json(buildData);

    } catch (error) {
        console.error("--- POB PARSER FAILED ---", error);
        res.status(500).json({ error: error.message });
    }
}
