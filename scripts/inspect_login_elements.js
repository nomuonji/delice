const { chromium } = require('playwright');

(async () => {
    const browser = await chromium.launch();
    const page = await browser.newPage();
    await page.goto('https://delice.love/login');
    await page.waitForTimeout(2000); // UI load

    const inputs = await page.$$eval('input', els => els.map(e => ({
        outerHTML: e.outerHTML,
        name: e.name,
        type: e.type,
        id: e.id,
        placeholder: e.placeholder
    })));

    const buttons = await page.$$eval('button', els => els.map(e => ({
        text: e.innerText,
        type: e.type
    })));

    console.log('INPUTS:', JSON.stringify(inputs, null, 2));
    console.log('BUTTONS:', JSON.stringify(buttons, null, 2));

    await browser.close();
})();
