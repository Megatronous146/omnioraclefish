// api/apiscores.js - Vercel Serverless Function Handler

// Note the relative path to the core logic file
const { getPlayerScores } = require('../get_scores'); 

// Vercel function handler
module.exports = async (req, res) => {
    // This sets the response header to avoid unexpected JSON parsing issues on the client (BotGhost)
    res.setHeader('Content-Type', 'text/plain');
    
    console.log('Vercel function triggered for /api/apiscores.');

    try {
        const scores = await getPlayerScores();
        
        // Success: Send the raw text string back to BotGhost
        // This should ensure fetch.response contains the pure string data.
        res.status(200).send(scores);

    } catch (error) {
        // Send a detailed error message and status on failure
        res.status(500).send(`Scraping Failed: ${error.message}`);
    }
};
