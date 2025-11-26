// Stability-Optimized Scraper for Vercel — Option B (Most Reliable)
// Updated: dynamically finds the player name input (supports #playername,
// input.name-input, or input[id^="__BVID__"]).

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const BASE_URL = "https://stabfish2.io";
const PLAYER_NAME_TO_EXCLUDE = "Lost";
const TARGET_SERVER_LOCATIONS = ["Silicon Valley", "Dallas", "Toronto"];

// ---------- Helpers ----------
function parseScore(scoreStr) {
    return parseInt(scoreStr.replace(/,/g, ''), 10);
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------- Safe Navigation ----------
async function safeGoto(page, url) {
    for (let i = 1; i <= 4; i++) {
        try {
            console.log(`safeGoto attempt ${i} → ${url}`);

            await page.goto(url, {
                waitUntil: "domcontentloaded",
                timeout: 15000
            });

            await sleep(500);
            return;
        } catch (err) {
            console.error(`safeGoto attempt ${i} failed: ${err.message}`);

            if (err.message.includes("frame was detached") || err.message.includes("LifecycleWatcher")) {
                await sleep(400);
                continue;
            }

            if (i === 4) throw err;
        }
    }
}

// ---------- Find name input (robust to dynamic ids) ----------
const NAME_INPUT_SELECTOR = '#playername, input.name-input, input[id^="__BVID__"]';

async function waitForNameInput(page, timeout = 8000) {
    // Try waiting for any of the expected selectors
    try {
        await page.waitForSelector(NAME_INPUT_SELECTOR, { timeout });
        return NAME_INPUT_SELECTOR;
    } catch (err) {
        // not found within this timeout
        return null;
    }
}

// Query and return an ElementHandle for the active name input (or null)
async function getNameInputHandle(page) {
    // Prefer stable #playername if present
    let handle = await page.$('#playername');
    if (handle) return handle;

    // Next prefer class-based selector
    handle = await page.$('input.name-input');
    if (handle) return handle;

    // Finally any __BVID__ prefixed id
    handle = await page.$('input[id^="__BVID__"]');
    if (handle) return handle;

    return null;
}

// ---------- Hard Reload Home Screen Recovery ----------
async function waitForHomeScreen(page) {
    for (let attempt = 1; attempt <= 5; attempt++) {
        try {
            console.log(`waitForHomeScreen attempt ${attempt}`);

            const selector = await waitForNameInput(page, 6000);
            if (selector) {
                // Ensure the element handle is actually present and visible
                const h = await getNameInputHandle(page);
                if (h) return; // success
            }
        } catch (err) {
            console.log(`waitForHomeScreen catch: ${err.message}`);
        }

        console.log(`Home screen not ready, reloading (${attempt})`);
        await safeGoto(page, BASE_URL);
        await sleep(500);
    }

    throw new Error("Home screen never loaded (name input missing)");
}

// ---------- Safe Click Wrapper ----------
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

// ---------- Type name safely into discovered input ----------
async function typePlayerName(page, name) {
    const handle = await getNameInputHandle(page);
    if (!handle) throw new Error("No name input handle to type into");

    try {
        // Clear existing value then type
        await page.evaluate(el => { el.value = ''; }, handle);
        // Some inputs require focus before typing
        await handle.focus();
        // Use page.keyboard.type to be safe if page.type selector would be unreliable
        await page.keyboard.type(name, { delay: 1 });
        await sleep(100);
    } catch (err) {
        // fallback to page.type with the NAME_INPUT_SELECTOR if the handle path fails
        console.warn("typePlayerName: fallback to page.type, error:", err.message);
        await page.type(NAME_INPUT_SELECTOR, name);
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

        // Load homepage + recover if input is missing
        await safeGoto(page, BASE_URL);
        await waitForHomeScreen(page);

        // Enter name (robust)
        console.log("Typing player name...");
        await typePlayerName(page, PLAYER_NAME_TO_EXCLUDE);

        // ----- LOOP: For each server -----
        for (const location of TARGET_SERVER_LOCATIONS) {
            console.log(`\n=== SERVER: ${location} ===`);

            // Open server selector
            await safeClick(page, ".btn-pink.w-100.funny-rounded");
            await sleep(300);

            // Find server entry in modal
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
            await page.evaluate((serverName) => {
                const items = [...document.querySelectorAll(".server-data")];
                const target = items.find(i =>
                    i.querySelector(".name")?.textContent.trim() === serverName
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
                    const arr = [];
                    const rows = document.querySelectorAll(".rank-item");

                    rows.forEach(row => {
                        if (row.classList.contains("text-yellow")) return;

                        const name = row.querySelector(".name")?.textContent?.trim();
                        const score = row.querySelector(".score")?.textContent?.trim();
                        if (name && score && name !== excludeName) {
                            arr.push({ name, score });
                        }
                    });

                    return arr;
                }, PLAYER_NAME_TO_EXCLUDE);

                // Merge leaderboard
                for (const entry of entries) {
                    const score = parseScore(entry.score);
                    const old = leaderboard.get(entry.name) || 0;
                    if (score > old) leaderboard.set(entry.name, score);
                }

            } catch (err) {
                console.error(`Leaderboard failed for ${location}:`, err.message);
            }

            // Return to home screen for next server
            await safeGoto(page, BASE_URL);
            await waitForHomeScreen(page);

            // Reset input and retype
            const h = await getNameInputHandle(page);
            if (h) {
                await page.evaluate(el => { el.value = ''; }, h);
                await typePlayerName(page, PLAYER_NAME_TO_EXCLUDE);
            } else {
                // if input vanished unexpectedly, attempt recovery next loop iteration
                console.warn('Name input vanished after returning home; will try recovery on next loop.');
            }
        }

        // Convert results to plain text
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
