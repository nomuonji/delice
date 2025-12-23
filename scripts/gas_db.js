const axios = require('axios');
require('dotenv').config();

const GAS_API_URL = process.env.GAS_DB_API_URL;

if (!GAS_API_URL) {
    console.error('Environment variable GAS_DB_API_URL is not set.');
}

const client = axios.create({
    headers: { 'Content-Type': 'text/plain' }, // As per user instruction
    maxRedirects: 5
});

// Wrapper to handle 302 redirects if axios follows them automatically but GAS requires specific handling?
// Axios follows redirects by default. The user notes 'redirect: "follow"' for fetch. Axios does this.
// Content-Type: text/plain is key.

async function createTable(tableName, headers) {
    try {
        const response = await client.post(GAS_API_URL, JSON.stringify({
            action: 'create_table',
            tableName: tableName,
            headers: headers
        }));
        return response.data;
    } catch (error) {
        console.error('GAS DB createTable error:', error.message);
        throw error;
    }
}

async function getTableData(tableName, id = null) {
    try {
        let url = `${GAS_API_URL}?table=${tableName}`;
        if (id) {
            url += `&id=${id}`;
        }
        const response = await client.get(url);
        return response.data;
    } catch (error) {
        // If table doesn't exist, it might return error or empty. 
        console.error('GAS DB getTableData error:', error.message);
        return null; // or throw
    }
}

async function createRecord(tableName, data) {
    try {
        const response = await client.post(GAS_API_URL, JSON.stringify({
            action: 'create',
            table: tableName,
            data: data
        }));
        return response.data;
    } catch (error) {
        console.error('GAS DB createRecord error:', error.message);
        throw error;
    }
}

async function updateRecord(tableName, id, data) {
    try {
        const response = await client.post(GAS_API_URL, JSON.stringify({
            action: 'update',
            table: tableName,
            id: id,
            data: data
        }));
        return response.data;
    } catch (error) {
        console.error('GAS DB updateRecord error:', error.message);
        throw error;
    }
}

module.exports = {
    createTable,
    getTableData,
    createRecord,
    updateRecord
};
