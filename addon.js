const { addonBuilder } = require('stremio-addon-sdk');
const fetch = require('node-fetch');

// Your existing TopCinema module functions
class Unbaser {
    constructor(base) {
        this.ALPHABET = {
            62: "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",
            95: "' !\"#$%&\'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~'",
        };
        this.dictionary = {};
        this.base = base;
        
        if (36 < base && base < 62) {
            this.ALPHABET[base] = this.ALPHABET[base] ||
                this.ALPHABET[62].substr(0, base);
        }
        
        if (2 <= base && base <= 36) {
            this.unbase = (value) => parseInt(value, base);
        } else {
            try {
                [...this.ALPHABET[base]].forEach((cipher, index) => {
                    this.dictionary[cipher] = index;
                });
            } catch (er) {
                throw Error("Unsupported base encoding.");
            }
            this.unbase = this._dictunbaser;
        }
    }
    
    _dictunbaser(value) {
        let ret = 0;
        [...value].reverse().forEach((cipher, index) => {
            ret = ret + ((Math.pow(this.base, index)) * this.dictionary[cipher]);
        });
        return ret;
    }
}

function unpack(source) {
    let { payload, symtab, radix, count } = _filterargs(source);
    if (count != symtab.length) {
        throw Error("Malformed p.a.c.k.e.r. symtab.");
    }
    let unbase;
    try {
        unbase = new Unbaser(radix);
    } catch (e) {
        throw Error("Unknown p.a.c.k.e.r. encoding.");
    }
    
    function lookup(match) {
        const word = match;
        let word2;
        if (radix == 1) {
            word2 = symtab[parseInt(word)];
        } else {
            word2 = symtab[unbase.unbase(word)];
        }
        return word2 || word;
    }
    
    source = payload.replace(/\b\w+\b/g, lookup);
    return _replacestrings(source);
    
    function _filterargs(source) {
        const juicers = [
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\), *(\d+), *(.*)\)\)/,
            /}\('(.*)', *(\d+|\[\]), *(\d+), *'(.*)'\.split\('\|'\)/,
        ];
        for (const juicer of juicers) {
            const args = juicer.exec(source);
            if (args) {
                let a = args;
                if (a[2] == "[]") {
                    // Handle empty array case
                }
                try {
                    return {
                        payload: a[1],
                        symtab: a[4].split("|"),
                        radix: parseInt(a[2]),
                        count: parseInt(a[3]),
                    };
                } catch (ValueError) {
                    throw Error("Corrupted p.a.c.k.e.r. data.");
                }
            }
        }
        throw Error("Could not make sense of p.a.c.k.e.r data (unexpected code structure)");
    }
    
    function _replacestrings(source) {
        return source;
    }
}

// Simplified fetch function using node-fetch
async function soraFetch(url, options = { headers: {}, method: 'GET', body: null }) {
    try {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: options.headers || {},
            body: options.body || null
        });
        return response;
    } catch (error) {
        console.error('Fetch error:', error);
        return null;
    }
}

// Check function (simplified for addon)
function _0xCheck() {
    return true; // Simplified for addon - you may need to implement proper check
}

// TopCinema scraping functions
async function searchResults(keyword) {
    const uniqueResults = new Map();

    try {
        for (let i = 1; i <= 5; i++) { // Reduced pages for performance
            const url = `https://web6.topcinema.cam/search/?query=${keyword}&type=all&offset=${i}`;
            const response2 = await soraFetch(url);
            if (!response2) continue;
            
            const html2 = await response2.text();
            const regex2 = /<a href="([^"]+)"[^>]*?title="([^"]+?)"[^>]*?>[\s\S]*?<img[^>]+data-src="([^"]+)"[\s\S]*?<ul class="liList">[\s\S]*?<li>.*?<\/li>\s*<li>([^<]+)<\/li>/g;

            let match2;
            while ((match2 = regex2.exec(html2)) !== null) {
                const rawTitle = match2[2].trim();
                const cleanedTitle = rawTitle
                    .replace(/الحلقة\s*\d+(\.\d+)?(-\d+)?/gi, '')
                    .replace(/الحلقة\s*\d+/gi, '')
                    .replace(/والاخيرة/gi, '')
                    .replace(/\s+/g, ' ')
                    .trim();

                const finalTitle = `${cleanedTitle} (${match2[4].trim()})`;

                if (!uniqueResults.has(cleanedTitle)) {
                    uniqueResults.set(cleanedTitle, {
                        title: finalTitle,
                        href: match2[1].trim(),
                        image: match2[3].trim(),
                        year: match2[4].trim()
                    });
                }
            }
        }
    } catch (error) {
        console.error('Search error:', error);
    }

    return Array.from(uniqueResults.values());
}

