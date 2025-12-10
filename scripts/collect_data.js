const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const AUTH_FILE = path.join(__dirname, '../auth.json');
const DATA_FILE = path.join(__dirname, '../data/items.json');
const NOTIFICATION_URL = 'https://delice.love/mypage/notification?openedNotificationIds=%2C1';

async function loadData() {
    if (fs.existsSync(DATA_FILE)) {
        try {
            const content = fs.readFileSync(DATA_FILE, 'utf8');
            if (!content.trim()) return [];
            return JSON.parse(content);
        } catch (e) {
            console.warn('Failed to parse items.json, resetting to empty array:', e.message);
            return [];
        }
    }
    return [];
}

async function saveData(data) {
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

(async () => {
    console.log('Starting data collection...');

    require('dotenv').config();

    // Check for auth info in Env or File
    if (!process.env.AUTH_JSON_BASE64 && !fs.existsSync(AUTH_FILE)) {
        console.error('Auth session not found! Set AUTH_JSON_BASE64 env var or run "npm run auth".');
        process.exit(1);
    }

    // Restore auth.json from env var if it exists (prioritize env var)
    if (process.env.AUTH_JSON_BASE64) {
        try {
            const buffer = Buffer.from(process.env.AUTH_JSON_BASE64, 'base64');
            fs.writeFileSync(AUTH_FILE, buffer);
            console.log('Restored auth.json from environment variable.');
        } catch (e) {
            console.error('Failed to decode AUTH_JSON_BASE64:', e);
            process.exit(1);
        }
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ storageState: AUTH_FILE });
    const page = await context.newPage();

    try {
        console.log(`Navigating to ${NOTIFICATION_URL}`);
        await page.goto(NOTIFICATION_URL);
        await page.waitForTimeout(5000);

        // DEBUG: Verify page state
        await page.screenshot({ path: path.join(__dirname, '../debug_collect.png') });
        const content = await page.content();
        fs.writeFileSync(path.join(__dirname, '../debug_collect.html'), content);
        console.log('Saved debug_collect.png and debug_collect.html');

        // Extract data from __NEXT_DATA__
        const nextData = await page.evaluate(() => {
            const script = document.getElementById('__NEXT_DATA__');
            if (!script) return null;
            return JSON.parse(script.innerText);
        });

        if (!nextData) {
            throw new Error('Could not find __NEXT_DATA__ on the page.');
        }

        let notifications = [];
        try {
            const queries = nextData.props.pageProps.dehydratedState.queries;
            for (const query of queries) {
                if (query.state?.data?.pages?.[0]?.data) {
                    const pageData = query.state.data.pages[0].data;
                    if (Array.isArray(pageData) && pageData.length > 0 && pageData[0].title) {
                        notifications = pageData;
                        break;
                    }
                }
            }
        } catch (e) {
            console.error('Error traversing __NEXT_DATA__ structure:', e);
        }

        console.log(`Found ${notifications.length} notifications in raw data.`);

        const currentItems = await loadData();
        let addedCount = 0;

        for (const item of notifications) {
            const elementText = item.detail || '';

            const linkMatch = elementText.match(/https:\/\/delice\.love\/movie\/\d+\?openExternalBrowser=1/);
            const link = linkMatch ? linkMatch[0] : null;

            if (!link) continue;

            // Check for duplicates
            const exists = currentItems.some(existing => existing.id === link);
            if (exists) continue;

            const nameMatch = elementText.match(/名前[:：\s]*(\S+)/);
            const ageMatch = elementText.match(/年齢[:：\s]*(\d+)/);
            const heightMatch = elementText.match(/身長[:：\s]*(\d+)/);
            const bustMatch = elementText.match(/バスト[:：\s]*(\w+)/);

            if (nameMatch) {
                const newItem = {
                    id: link, // Unique ID is the link
                    link: link,
                    name: nameMatch[1],
                    age: ageMatch ? ageMatch[1] : '?',
                    height: heightMatch ? heightMatch[1] : '?',
                    bust: bustMatch ? bustMatch[1] : '?',
                    notification_date: item.send_date || null, // Extract notification date
                    collected_at: new Date().toISOString(),
                    tweeted_at: null // Initialize as not tweeted
                };

                currentItems.push(newItem);
                addedCount++;
                console.log(`New item found: ${newItem.name} (Date: ${newItem.notification_date})`);
            }
        }

        await saveData(currentItems);
        console.log(`Collection complete. Added ${addedCount} new items. Total items: ${currentItems.length}`);

    } catch (error) {
        console.error('Error during data collection:', error);
        process.exit(1);
    } finally {
        await browser.close();
    }
})();
