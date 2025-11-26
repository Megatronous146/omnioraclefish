// get_scores.js

const puppeteer = require('puppeteer');

// --- Configuration ---
const BASE_URL = 'https://stabfish2.io';
const PLAYER_NAME_TO_EXCLUDE = 'Lost';
const TARGET_SERVER_LOCATIONS = [
    'Silicon Valley', 'Dallas', 'Toronto', 'Mexico City', 'Honolulu', 
    'Tokyo', 'Singapore', 'Bangalore', 'Paris', 'Frankfurt', 'Sydney'
];

/**
 * Parses the raw score string (e.g., "130,534") into a numeric integer.
 */
function parseScore(scoreStr) {
    return parseInt(scoreStr.replace(/,/g, ''), 10);
}

/**
 * Main function to scrape and process all server leaderboards.
 * @returns {string} The final sorted and merged leaderboard string.
 */
async function getPlayerScores() {
    let browser;
    // Map to store and merge all unique player scores (Name -> Highest Score)
    const combinedLeaderboard = new Map(); 

    try {
        // Launch a headless browser. Use --single-process for improved server stability.
        browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox', '--single-process'] 
        });
        const page = await browser.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });

        // 1. Enter player name 'Lost'
        console.log(`Setting player name to: ${PLAYER_NAME_TO_EXCLUDE}`);
        const nameInputSelector = '#playername'; // Common ID for name input
        await page.waitForSelector(nameInputSelector, { timeout: 10000 });
        await page.type(nameInputSelector, PLAYER_NAME_TO_EXCLUDE);

        // --- Loop through all target servers ---
        for (const location of TARGET_SERVER_LOCATIONS) {
            console.log(`\n--- Processing server: ${location} ---`);
            
            // A. Open the server modal
            await page.click('.btn-pink.w-100.funny-rounded');
            await page.waitForSelector('.modal-body .server-data-container', { visible: true });

            // B. Find the full server name (e.g., "Silicon Valley-X-Y")
            const fullServerName = await page.evaluate((loc) => {
                const names = Array.from(document.querySelectorAll('.server-data-container .server-data .name'));
                const targetElement = names.find(el => el.textContent.trim().startsWith(loc));
                return targetElement ? targetElement.textContent.trim() : null;
            }, location);

            if (!fullServerName) {
                console.warn(`Server location ${location} not found. Skipping.`);
                await page.click('button[aria-label="Close"]'); // Close modal
                continue;
            }
            
            // C. Click the server row
            const serverElement = await page.evaluateHandle((name) => {
                const names = Array.from(document.querySelectorAll('.server-data-container .server-data .name'));
                const target = names.find(el => el.textContent.trim() === name);
                return target ? target.closest('.server-data') : null;
            }, fullServerName);

            if (serverElement) {
                await serverElement.click();
            }
            
            // D. Close the server modal
            await page.click('button[aria-label="Close"]');

            // 2. Start the game flow
            await page.click('.btn-primary.btn-lg.w-100'); // 'PLAY'
            await page.waitForSelector('button.btn-primary', { timeout: 5000 });
            await page.click('button.btn-primary'); // 'Start Game'
            
            // Wait for the game screen to load 
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }); 
            
            await page.click('.btn-pink.mr-3.btn-lg'); // 'Start Now'
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for in-game load

            // 3. Open the Leaderboard
            await page.click('.bar-button .fa-trophy');
            await page.waitForSelector('.utility-ranks .list');
            
            // 4. Extract data and filter out the self-player
            const serverScores = await page.evaluate((excludeName) => {
                const scores = [];
                const list = document.querySelector('.utility-ranks .list');
                if (!list) return scores;

                list.querySelectorAll('.rank-item').forEach(item => {
                    if (item.classList.contains('text-yellow')) return; // Skip header

                    const nameElement = item.querySelector('.name');
                    const scoreElement = item.querySelector('.score');
                    
                    if (nameElement && scoreElement) {
                        const name = nameElement.textContent.trim();
                        const score = scoreElement.textContent.trim();

                        // Filter out the "Lost" player entry
                        if (name === excludeName) return; 
                        
                        scores.push({ name, score });
                    }
                });
                return scores;
            }, PLAYER_NAME_TO_EXCLUDE);
            
            // 5. Merge scores into the combined map
            serverScores.forEach(entry => {
                const currentScore = parseScore(entry.score);
                const existingScore = combinedLeaderboard.get(entry.name) || 0;
                
                if (currentScore > existingScore) {
                    combinedLeaderboard.set(entry.name, currentScore);
                }
            });

            // 6. Navigate back to the main menu for the next loop iteration
            await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
            await page.waitForSelector(nameInputSelector);
        } // End of server loop

        // 7. Final Processing: Sort and Format
        const finalRankings = Array.from(combinedLeaderboard.entries())
            .map(([name, score]) => ({ name, score }))
            .sort((a, b) => b.score - a.score); // Sort by score descending

        // 8. Generate the final output string
        const outputString = finalRankings
            .map(rank => `${rank.name}, ${rank.score.toLocaleString('en-US')}`) // Format score back with commas
            .join('\n');

        return outputString;

    } catch (error) {
        console.error('An error occurred during automation:', error);
        return `Error: Failed to retrieve data. Details: ${error.message}`;
    } finally {
        if (browser) {
            await browser.close();
        }
    }
}

module.exports = { getPlayerScores };