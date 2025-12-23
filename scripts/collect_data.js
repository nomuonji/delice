const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const gas = require('./gas_db');

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

    // Authenticate using GAS DB Data
    console.log('Fetching auth session from GAS DB...');
    const result = await gas.getTableData('threads_auth'); // Using the same table name as agreed
    const RECORD_ID = 'delice_website_session';

    let storageState = undefined;
    let authRecord = null;

    if (result && result.data && Array.isArray(result.data)) {
        authRecord = result.data.find(r => r.id === RECORD_ID);
    } else if (Array.isArray(result)) {
        // Fallback for different response structures
        authRecord = result.find(r => r.id === RECORD_ID);
    }

    if (authRecord && authRecord.access_token) {
        try {
            storageState = JSON.parse(authRecord.access_token);
            console.log('Successfully loaded auth session from GAS DB.');
        } catch (e) {
            console.error('Failed to parse auth data from GAS DB:', e.message);
            // Fallback to local auth.json if strictly needed, but better to fail if remote auth is expected
        }
    } else {
        console.warn('Auth record not found in GAS DB. Checking local file...');
    }

    // Fallback: Check for local auth.json
    if (!storageState && fs.existsSync(AUTH_FILE)) {
        console.log('Using local auth.json file.');
        storageState = AUTH_FILE;
    }

    // We launch browser anyway; if no state, it's a fresh session that will likely fail auth check and trigger login
    const browser = await chromium.launch({ headless: true });

    // Login Function
    async function performLogin(browserInstance) {
        console.log('Performing automated login...');

        if (!process.env.DELICE_EMAIL || !process.env.DELICE_PASSWORD) {
            throw new Error('DELICE_EMAIL and DELICE_PASSWORD must be set in env for auto-login.');
        }

        const loginContext = await browserInstance.newContext();
        const loginPage = await loginContext.newPage();

        try {
            // Adjust login URL as needed (assuming standard login page or flow)
            await loginPage.goto('https://delice.love/login'); // Default guess or use top page

            // Wait for inputs
            // Try to find selectors - common ones are input[type="text"], input[type="password"]
            // Or specific names if known. Giving best effort based on "delice.love".
            // If it redirects to top or has button, handle it.

            // Let's assume standard form
            // Check if we are already logged in? (unlikely if called here)

            // Fill form
            // NOTE: Selectors are GUESSES. If site structure is specific, user might need to adjust.
            // Using generic robust selectors if possible.
            // Actually, for "delice.love", it might be a button click to open modal or separate page.

            // Waiting for login form elements
            // IMPORTANT: User provided 'ちょんまげ' as Username and 'EwezZDZck3' as Password.
            // Often sites use Email address. But here user said Username.

            // Handle possible age verification modal which blocks interaction
            try {
                const agreeButton = loginPage.locator('button:has-text("同意する")');
                if (await agreeButton.isVisible({ timeout: 5000 })) {
                    console.log('Found age verification modal. Clicking "Agree"...');
                    await agreeButton.click();
                    await loginPage.waitForTimeout(1000);
                }
            } catch (e) {
                console.log('No age verification modal found or interactable.');
            }

            const usernameInput = loginPage.locator('input[name="tel"]').first();
            const passwordInput = loginPage.locator('input[name="password"]').first();
            const submitButton = loginPage.locator('button[type="submit"]').first();

            await usernameInput.fill(process.env.DELICE_EMAIL);
            await passwordInput.fill(process.env.DELICE_PASSWORD);
            // Force click to bypass potential overlays (cookie banners, etc.)
            await submitButton.click({ force: true });

            await loginPage.waitForNavigation({ waitUntil: 'networkidle' });

            // Check success? 
            // Save state
            const newState = await loginContext.storageState();

            // Upload to GAS DB
            console.log('Login successful. Saving new session to GAS DB...');
            const jsonStr = JSON.stringify(newState);

            if (authRecord) {
                await gas.updateRecord('threads_auth', RECORD_ID, {
                    access_token: jsonStr,
                    last_updated: new Date().toISOString()
                });
            } else {
                await gas.createRecord('threads_auth', {
                    id: RECORD_ID,
                    access_token: jsonStr,
                    last_updated: new Date().toISOString()
                });
            }

            return newState;

        } catch (e) {
            console.error('Auto-login failed:', e);
            throw e;
        } finally {
            await loginContext.close();
        }
    }

    let context = await browser.newContext({ storageState: storageState });
    let page = await context.newPage();

    try {
        console.log(`Navigating to ${NOTIFICATION_URL}`);
        const response = await page.goto(NOTIFICATION_URL);
        await page.waitForTimeout(5000);

        // Check for redirect to login or auth failure
        const url = page.url();
        console.log('Current URL:', url);

        let needsLogin = false;
        if (url.includes('/login') || url.includes('signin')) {
            needsLogin = true;
        }

        // Also check if __NEXT_DATA__ exists (if not, maybe not logged in properly or error page)
        const hasNextData = await page.evaluate(() => !!document.getElementById('__NEXT_DATA__'));

        if (!hasNextData && !needsLogin) {
            console.warn('Page loaded but __NEXT_DATA__ missing. Possible auth issue.');
            needsLogin = true;
        }

        if (needsLogin) {
            console.log('Session expired or invalid. Initiating auto-login...');
            await context.close(); // Close old context

            const newState = await performLogin(browser);

            // Re-open context with new state
            context = await browser.newContext({ storageState: newState });
            page = await context.newPage();

            console.log(`Retrying navigation to ${NOTIFICATION_URL}`);
            await page.goto(NOTIFICATION_URL);
            await page.waitForTimeout(5000);
        }

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

        // Limit to last 500 items to prevent infinite growth
        if (currentItems.length > 500) {
            console.log('Trimming items to last 500...');
            // In case we want to be extra safe and only trim processed ones, we could do more complex logic.
            // But 500 is plenty of buffer (20+ days of backlog).
            // We strip from the start (oldest).
            currentItems.splice(0, currentItems.length - 500);
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