async function extractEpisodes(url) {
    let results = [];
    
    try {
        const decodedUrl = decodeURIComponent(url);
        const seriesKeywords = ["مسلسل", "الموسم", "الحلقة"];
        const isSeries = seriesKeywords.some(keyword => decodedUrl.includes(keyword));

        const response = await soraFetch(url);
        if (!response) return results;
        
        const html = await response.text();

        if (isSeries) {
            const seasonRegex = /<div class="Small--Box Season">\s*<a href="(?<href>[^"]+)"[^>]*>.*?<div class="epnum"><span>الموسم<\/span>(?<number>\d+)<\/div>.*?data-src="(?<image>[^"]+)"[^>]*>.*?<h3 class="title">(?<title>[^<]+)<\/h3>/gs;
            const matches = [...html.matchAll(seasonRegex)];

            let seasonHrefs = [];
            for (let i = 0; i < matches.length; i++) {
                const match = matches[i];
                const seasonHref = match.groups.href;
                if (seasonHref) {
                    seasonHrefs.push(seasonHref);
                }
            }

            for (let i = 0; i < seasonHrefs.length; i++) {
                const seasonRes = await soraFetch(seasonHrefs[i]);
                if (!seasonRes) continue;
                
                const seasonHtml = await seasonRes.text();
                const episodeRegex = /<a href="([^"]+?)"[^>]*?>\s*<div class="image">.*?<div class="epnum">\s*<span>الحلقة<\/span>\s*(\d+)/gs;
                let match;

                while ((match = episodeRegex.exec(seasonHtml)) !== null) {
                    const episodeUrl = match[1].trim();
                    const episodeNumber = parseInt(match[2], 10);

                    if (episodeUrl) {
                        results.push({
                            href: episodeUrl,
                            number: episodeNumber,
                            season: i + 1
                        });
                    }
                }
            }
        } else {
            const watchMatch = html.match(/<a class="watch" href="([^"]+)"/);
            if (watchMatch) {
                results.push({
                    href: watchMatch[1].trim(),
                    number: 1,
                    season: 1
                });
            }
        }

        results.reverse();
    } catch (error) {
        console.error('Extract episodes error:', error);
    }

    return results;
}

async function extractStreamUrl(url) {
    if (!_0xCheck()) return [];

    try {
        const responseText = await soraFetch(url);
        if (!responseText) return [];
        
        const htmlText = await responseText.text();
        const urlMatch = htmlText.match(/<a class="watch" href="([^"]+)"/);
        if (!urlMatch) return [];

        const response = await soraFetch(urlMatch[1]);
        if (!response) return [];
        
        const html = await response.text();
        const regex = /<li[^>]+data-id="([^"]+)"[^>]+data-server="([^"]+)"/g;

        const matches = [];
        let match;
        while ((match = regex.exec(html)) !== null) {
            matches.push({
                dataId: match[1],
                dataServer: match[2],
            });
        }

        let streamEmbeds = [];
        for (const match of matches) {
            const url2 = "https://web6.topcinema.cam/wp-content/themes/movies2023/Ajaxat/Single/Server.php";
            const headers = {
                "Host": "web6.topcinema.cam",
                "Origin": "https://web6.topcinema.cam",
                "Referer": "https://web6.topcinema.cam/",
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:138.0) Gecko/20100101 Firefox/138.0",
                "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
                "X-Requested-With": "XMLHttpRequest",
            };

            const response2 = await soraFetch(url2, { 
                method: "POST", 
                headers, 
                body: `id=${match.dataId}&i=${match.dataServer}` 
            });
            
            if (!response2) continue;
            const html2 = await response2.text();
            const streamMatch = html2.match(/<iframe[^>]+src="([^"]+)"/);
            
            if (streamMatch) {
                streamEmbeds.push(streamMatch[1].trim());
            }
        }

        let streams = [];
        for (const streamEmbed of streamEmbeds) {
            // Process different stream providers
            if (streamEmbed.includes("updown")) {
                const stream = await processUpDownStream(streamEmbed);
                if (stream) streams.push(stream);
            } else if (streamEmbed.includes("streamwish")) {
                const stream = await processStreamWishStream(streamEmbed);
                if (stream) streams.push(stream);
            } else if (streamEmbed.includes("vidhide")) {
                const stream = await processVidHideStream(streamEmbed);
                if (stream) streams.push(stream);
            } else if (streamEmbed.includes("filemoon")) {
                const stream = await processFileMoonStream(streamEmbed);
                if (stream) streams.push(stream);
            } else if (streamEmbed.includes("sendvid")) {
                const stream = await processSendVidStream(streamEmbed);
                if (stream) streams.push(stream);
            }
        }

        return streams;
    } catch (error) {
        console.error('Extract stream error:', error);
        return [];
    }
}

