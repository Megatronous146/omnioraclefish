// Stability-Optimized Scraper for Vercel — Option B (Most Reliable)
// Updated: replace page.waitForTimeout(...) with a safe sleep(...) helper
// to avoid "page.waitForTimeout is not a function" in some puppeteer-core builds.

// Chromium for serverless
const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

// Config
const BASE_URL = "https://stabfish2.io";
const PLAYER_NAME_TO_EXCLUDE = "Lost";
const TARGET_SERVER_LOCATIONS = ["Silicon Valley", "Dallas", "Toronto"];

// Helper to convert "123,456" → 123456
function parseScore(scoreStr) {
    return parseInt(scoreStr.replace(/,/g, ''), 10);
}

// Simple sleep helper (works everywhere)
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- SAFE NAVIGATION (Fix for frame detachment) ----------
async function safeGoto(page, url) {
    for (let i = 1; i <= 4; i++) {
        try {
            console.log(`safeGoto attempt ${i} →`, url);

            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: 15000
            });

            // buffer — stabfish reloads the frame after DOM load
            await sleep(500);

            return; // success
        } catch (err) {
            console.error(`safeGoto attempt ${i} failed: ${err.message}`);

            if (
                err.message.includes("frame was detached") ||
                err.message.includes("LifecycleWatcher")
            ) {
                // retry
                await sleep(400);
                continue;
            }

            if (i === 4) throw err;
        }
    }
}

// ---------- SAFE CLICK ----------
async function safeClick(page, selector) {
    try {
        await page.waitForSelector(selector, { timeout: 5000 });
        await page.click(selector);
        await sleep(250);
        return true;
    } catch (err) {
        console.error(`safeClick failed (${selector}):`, err.message);
        return false;
    }
}

// ---------- MAIN SCRAPER ----------
async function getPlayerScores() {
    let browser;

    try {
        browser = await puppeteer.launch({
            args: [
                ...chromium.args,
                "--no-sandbox",
                "--disable-dev-shm-usage",
                "--single-process"
            ],
            defaultViewport: chromium.defaultViewport,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless,
            ignoreHTTPSErrors: true
        });

        const page = await browser.newPage();

        const leaderboard = new Map();

        // Load initial page safely
        await safeGoto(page, BASE_URL);

        // Enter name into text field
        await page.waitForSelector("#playername", { timeout: 8000 });
        await page.type("#playername", PLAYER_NAME_TO_EXCLUDE);

        // ----- LOOP: For each server -----
        for (const location of TARGET_SERVER_LOCATIONS) {
            console.log(`\n=== SERVER: ${location} ===`);

            // Open server selector
            await safeClick(page, ".btn-pink.w-100.funny-rounded");
            await sleep(300);

            // Look for the server in the modal
            const fullServerName = await page.evaluate((loc) => {
                const names = [...document.querySelectorAll(".server-data .name")];
                const match = names.find(n => n.textContent.trim().startsWith(loc));
                return match ? match.textContent.trim() : null;
            }, location);

            if (!fullServerName) {
                console.log(`Server not found: ${location}`);
                await safeClick(page, 'button[aria-label="Close"]');
                continue;
            }

            console.log("Found server:", fullServerName);

            // Click server row inside modal
            await page.evaluate((targetName) => {
                const items = [...document.querySelectorAll(".server-data")];
                const target = items.find(i =>
                    i.querySelector(".name")?.textContent.trim() === targetName
                );
                if (target) target.click();
            }, fullServerName);

            await sleep(300);

            // Close modal
            await safeClick(page, 'button[aria-label="Close"]');

            // ----- Start Game flow -----
            await safeClick(page, ".btn-primary.btn-lg.w-100"); // Play
            await safeClick(page, "button.btn-primary");        // Start Game
            await safeClick(page, ".btn-pink.mr-3.btn-lg");     // Start Now

            await sleep(1200); // buffer for game UI to spawn

            // ----- Leaderboard -----
            await safeClick(page, ".bar-button .fa-trophy");

            try {
                await page.waitForSelector(".utility-ranks .list", { timeout: 3000 });

                const entries = await page.evaluate((excludeName) => {
                    const out = [];
                    const rows = document.querySelectorAll(".rank-item");

                    rows.forEach(r => {
                        if (r.classList.contains("text-yellow")) return;

                        const name = r.querySelector(".name")?.textContent?.trim();
                        const score = r.querySelector(".score")?.textContent?.trim();
                        if (name && score && name !== excludeName) {
                            out.push({ name, score });
                        }
                    });

                    return out;
                }, PLAYER_NAME_TO_EXCLUDE);

                // Merge best scores
                for (const entry of entries) {
                    const num = parseScore(entry.score);
                    const prev = leaderboard.get(entry.name) || 0;
                    if (num > prev) leaderboard.set(entry.name, num);
                }

            } catch (e) {
                console.error(`Leaderboard failed for ${location}: ${e.message}`);
            }

            // Return to home page safely
            await safeGoto(page, BASE_URL);
            await page.waitForSelector("#playername", { timeout: 6000 });
            // clear & retype the name to be safe
            await page.evaluate(() => {
                const el = document.querySelector('#playername');
                if (el) el.value = '';
            });
            await page.type("#playername", PLAYER_NAME_TO_EXCLUDE, { delay: 1 });
        }

        // Convert map → text leaderboard
        const final = [...leaderboard.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([name, score]) => `${name}, ${score.toLocaleString()}`)
            .join("\n");

        return final || "No scores found.";

    } catch (err) {
        console.error("Scrape FAILED:", err);
        return "Error: " + err.message;

    } finally {
        if (browser) await browser.close();
    }
}

module.exports = { getPlayerScores };
