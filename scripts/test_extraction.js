const { chromium } = require('playwright');
const path = require('path');

(async () => {
    console.log('Starting extraction test...');

    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();

    // Load the local mock file
    const mockFile = path.join(__dirname, '../mock_data/notification.html');
    const fileUrl = `file://${mockFile}`;

    console.log(`Loading mock page: ${fileUrl}`);
    await page.goto(fileUrl);

    // Extraction Logic (Copied and adapted from scrape_and_tweet.js)
    // We use 'text=' locator to find the anchor text
    const notificationItems = page.locator('text=▼無修正紹介動画▼');
    const count = await notificationItems.count();
    console.log(`Found ${count} element(s) matching initial text criteria.`);

    const newItems = [];

    for (let i = 0; i < count; i++) {
        const item = notificationItems.nth(i);

        // Attempt to get the container text. 
        // In the mock, the text node is inside a <p>, so .closest('li') or 'div' or 'p' should work.
        // We try to grab a sufficiently large container (li or p) to ensure we get the siblings (link, stats).
        // Using evaluate to get innerText of the block containing the keyword.

        const elementText = await item.evaluate(el => {
            // Try to find a container that has more text
            const container = el.closest('li') || el.closest('p') || el.parentElement;
            return container ? container.innerText : el.innerText;
        });

        console.log(`--- Item ${i + 1} Text Content ---\n${elementText}\n------------------------`);

        // Extract Link
        const linkMatch = elementText.match(/https:\/\/delice\.love\/movie\/\d+\?openExternalBrowser=1/);
        const link = linkMatch ? linkMatch[0] : null;

        // Extract Details
        const nameMatch = elementText.match(/名前：(\S+)/);
        const ageMatch = elementText.match(/年齢：(\d+)/);
        const heightMatch = elementText.match(/身長：(\d+)/);
        const bustMatch = elementText.match(/バスト：(\w+)/);

        if (link && nameMatch) {
            const data = {
                link: link,
                name: nameMatch[1],
                age: ageMatch ? ageMatch[1] : '?',
                height: heightMatch ? heightMatch[1] : '?',
                bust: bustMatch ? bustMatch[1] : '?'
            };
            newItems.push(data);
        } else {
            console.log(`Item ${i + 1}: Failed to extract all fields. Link: ${!!link}, Name: ${!!nameMatch}`);
        }
    }

    console.log('\n=== Extraction Results ===');
    console.log(JSON.stringify(newItems, null, 2));

    if (newItems.length > 0) {
        console.log('SUCCESS: Data extracted correctly.');
    } else {
        console.error('FAILURE: No data extracted.');
    }

    await browser.close();
})();
