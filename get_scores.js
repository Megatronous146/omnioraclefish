// Stability-Optimized Scraper for Vercel — Option B (Most Reliable)
// VERSION WITHOUT NAME INPUT — Home screen detection kept

const chromium = require('@sparticuz/chromium');
const puppeteer = require('puppeteer-core');

const BASE_URL = "https://stabfish2.io";
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

            if (err.message.includes("frame was detached") ||
                err.message.includes("LifecycleWatcher")) {
                await sleep(400);
                continue;
            }

            if (i === 4) throw err;
        }
    }
}

// ---------- Home Screen Detector (NO NAME INPUT REQUIRED) ----------
async function waitForHomeScreen(page) {
    for (let attempt = 1; attempt <= 6; attempt++) {
        console.log(`waitForHomeScreen attempt ${attempt}`);

        try {
            // Detect ANY of the main home screen UI elements:
            const hasMenu = await page.$(".btn-pink.w-100.funny-rounded");
            const hasPlay = await page.$(".btn-primary.btn-lg.w-100");
            const hasBrand = await page.$(".navbar-brand");

            if (hasMenu || hasPlay || hasBrand) {
                console.log("Home screen detected.");
                await sleep(400);
                return;
            }
        } catch (err) {
            console.log("waitForHomeScreen error:", err.message);
        }

        console.log(`Home screen not detected — reloading (${attempt})`);
        await safeGoto(page, BASE_URL);
        await sleep(500);
    }

    throw new Error("Home screen never loaded (UI missing).");
}

// ---------- Safe Click ----------
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

        // Load & detect home screen
        await safeGoto(page, BASE_URL);
        await waitForHomeScreen(page);

        // ---------- For each server ----------
        for (const location of TARGET_SERVER_LOCATIONS) {
            console.log(`\n=== SERVER: ${location} ===`);

            // Open server modal
            await safeClick(page, ".btn-pink.w-100.funny-rounded");
            await sleep(300);

            // Find server entry
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

            // Click the server row
            await page.evaluate((serverName) => {
                const items = [...document.querySelectorAll(".server-data")];
                const target = items.find(i =>
                    i.querySelector(".name")?.textContent.trim() === serverName
                );
                if (target) target.click();
            }, fullServerName);

            await sleep(300);
            await safeClick(page, 'button[aria-label="Close"]');

            // Play → Start Game → Start Now
            await safeClick(page, ".btn-primary.btn-lg.w-100");
            await safeClick(page, "button.btn-primary");
            await safeClick(page, ".btn-pink.mr-3.btn-lg");

            await sleep(1200);

            // Leaderboard
            await safeClick(page, ".bar-button .fa-trophy");

            try {
                await page.waitForSelector(".utility-ranks .list", { timeout: 3000 });

                const entries = await page.evaluate(() => {
                    const arr = [];
                    const rows = document.querySelectorAll(".rank-item");

                    rows.forEach(row => {
                        if (row.classList.contains("text-yellow")) return;
                        const name = row.querySelector(".name")?.textContent?.trim();
                        const score = row.querySelector(".score")?.textContent?.trim();
                        if (name && score) arr.push({ name, score });
                    });

                    return arr;
                });

                for (const entry of entries) {
                    const score = parseScore(entry.score);
                    const old = leaderboard.get(entry.name) || 0;
                    if (score > old) leaderboard.set(entry.name, score);
                }

            } catch (err) {
                console.error(`Leaderboard failed for ${location}:`, err.message);
            }

            // Reset for next server
            await safeGoto(page, BASE_URL);
            await waitForHomeScreen(page);
        }

        // Format output
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
