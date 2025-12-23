const { chromium } = require('playwright');
const gas = require('./gas_db');
require('dotenv').config();

const TABLE_NAME = 'threads_auth';
const RECORD_ID = 'delice_website_session';

(async () => {
    console.log('--- Manual Login & Session Upload ---');

    // Need credentials
    if (!process.env.DELICE_EMAIL || !process.env.DELICE_PASSWORD) {
        console.error('Error: DELICE_EMAIL and DELICE_PASSWORD must be set in .env');
        process.exit(1);
    }

    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    try {
        console.log('Navigating to login page...');
        await page.goto('https://delice.love/login');

        // --- Added: Handle Age Verification Modal ---
        // The modal blocks interaction. The "Agree" button must be clicked.
        // Selector strategy: Look for button with text "同意する" inside thechakra-portal or general button.
        try {
            const agreeButton = page.locator('button:has-text("同意する")');
            if (await agreeButton.isVisible({ timeout: 5000 })) {
                console.log('Found age verification modal. Clicking "Agree"...');
                await agreeButton.click();
                await page.waitForTimeout(1000); // Wait for modal to fade
            }
        } catch (e) {
            console.log('No age verification modal found or interactable.');
        }

        console.log('Filling credentials...');
        await page.fill('input[name="tel"]', process.env.DELICE_EMAIL);
        await page.fill('input[name="password"]', process.env.DELICE_PASSWORD);

        console.log('Submitting form...');
        await page.click('button[type="submit"]');

        // Wait for navigation to mypage or similar
        // Adjust timeout if needed
        await page.waitForNavigation({ waitUntil: 'networkidle', timeout: 30000 });

        // Verify login success by checking url or content
        const url = page.url();
        console.log('Post-login URL:', url);

        if (url.includes('login')) {
            throw new Error('Login might have failed, still on login page.');
        }

        console.log('Login successful! Capturing session state...');
        const storageState = await context.storageState();
        const jsonStr = JSON.stringify(storageState);

        console.log(`Session captured (${jsonStr.length} bytes). Uploading to GAS DB...`);

        // Upload logic
        const result = await gas.getTableData(TABLE_NAME);
        let exists = false;

        let records = [];
        if (result && result.data && Array.isArray(result.data)) {
            records = result.data;
        } else if (Array.isArray(result)) {
            records = result.data || result; // handle potential structure variations
        }

        if (Array.isArray(records)) {
            exists = records.some(r => r.id === RECORD_ID);
        }

        if (exists) {
            console.log('Updating existing record...');
            await gas.updateRecord(TABLE_NAME, RECORD_ID, {
                access_token: jsonStr,
                last_updated: new Date().toISOString()
            });
        } else {
            console.log('Creating new record...');
            // If createRecord expects an object with id in it or separate ID arg depends on implementation.
            // Based on gas_db.js usage in other files:
            await gas.createRecord(TABLE_NAME, {
                id: RECORD_ID,
                access_token: jsonStr,
                last_updated: new Date().toISOString()
            });
        }

        console.log('Session successfully uploaded to GAS DB!');

    } catch (e) {
        console.error('Operation failed:', e.message);
        // Clean screenshot on failure would be nice but headless
    } finally {
        await browser.close();
    }
})();
