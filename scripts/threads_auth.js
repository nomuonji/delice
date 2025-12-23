const gas = require('./gas_db');
const axios = require('axios');
require('dotenv').config();

const TABLE_NAME = 'threads_auth';
// Updated Initial Token
const INITIAL_TOKEN = process.env.THREADS_INITIAL_TOKEN;

// Threads API for Refresh
const THREADS_REFRESH_URL = 'https://graph.threads.net/refresh_access_token';

async function ensureTable() {
    const data = await gas.getTableData(TABLE_NAME);
    if (!data || data.status === 'error' || (data.data && data.data.length === 0)) {
        console.log(`Table ${TABLE_NAME} might not exist or is empty. Initializing...`);
        try {
            await gas.createTable(TABLE_NAME, ['id', 'access_token', 'last_updated']);
            console.log('Created threads_auth table.');

            await gas.createRecord(TABLE_NAME, {
                access_token: INITIAL_TOKEN,
                last_updated: new Date().toISOString()
            });
            console.log('Inserted initial token.');
        } catch (e) {
            console.warn('Initialization warning (table might already exist):', e.message);
        }
    }
}

async function getAccessToken() {
    await ensureTable();

    // Fetch all records, do not rely on ID
    const result = await gas.getTableData(TABLE_NAME);
    let record = null;

    // Logic to find the first record
    if (result && result.data && Array.isArray(result.data) && result.data.length > 0) {
        record = result.data[0];
    } else if (Array.isArray(result) && result.length > 0) {
        record = result[0];
    }

    if (!record) {
        console.warn('Token record not found in DB. Using initial hardcoded token.');
        return INITIAL_TOKEN;
    }

    const token = record.access_token || record.data?.access_token;
    const lastUpdated = record.last_updated || record.data?.last_updated;
    const recordId = record.id; // Important for update

    if (shouldRefresh(lastUpdated)) {
        console.log('Token is old. Refreshing...');
        const newToken = await refreshThreadsToken(token);
        if (newToken) {
            await gas.updateRecord(TABLE_NAME, recordId, {
                access_token: newToken,
                last_updated: new Date().toISOString()
            });
            return newToken;
        }
    }

    return token;
}

function shouldRefresh(lastUpdatedStr) {
    if (!lastUpdatedStr) return true;
    const last = new Date(lastUpdatedStr);
    const now = new Date();
    const diffDays = (now - last) / (1000 * 60 * 60 * 24);
    return diffDays > 10;
}

async function refreshThreadsToken(expiredToken) {
    try {
        const response = await axios.get(THREADS_REFRESH_URL, {
            params: {
                grant_type: 'th_refresh_token',
                access_token: expiredToken
            }
        });

        if (response.data && response.data.access_token) {
            console.log('Threads token refreshed successfully.');
            return response.data.access_token;
        }
    } catch (e) {
        console.error('Failed to refresh Threads token:', e.message);
        if (e.response) {
            console.error('Response:', e.response.data);
        }
    }
    return null;
}

module.exports = {
    getAccessToken
};