// Helper functions for different stream providers
async function processUpDownStream(streamEmbed) {
    try {
        const response = await soraFetch(streamEmbed);
        if (!response) return null;
        
        const html = await response.text();
        const scriptMatch = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?)<\/script>/);
        if (!scriptMatch) return null;

        const unpackedScript = unpack(scriptMatch[1]);
        const streamMatch = unpackedScript.match(/(?<=file:")[^"]+/);
        const streamUrl = streamMatch ? streamMatch[0].trim() : '';

        return {
            name: "TopCinema - UpDown",
            url: streamUrl,
            title: "UpDown Quality"
        };
    } catch (error) {
        console.error('UpDown stream error:', error);
        return null;
    }
}

async function processStreamWishStream(streamEmbed) {
    try {
        const response = await soraFetch(streamEmbed, { 
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/244.178.44.111 Safari/537.36",
                "Referer": "https://web6.topcinema.cam/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" 
            } 
        });
        
        if (!response) return null;
        const html = await response.text();
        const scriptMatch = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?)<\/script>/);
        if (!scriptMatch) return null;

        const unpackedScript = unpack(scriptMatch[1]);
        const regex = /https:\/\/[^"'\s]+\/hls2\/[^"'\s]+/g;
        const matches = unpackedScript.match(regex);
        const streamUrl = matches ? matches[0].trim() : '';

        return {
            name: "TopCinema - StreamWish",
            url: streamUrl,
            title: "StreamWish Quality"
        };
    } catch (error) {
        console.error('StreamWish stream error:', error);
        return null;
    }
}

async function processVidHideStream(streamEmbed) {
    try {
        const response = await soraFetch(streamEmbed, { 
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/244.178.44.111 Safari/537.36",
                "Referer": "https://web6.topcinema.cam/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" 
            } 
        });
        
        if (!response) return null;
        const html = await response.text();
        const scriptMatch = html.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?)<\/script>/);
        if (!scriptMatch) return null;

        const unpackedScript = unpack(scriptMatch[1]);
        const regex = /https:\/\/[^"'\s]+\/hls2\/[^"'\s]+/g;
        const matches = unpackedScript.match(regex);
        const streamUrl = matches ? matches[0].trim() : '';

        return {
            name: "TopCinema - VidHide", 
            url: streamUrl,
            title: "VidHide Quality"
        };
    } catch (error) {
        console.error('VidHide stream error:', error);
        return null;
    }
}

async function processFileMoonStream(streamEmbed) {
    try {
        const response = await soraFetch(streamEmbed, { 
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/244.178.44.111 Safari/537.36",
                "Referer": "https://web6.topcinema.cam/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" 
            } 
        });
        
        if (!response) return null;
        const html = await response.text();
        const regex = /iframe src="([^"]+)"/;
        const match = html.match(regex);
        if (!match) return null;
        
        const iframeEmbed = match[1];
        const response2 = await soraFetch(iframeEmbed, { 
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/244.178.44.111 Safari/537.36",
                "Referer": "https://filemoon.sx/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" 
            } 
        });
        
        if (!response2) return null;
        const html2 = await response2.text();
        const scriptMatch = html2.match(/<script[^>]*>\s*(eval\(function\(p,a,c,k,e,d[\s\S]*?)<\/script>/);
        if (!scriptMatch) return null;

        const unpackedScript = unpack(scriptMatch[1]);
        const regex2 = /file:\s*"([^"]+)"/;
        const matches = unpackedScript.match(regex2);
        const streamUrl = matches ? matches[1] : '';

        return {
            name: "TopCinema - FileMoon",
            url: streamUrl,
            title: "FileMoon Quality"
        };
    } catch (error) {
        console.error('FileMoon stream error:', error);
        return null;
    }
}

async function processSendVidStream(streamEmbed) {
    try {
        const response = await soraFetch(streamEmbed, { 
            headers: { 
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/244.178.44.111 Safari/537.36",
                "Referer": "https://web6.topcinema.cam/",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8" 
            } 
        });
        
        if (!response) return null;
        const html = await response.text();
        const regex = /var\s+video_source\s*=\s*"([^"]+)"/;
        const match = html.match(regex);
        const streamUrl = match ? match[1] : null;

        return {
            name: "TopCinema - SendVid",
            url: streamUrl,
            title: "SendVid Quality"
        };
    } catch (error) {
        console.error('SendVid stream error:', error);
        return null;
    }
}

// Helper function to create IMDb ID from title and year
function createImdbId(title, year) {
    // Simple hash function to create consistent IDs
    const hash = title.toLowerCase().replace(/[^a-z0-9]/g, '');
    return `tc${hash}${year}`;
}

