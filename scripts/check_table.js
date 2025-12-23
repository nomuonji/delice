const gas = require('./gas_db');

(async () => {
    console.log('Checking tables...');
    try {
        // Since there isn't a direct "list tables" method exported in my helper but the API supports it
        // I'll assume the helper works or just check the specific table data directly.
        // Actually, my helper doesn't expose list tables.
        // Let's just try to get data from 'threads_auth'.

        console.log("Fetching data from 'threads_auth'...");
        const data = await gas.getTableData('threads_auth');

        console.log('Response from GAS API:');
        console.log(JSON.stringify(data, null, 2));

    } catch (e) {
        console.error('Error checking table:', e);
    }
})();
