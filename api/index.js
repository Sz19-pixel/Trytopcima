const { addonBuilder } = require('stremio-addon-sdk');

// Import the original scraping functions
const { searchResults, extractDetails, extractEpisodes, extractStreamUrl, soraFetch } = require('../kdramahood');

// Define the addon manifest
const manifest = {
    id: 'com.kdramahood.addon',
    version: '2.0.0',
    name: 'KDramaHood',
    description: 'Korean Drama streaming addon for Stremio',
    logo: 'https://raw.githubusercontent.com/xibrox/sora-movie-module/refs/heads/main/kdramahood/icon.png',
    resources: ['catalog', 'stream'],
    types: ['series', 'movie'],
    catalogs: [
        {
            type: 'series',
            id: 'kdramahood-series',
            name: 'KDramaHood Series',
            extra: [
                {
                    name: 'search',
                    isRequired: false
                },
                {
                    name: 'skip',
                    isRequired: false
                }
            ]
        },
        {
            type: 'movie',
            id: 'kdramahood-movies',
            name: 'KDramaHood Movies',
            extra: [
                {
                    name: 'search',
                    isRequired: false
                },
                {
                    name: 'skip',
                    isRequired: false
                }
            ]
        }
    ],
    idPrefixes: ['kdramahood:']
};

// Initialize the addon
const builder = new addonBuilder(manifest);

// Helper function to determine if content is a series or movie
function determineType(title) {
    const seriesKeywords = ['episode', 'ep', 'season', 'drama', 'series'];
    const titleLower = title.toLowerCase();
    
    for (const keyword of seriesKeywords) {
        if (titleLower.includes(keyword)) {
            return 'series';
        }
    }
    
    return 'movie';
}

// Helper function to extract ID from URL
function extractIdFromUrl(url) {
    const match = url.match(/\/([^\/]+)\/?$/);
    return match ? match[1] : url;
}

// Catalog handler
builder.defineCatalogHandler(async (args) => {
    const { type, id, extra } = args;
    
    try {
        let searchQuery = '';
        let skip = 0;
        
        if (extra && extra.search) {
            searchQuery = extra.search;
        }
        
        if (extra && extra.skip) {
            skip = parseInt(extra.skip) || 0;
        }
        
        // If no search query, use popular/trending terms
        if (!searchQuery) {
            const popularTerms = ['korean drama', 'kdrama', 'romance', 'action', 'thriller'];
            searchQuery = popularTerms[Math.floor(Math.random() * popularTerms.length)];
        }
        
        const searchUrl = `https://kdramahood.com/?s=${encodeURIComponent(searchQuery)}`;
        
        const response = await soraFetch(searchUrl);
        if (!response || !response.text) {
            return { metas: [] };
        }
        
        const html = await response.text();
        const results = searchResults(html);
        
        const metas = results
            .filter(item => {
                const itemType = determineType(item.title);
                return itemType === type;
            })
            .slice(skip, skip + 20)
            .map(item => {
                const itemId = extractIdFromUrl(item.href);
                return {
                    id: `kdramahood:${itemId}`,
                    type: determineType(item.title),
                    name: item.title,
                    poster: item.image,
                    background: item.image,
                    description: `Watch ${item.title} on KDramaHood`,
                    genres: ['Drama', 'Korean'],
                    imdbRating: 8.0
                };
            });
        
        return { metas };
        
    } catch (error) {
        console.error('Catalog error:', error);
        return { metas: [] };
    }
});

// Stream handler
builder.defineStreamHandler(async (args) => {
    const { type, id } = args;
    
    try {
        // Extract the original ID from the prefixed ID
        const originalId = id.replace('kdramahood:', '');
        const detailUrl = `https://kdramahood.com/${originalId}`;
        
        const response = await soraFetch(detailUrl);
        if (!response || !response.text) {
            return { streams: [] };
        }
        
        const html = await response.text();
        const details = extractDetails(html);
        
        if (type === 'series') {
            // For series, get episodes and create streams for each episode
            const episodes = extractEpisodes(html);
            const streams = [];
            
            for (const episode of episodes.slice(0, 10)) { // Limit to first 10 episodes for performance
                try {
                    const episodeResponse = await soraFetch(episode.href);
                    if (episodeResponse && episodeResponse.text) {
                        const episodeHtml = await episodeResponse.text();
                        const streamData = extractStreamUrl(episodeHtml);
                        
                        if (streamData && streamData !== 'N/A') {
                            const parsedStream = JSON.parse(streamData);
                            if (parsedStream.stream && parsedStream.stream !== 'N/A') {
                                streams.push({
                                    name: `KDramaHood - Episode ${episode.number}`,
                                    title: `Episode ${episode.number}`,
                                    url: parsedStream.stream,
                                    subtitles: parsedStream.subtitles !== 'N/A' ? [
                                        {
                                            url: parsedStream.subtitles,
                                            lang: 'eng'
                                        }
                                    ] : [],
                                    quality: '1080p',
                                    behaviorHints: {
                                        bingeGroup: `kdramahood-${originalId}`,
                                        countryWhitelist: ['US', 'GB', 'CA', 'AU', 'KR']
                                    }
                                });
                            }
                        }
                    }
                } catch (episodeError) {
                    console.error(`Error processing episode ${episode.number}:`, episodeError);
                }
            }
            
            return { streams };
            
        } else {
            // For movies, get the direct stream
            const streamData = extractStreamUrl(html);
            
            if (streamData && streamData !== 'N/A') {
                const parsedStream = JSON.parse(streamData);
                if (parsedStream.stream && parsedStream.stream !== 'N/A') {
                    return {
                        streams: [
                            {
                                name: 'KDramaHood - 1080p',
                                title: 'KDramaHood Stream',
                                url: parsedStream.stream,
                                subtitles: parsedStream.subtitles !== 'N/A' ? [
                                    {
                                        url: parsedStream.subtitles,
                                        lang: 'eng'
                                    }
                                ] : [],
                                quality: '1080p',
                                behaviorHints: {
                                    countryWhitelist: ['US', 'GB', 'CA', 'AU', 'KR']
                                }
                            }
                        ]
                    };
                }
            }
            
            return { streams: [] };
        }
        
    } catch (error) {
        console.error('Stream error:', error);
        return { streams: [] };
    }
});

// Export as serverless function for Vercel
module.exports = (req, res) => {
    // Get the addon interface and call it with req/res
    const addonInterface = builder.getInterface();
    
    // Handle CORS
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }
    
    // Call the addon interface
    return addonInterface(req, res);
};
