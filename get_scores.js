// get_scores.js
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// --- Configuration ---
const BASE_URL = 'https://stabfish2.io';
const PLAYER_NAME_TO_EXCLUDE = 'Lost';
// We limit the server list to the fastest 3 to ensure we don't hit the 60s timeout
const TARGET_SERVER_LOCATIONS = [
    'Silicon Valley', 'Dallas', 'Toronto' 
];

function parseScore(scoreStr) {
    return parseInt(scoreStr.replace(/,/g, ''), 10);
}

async function getPlayerScores() {
    let browser;
    const combinedLeaderboard = new Map(); 

    try {
        // Essential setting for Vercel to prevent crashes
        chromium.setGraphicsMode = false;

        // Launch browser using the modern @sparticuz/chromium setup
        browser = await puppeteer.launch({
            args: chromium.args,
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(), // This is now a function call
            headless: chromium.headless,
            ignoreHTTPSErrors: true,
        });
        
        const page = await browser.newPage();
        // Set a timeout of 50s to leave buffer room for Vercel's 60s hard limit
        await page.goto(BASE_URL, { waitUntil: 'networkidle0', timeout: 50000 });

        // 1. Enter player name 'Lost'
        const nameInputSelector = '#playername'; 
        await page.waitForSelector(nameInputSelector, { timeout: 10000 });
        await page.type(nameInputSelector, PLAYER_NAME_TO_EXCLUDE);

        // --- Loop through target servers ---
        for (const location of TARGET_SERVER_LOCATIONS) {
            
            // A. Open the server modal
            // We use safe selectors (await page.$) to prevent crashing if a button is missing
            const serverBtn = await page.$('.btn-pink.w-100.funny-rounded');
            if (serverBtn) await serverBtn.click();
            
            try {
                await page.waitForSelector('.modal-body .server-data-container', { visible: true, timeout: 3000 });
            } catch (e) {
                // If modal fails to open, try to close it and skip to next
                const closeBtn = await page.$('button[aria-label="Close"]');
                if (closeBtn) await closeBtn.click();
                continue; 
            }

            // B. Find server
            const fullServerName = await page.evaluate((loc) => {
                const names = Array.from(document.querySelectorAll('.server-data-container .server-data .name'));
                const targetElement = names.find(el => el.textContent.trim().startsWith(loc));
                return targetElement ? targetElement.textContent.trim() : null;
            }, location);

            if (!fullServerName) {
                await page.click('button[aria-label="Close"]'); 
                continue;
            }
            
            // C. Click server
            const serverElement = await page.evaluateHandle((name) => {
                const names = Array.from(document.querySelectorAll('.server-data-container .server-data .name'));
                const target = names.find(el => el.textContent.trim() === name);
                return target ? target.closest('.server-data') : null;
            }, fullServerName);

            if (serverElement) await serverElement.click();
            
            // D. Close modal
            const closeBtn = await page.$('button[aria-label="Close"]');
            if (closeBtn) await closeBtn.click();

            // 2. Start flow
            const playBtn = await page.$('.btn-primary.btn-lg.w-100');
            if (playBtn) await playBtn.click();
            
            try {
                await page.waitForSelector('button.btn-primary', { timeout: 5000 });
                await page.click('button.btn-primary'); // Start Game
                
                await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 5000 });
                
                const startNowBtn = await page.$('.btn-pink.mr-3.btn-lg');
                if (startNowBtn) await startNowBtn.click();
                
                // Short wait for leaderboard data to populate
                await new Promise(resolve => setTimeout(resolve, 1500)); 
            } catch (e) {
                // If game start fails, reload page and skip to next server
                await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
                continue;
            }

            // 3. Open Leaderboard
            const trophyBtn = await page.$('.bar-button .fa-trophy');
            if (trophyBtn) {
                await trophyBtn.click();
                try {
                    await page.waitForSelector('.utility-ranks .list', { timeout: 3000 });
                    
                    // 4. Extract data
                    const serverScores = await page.evaluate((excludeName) => {
                        const scores = [];
                        const list = document.querySelector('.utility-ranks .list');
                        if (!list) return scores;

                        list.querySelectorAll('.rank-item').forEach(item => {
                            if (item.classList.contains('text-yellow')) return; 
                            const name = item.querySelector('.name')?.textContent.trim();
                            const score = item.querySelector('.score')?.textContent.trim();
                            if (name && score && name !== excludeName) {
                                scores.push({ name, score });
                            }
                        });
                        return scores;
                    }, PLAYER_NAME_TO_EXCLUDE);
                    
                    // 5. Merge
                    serverScores.forEach(entry => {
                        const currentScore = parseScore(entry.score);
                        const existingScore = combinedLeaderboard.get(entry.name) || 0;
                        if (currentScore > existingScore) combinedLeaderboard.set(entry.name, currentScore);
                    });
                } catch (e) {
                    console.error(`Leaderboard failed for ${location}: ${e.message}`);
                }
            }

            // 6. Reset for next loop
            await page.goto(BASE_URL, { waitUntil: 'networkidle0' });
            try {
                await page.waitForSelector(nameInputSelector, { timeout: 5000 });
            } catch (e) {
                // If we can't get back to home, stop scraping
                break;
            }
        }

        // 7. Sort and Format
        const finalRankings = Array.from(combinedLeaderboard.entries())
            .map(([name, score]) => ({ name, score }))
            .sort((a, b) => b.score - a.score); 

        return finalRankings.map(rank => `${rank.name}, ${rank.score.toLocaleString('en-US')}`).join('\n');

    } catch (error) {
        console.error('Scraping Error:', error);
        return `Error: ${error.message}`;
    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { getPlayerScores };
