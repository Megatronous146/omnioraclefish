// This file assumes fps.ms uses a standard Node/Express environment.
const express = require('express');
const { getPlayerScores } = require('./get_scores'); // Import the main script

const app = express();
const port = process.env.PORT || 3000;

app.get('/api/scores', async (req, res) => {
    try {
        const scores = await getPlayerScores();
        // Send the processed string back to the Discord bot
        res.status(200).send(scores);
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).send('Internal Server Error while fetching scores.');
    }
});

app.listen(port, () => {
    console.log(`API listening at http://localhost:${port}`);
});