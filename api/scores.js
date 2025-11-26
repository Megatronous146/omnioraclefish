// api/scores.js
const { getPlayerScores } = require('../get_scores'); 

module.exports = async (req, res) => {
    // Force text/plain so BotGhost doesn't try to parse it as JSON
    res.setHeader('Content-Type', 'text/plain');
    console.log('Function triggered: Using @sparticuz/chromium');

    try {
        const scores = await getPlayerScores();
        res.status(200).send(scores);
    } catch (error) {
        console.error('Handler Error:', error);
        res.status(500).send(`Failed: ${error.message}`);
    }
};
