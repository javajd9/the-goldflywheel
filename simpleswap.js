const axios = require('axios');
const config = require('./config');

const API_BASE = 'https://api.simpleswap.io/v3';

async function createExchange(fromTicker, toTicker, fromNetwork, toNetwork, amount, addressTo, refundAddress) {
    console.log('\n--- SIMPLESWAP EXCHANGE START ---');
    console.log(`   From: ${amount} ${fromTicker.toUpperCase()} (${fromNetwork})`);
    console.log(`   To: ${toTicker.toUpperCase()} (${toNetwork})`);
    console.log(`   Destination: ${addressTo}`);
    console.log(`   Refund Address: ${refundAddress}`);
    console.log(`   API Key configured: ${config.simpleswap.apiKey ? 'YES (hidden)' : 'NO'}`);

    try {
        const payload = {
            fixed: false,
            currencyAround: fromTicker,
            currencyFrom: fromTicker,
            currencyTo: toTicker,
            amount: amount,
            networkFrom: fromNetwork,
            networkTo: toNetwork,
            addressTo: addressTo,
            extraIdTo: '',
            userRefundAddress: refundAddress,
            userRefundExtraId: '',
        };

        console.log('   Request Payload:', JSON.stringify(payload, null, 2));
        console.log('   Sending request to SimpleSwap API...');

        const response = await axios.post(`${API_BASE}/exchanges`, payload, {
            params: {
                api_key: config.simpleswap.apiKey,
            },
        });

        console.log(`   Response Status: ${response.status}`);
        const data = response.data;
        console.log('   Response Data:', JSON.stringify(data, null, 2));

        console.log(`   SUCCESS: Exchange created!`);
        console.log(`   Exchange ID: ${data.id}`);
        console.log(`   Deposit Address: ${data.address_from}`);
        console.log(`   Expected Amount: ${data.amount_to} ${toTicker.toUpperCase()}`);
        console.log('--- SIMPLESWAP EXCHANGE END (SUCCESS) ---\n');

        return {
            success: true,
            id: data.id,
            depositAddress: data.address_from,
            amountExpectedTo: data.amount_to,
            status: data.status,
        };

    } catch (error) {
        console.error('   FAILED: SimpleSwap API Error');
        console.error('   Status:', error.response?.status);
        console.error('   Response:', JSON.stringify(error.response?.data, null, 2) || error.message);
        console.log('--- SIMPLESWAP EXCHANGE END (FAILED) ---\n');
        return { success: false, error: error.response?.data?.message || error.message };
    }
}

module.exports = {
    createExchange,
};
