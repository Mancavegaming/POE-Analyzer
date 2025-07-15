import pako from 'pako';
import { ZstdCodec } from 'zstd-codec';

// This serverless function fetches and parses a POB link.
export default async function handler(req, res) {
    try {
        const { url } = req.query;
        if (typeof url !== 'string' || url.trim() === '') {
            return res.status(400).json({ error: "Invalid or empty URL provided." });
        }

        const pobCodeUrl = url.trim().replace('pobb.in', 'pobb.in/raw').replace('pastebin.com/', 'pastebin.com/raw/');
        
        const response = await fetch(pobCodeUrl);
        if (!response.ok) {
            throw new Error(`Fetch failed (status: ${response.status})`);
        }
        
        const pobCode = await response.text();
        if (!pobCode) {
            throw new Error("Could not retrieve POB code from URL.");
        }

        const base64String = pobCode.trim().replace(/-/g, '+').replace(/_/g, '/');
        
        const binaryString = atob(base64String);
        const len = binaryString.length;
        const bytes = new Uint8Array(len);
        for (let i = 0; i < len; i++) {
            bytes[i] = binaryString.charCodeAt(i);
        }

        let inflatedData;
        try {
            inflatedData = pako.inflate(bytes, { to: 'string' });
        } catch (e) {
            if (String(e).includes("incorrect header check") || String(e).includes("invalid block type")) {
                const zstd = await ZstdCodec.load();
                const streaming = new zstd.Streaming();
                const decompressed = streaming.decompress(bytes);
                inflatedData = new TextDecoder().decode(decompressed);
            } else {
                 throw e;
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
                items.push({ data: item.textContent.trim() });
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

        const buildData = {
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
        
        res.status(200).json(buildData);

    } catch (error) {
        console.error("--- POB PARSER FAILED ---", error);
        res.status(500).json({ error: error.message });
    }
}
