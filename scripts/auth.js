const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: false }); // Headless false to allow manual interaction
  const context = await browser.newContext();
  const page = await context.newPage();

  console.log('Navigating to login page...');
  await page.goto('https://delice.love/');

  console.log('Please log in manually in the browser window.');
  console.log('Press Enter in this terminal when you have successfully logged in and are on the dashboard.');

  // Wait for user input to confirm login
  await new Promise(resolve => process.stdin.once('data', resolve));

  // Save storage state to auth.json temporarily
  const authFile = path.join(__dirname, '../auth.json');
  await context.storageState({ path: authFile });
  console.log(`Session saved to ${authFile}`);

  // Read the file, convert to base64, and save to .env
  const fs = require('fs');
  const authContent = fs.readFileSync(authFile);
  const authBase64 = authContent.toString('base64');
  const envPath = path.join(__dirname, '../.env');

  let envContent = '';
  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
  }

  // Update or append AUTH_JSON_BASE64
  const key = 'AUTH_JSON_BASE64';
  const newLine = `${key}=${authBase64}`;

  if (envContent.includes(key + '=')) {
    // Replace existing key using regex to handle potential multi-line matching issues safely
    const regex = new RegExp(`${key}=.*`, 'g');
    envContent = envContent.replace(regex, newLine);
  } else {
    // Append if not exists
    envContent += `\n${newLine}\n`;
  }

  fs.writeFileSync(envPath, envContent);
  console.log(`Session encoded and saved to .env as ${key}`);

  // Clean up temporary auth.json if desired, but keeping it is fine for local verification
  // fs.unlinkSync(authFile); 

  await browser.close();
  process.exit(0);
})();