// Helper function to determine content type
function getContentType(title) {
    const animeKeywords = ['انمي', 'anime'];
    const seriesKeywords = ['مسلسل', 'series', 'موسم'];
    
    const lowerTitle = title.toLowerCase();
    
    if (animeKeywords.some(keyword => lowerTitle.includes(keyword))) {
        return 'series'; // Stremio treats anime as series
    } else if (seriesKeywords.some(keyword => lowerTitle.includes(keyword))) {
        return 'series';
    } else {
        return 'movie';
    }
}

// Stremio Addon Definition
const manifest = {
    id: 'org.topcinema.addon',
    version: '1.0.0',
    name: 'TopCinema',
    description: 'Arabic movies, TV shows and anime from TopCinema',
    logo: 'https://raw.githubusercontent.com/xibrox/sora-movie-module/refs/heads/main/topcinema/icon.png',
    resources: ['catalog', 'stream', 'meta'],
    types: ['movie', 'series'],
    catalogs: [
        {
            type: 'movie',
            id: 'topcinema-movies',
            name: 'TopCinema Movies',
            extra: [
                {
                    name: 'search',
                    isRequired: false
                }
            ]
        },
        {
            type: 'series',
            id: 'topcinema-series',
            name: 'TopCinema Series',
            extra: [
                {
                    name: 'search',
                    isRequired: false
                }
            ]
        }
    ],
    idPrefixes: ['tc'],
    behaviorHints: {
        configurable: false,
        configurationRequired: false
    }
};

const addon = new addonBuilder(manifest);

// Catalog handler
addon.defineCatalogHandler(async ({ type, id, extra }) => {
    console.log(`Catalog request: type=${type}, id=${id}, extra=${JSON.stringify(extra)}`);
    
    if (!extra || !extra.search) {
        return { metas: [] };
    }

    try {
        const searchQuery = extra.search;
        const results = await searchResults(searchQuery);
        
        const metas = results.map(result => {
            const contentType = getContentType(result.title);
            
            // Only return results that match the requested type
            if (contentType !== type) {
                return null;
            }
            
            const imdbId = createImdbId(result.title, result.year);
            
            return {
                id: imdbId,
                name: result.title,
                type: contentType,
                poster: result.image,
                year: result.year,
                description: `Arabic content from TopCinema - ${result.title}`,
                imdbRating: '7.0', // Default rating
                genres: ['Arabic Content'],
                _topcinema_url: result.href // Store original URL for stream handler
            };
        }).filter(Boolean);

        return { metas };
    } catch (error) {
        console.error('Catalog error:', error);
        return { metas: [] };
    }
});

// Stream handler
addon.defineStreamHandler(async ({ type, id }) => {
    console.log(`Stream request: type=${type}, id=${id}`);
    
    if (!id.startsWith('tc')) {
        return { streams: [] };
    }

    try {
        // For real implementation, you'd need to store/retrieve the original URL
        // This is a simplified approach - in production you'd want to:
        // 1. Store the mapping between IMDb ID and TopCinema URL
        // 2. Or encode the URL in the ID
        // 3. Or search again to find the URL
        
        // For now, let's assume we can extract info from the ID
        const searchTerm = id.replace('tc', '').replace(/\d+$/, '');
        const results = await searchResults(searchTerm);
        
        if (results.length === 0) {
            return { streams: [] };
        }

        const firstResult = results[0];
        const episodes = await extractEpisodes(firstResult.href);
        
        if (episodes.length === 0) {
            return { streams: [] };
        }

        // For movies, use the first episode. For series, you'd need episode info
        const streamUrl = episodes[0].href;
        const streams = await extractStreamUrl(streamUrl);

        return { 
            streams: streams.map(stream => ({
                name: stream.name,
                title: stream.title,
                url: stream.url,
                behaviorHints: {
                    notWebReady: true,
                    bingeGroup: 'topcinema-' + id
                }
            }))
        };
    } catch (error) {
        console.error('Stream error:', error);
        return { streams: [] };
    }
});

// Meta handler (optional but recommended)
addon.defineMetaHandler(async ({ type, id }) => {
    console.log(`Meta request: type=${type}, id=${id}`);
    
    if (!id.startsWith('tc')) {
        return { meta: {} };
    }

    try {
        const searchTerm = id.replace('tc', '').replace(/\d+$/, '');
        const results = await searchResults(searchTerm);
        
        if (results.length === 0) {
            return { meta: {} };
        }

        const result = results[0];
        
        return {
            meta: {
                id: id,
                name: result.title,
                type: getContentType(result.title),
                poster: result.image,
                year: result.year,
                description: `Arabic content from TopCinema - ${result.title}`,
                imdbRating: '7.0',
                genres: ['Arabic Content'],
                runtime: '120 min', // Default runtime
                language: 'Arabic',
                country: 'Various'
            }
        };
    } catch (error) {
        console.error('Meta error:', error);
        return { meta: {} };
    }
});

module.exports = addon.getInterface();
