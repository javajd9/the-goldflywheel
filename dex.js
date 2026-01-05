const config = require('./config');
const axios = require('axios');
const rpc = require('./rpc');
const { VersionedTransaction } = require('@solana/web3.js');

let lastPrice = 2650.00;
let lastFetchTime = 0;
const CACHE_DURATION = 60 * 1000;

async function buyProjectCoin(solAmount) {
    console.log('Buying Project Coin via Jupiter...');
    console.log(`   SOL Amount: ${solAmount}`);
    console.log(`   Target Coin: ${config.tokens.projectCoinMint}`);

    if (config.tokens.projectCoinMint.includes('AddressHere')) {
        console.error('Project Coin Mint not configured in .env');
        return { success: false, error: 'mint_not_configured' };
    }

    try {
        const inputMint = 'So11111111111111111111111111111111111111112';
        const outputMint = config.tokens.projectCoinMint;
        const amountLamports = Math.floor(solAmount * 1e9);
        const slippageBps = 100;

        const quoteUrl = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amountLamports}&slippageBps=${slippageBps}`;
        const quoteResponse = await axios.get(quoteUrl);
        const quoteData = quoteResponse.data;

        if (!quoteData || quoteData.error) {
            throw new Error(`Jupiter Quote failed: ${quoteData?.error || 'No quote data'}`);
        }

        console.log(`   Quote received. Out: ${quoteData.outAmount / 1e6}`);

        const swapResponse = await axios.post('https://quote-api.jup.ag/v6/swap', {
            quoteResponse: quoteData,
            userPublicKey: rpc.getBotKeypair().publicKey.toString(),
            wrapAndUnwrapSol: true,
        });

        const { swapTransaction } = swapResponse.data;

        const swapTransactionBuf = Buffer.from(swapTransaction, 'base64');
        const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

        const signature = await rpc.sendAndConfirmVersionedTransaction(transaction);

        console.log(`Jupiter Swap Complete! Tx: ${signature}`);

        return {
            success: true,
            amountIn: solAmount,
            amountOut: Number(quoteData.outAmount),
            tokenIn: 'SOL',
            tokenOut: config.tokens.projectCoinMint,
            txHash: signature,
            pricePerCoin: solAmount / (Number(quoteData.outAmount) / 1e6),
        };

    } catch (error) {
        console.error('Jupiter Swap failed:', error.message);
        if (error.response) {
            console.error('   API Error:', JSON.stringify(error.response.data));
        }
        return { success: false, error: error.message };
    }
}

async function getGoldPrice() {
    const now = Date.now();
    if (now - lastFetchTime < CACHE_DURATION) {
        return lastPrice;
    }

    try {
        const response = await axios.get('https://api.coingecko.com/api/v3/simple/price?ids=tether-gold&vs_currencies=usd');
        if (response.data && response.data['tether-gold'] && response.data['tether-gold'].usd) {
            lastPrice = response.data['tether-gold'].usd;
            lastFetchTime = now;
            return lastPrice;
        } else {
            throw new Error('Invalid price data format');
        }
    } catch (error) {
        console.error('Price fetch error (using cache fallback):', error.message);
        return lastPrice;
    }
}

module.exports = {
    buyProjectCoin,
    getGoldPrice,
};
