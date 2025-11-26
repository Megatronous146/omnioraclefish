// get_scores.js

const chromium = require('chrome-aws-lambda');
const puppeteer = require('puppeteer-core'); 

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

async function getPlayerScores() {
    let browser;
    const combinedLeaderboard = new Map(); 

    try {
        // Launch configuration for Vercel's serverless environment
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath, // Uses the lightweight Chromium binary
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        
        const page = await browser.newPage();
        await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 60000 });

        // 1. Enter player name 'Lost'
        const nameInputSelector = '#playername'; 
        await page.waitForSelector(nameInputSelector, { timeout: 10000 });
        await page.type(nameInputSelector, PLAYER_NAME_TO_EXCLUDE);

        // --- Loop through all target servers ---
        for (const location of TARGET_SERVER_LOCATIONS) {
            
            // A. Open the server modal
            await page.click('.btn-pink.w-100.funny-rounded');
            await page.waitForSelector('.modal-body .server-data-container', { visible: true });

            // B. Find the full server name dynamically
            const fullServerName = await page.evaluate((loc) => {
                const names = Array.from(document.querySelectorAll('.server-data-container .server-data .name'));
                const targetElement = names.find(el => el.textContent.trim().startsWith(loc));
                return targetElement ? targetElement.textContent.trim() : null;
            }, location);

            if (!fullServerName) {
                await page.click('button[aria-label="Close"]'); 
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
            
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 }); 
            
            await page.click('.btn-pink.mr-3.btn-lg'); // 'Start Now'
            await new Promise(resolve => setTimeout(resolve, 2000)); 

            // 3. Open the Leaderboard
            await page.click('.bar-button .fa-trophy');
            await page.waitForSelector('.utility-ranks .list');
            
            // 4. Extract data and filter out the self-player
            const serverScores = await page.evaluate((excludeName) => {
                const scores = [];
                const list = document.querySelector('.utility-ranks .list');
                if (!list) return scores;

                list.querySelectorAll('.rank-item').forEach(item => {
                    if (item.classList.contains('text-yellow')) return; 

                    const nameElement = item.querySelector('.name');
                    const scoreElement = item.querySelector('.score');
                    
                    if (nameElement && scoreElement) {
                        const name = nameElement.textContent.trim();
                        const score = scoreElement.textContent.trim();

                        if (name === excludeName) return; 
                        
                        scores.push({ name, score });
                    }
                });
                return scores;
            }, PLAYER_NAME_TO_EXCLUDE);
            
            // 5. Merge scores
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
        }

        // 7. Final Processing: Sort and Format
        const finalRankings = Array.from(combinedLeaderboard.entries())
            .map(([name, score]) => ({ name, score }))
            .sort((a, b) => b.score - a.score); 

        const outputString = finalRankings
            .map(rank => `${rank.name}, ${rank.score.toLocaleString('en-US')}`)
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