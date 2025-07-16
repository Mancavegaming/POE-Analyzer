import pako from 'pako';
import { ZstdCodec } from 'zstd-codec';

// This is the definitive, self-contained POB parser.
// It runs on the server and handles both old (zlib) and new (zstd) formats.
export default async function handler(req, res) {
    try {
        const { url } = req.query;
        if (typeof url !== 'string' || url.trim() === '') {
            return res.status(400).json({ error: "Invalid or empty URL provided." });
        }

        let pobCodeUrl;
        const trimmedUrl = url.trim();

        // **DEFINITIVE FIX**: Handle both pobb.in and pastebin.com links correctly by building the raw URL.
        if (trimmedUrl.includes('pobb.in')) {
            const urlParts = new URL(trimmedUrl);
            const pathParts = urlParts.pathname.split('/');
            const pobCode = pathParts[pathParts.length - 1];
            if (!pobCode) throw new Error("Could not extract POB code from pobb.in URL.");
            pobCodeUrl = `https://pobb.in/raw/${pobCode}`;
        } else if (trimmedUrl.includes('pastebin.com')) {
            const urlParts = new URL(trimmedUrl);
            const pathParts = urlParts.pathname.split('/');
            const pobCode = pathParts[pathParts.length - 1];
            if (!pobCode) throw new Error("Could not extract POB code from pastebin.com URL.");
            pobCodeUrl = `https://pastebin.com/raw/${pobCode}`;
        } else {
            throw new Error("Unsupported URL. Please use a pobb.in or pastebin.com link.");
        }
        
        const response = await fetch(pobCodeUrl);
        if (!response.ok) {
            throw new Error(`Failed to fetch POB code from ${pobCodeUrl} (status: ${response.status})`);
        }
        
        const rawCode = await response.text();
        if (!rawCode) {
            throw new Error("Could not retrieve POB code from URL.");
        }

        // POB uses URL-safe Base64, so replace '-' with '+' and '_' with '/'
        const base64String = rawCode.trim().replace(/-/g, '+').replace(/_/g, '/');
        
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

        const buildData = {
            character: {
                class: buildElement.getAttribute('className
