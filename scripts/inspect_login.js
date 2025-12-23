const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('https://delice.love/login');

    // Dump HTML to inspect selectors
    const content = await page.content();
    console.log(content);

    await browser.close();
})();
