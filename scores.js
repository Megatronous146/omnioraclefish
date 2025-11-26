// api/scores.js

// Relative path to the core logic file
const { getPlayerScores } = require('../get_scores'); 

// Vercel function handler
module.exports = async (req, res) => {
    // Standard Vercel deployment has a 60-second timeout on the free tier.
    // Ensure the scraping logic completes within this time.
    
    console.log('Vercel function triggered.');

    try {
        const scores = await getPlayerScores();
        
        // Success: Send the processed string back to BotGhost
        res.status(200).send(scores);

    } catch (error) {
        // Send a clean 500 status on failure
        res.status(500).send(`Scraping Failed: ${error.message}`);
    }
};