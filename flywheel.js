const config = require('./config');
const db = require('./db');
const rpc = require('./rpc');
const simpleswap = require('./simpleswap');
const pumpportal = require('./pumpportal');
const eth = require('./eth');
const { Keypair } = require('@solana/web3.js');
const bs58 = require('bs58');

let nextFeeTime = null;
let nextRedeployTime = null;

let activeFeeInterval = 5 * 60 * 1000;
let activeRedeployInterval = 15 * 60 * 1000;

function initRelativeTimers() {
    const now = Date.now();
    nextFeeTime = now + activeFeeInterval;
    nextRedeployTime = now + activeRedeployInterval;
}

initRelativeTimers();

async function collectFeesAndBuyGold() {
    console.log('\n════════════════════════════════════════');
    console.log('COLLECTING FEES AND BUYING GOLD (XAUT/ETH)');
    console.log('════════════════════════════════════════');
    console.log(`${new Date().toISOString()}`);

    try {
        console.log('Step 0: Checking project configuration...');
        console.log(`   PumpPortal Configured: ${pumpportal.isPumpPortalConfigured()}`);

        if (pumpportal.isPumpPortalConfigured()) {
            console.log('   -> Attempting to collect PumpFun creator fees...');
            const pumpResult = await pumpportal.collectCreatorFees();
            console.log(`   -> PumpPortal Result:`, JSON.stringify(pumpResult, null, 2));

            if (pumpResult.success && pumpResult.txHash) {
                console.log(`   -> SUCCESS: Fees claimed, TX: ${pumpResult.txHash}`);
                await db.logEvent({
                    eventType: 'pumpfun_fee_claim',
                    txHash: pumpResult.txHash,
                    status: 'success',
                    metadata: { pool: pumpResult.pool, mint: pumpResult.mint },
                });

                if (config.creatorPrivateKey && config.creatorPrivateKey !== config.botPrivateKey) {
                    console.log('Step 0.5: Sweeping fees from Creator Wallet to Fee Vault...');
                    const creatorKeypair = Keypair.fromSecretKey(bs58.decode(config.creatorPrivateKey));
                    const creatorPubkey = creatorKeypair.publicKey.toString();
                    console.log(`   Creator Wallet: ${creatorPubkey}`);

                    const creatorBalance = await rpc.getSolBalance(creatorPubkey);
                    console.log(`   Creator Balance: ${creatorBalance} SOL`);
                    if (creatorBalance > 0.005) {
                        const amountToSweep = creatorBalance - 0.002;
                        console.log(`   -> Sweeping ${amountToSweep} SOL to Fee Vault...`);
                        const sweepTx = await rpc.transferSol(amountToSweep, config.wallets.feeVault, creatorKeypair);
                        console.log(`   -> Sweep TX: ${sweepTx}`);

                        await db.logEvent({
                            eventType: 'fee_sweep',
                            amountIn: amountToSweep,
                            tokenIn: 'SOL',
                            txHash: sweepTx,
                            status: 'success'
                        });
                    } else {
                        console.log(`   -> Skipping sweep: balance too low (${creatorBalance} SOL)`);
                    }
                } else {
                    console.log('   -> Skipping sweep: No separate creator wallet configured');
                }
            } else if (pumpResult.noFees) {
                console.log('   -> No fees available to claim (already claimed or none accrued)');
            } else if (!pumpResult.success && pumpResult.error) {
                console.log(`   -> FAILED: ${pumpResult.error}`);
                await db.logEvent({
                    eventType: 'system_error',
                    status: 'failed',
                    error_message: pumpResult.error,
                    metadata: { context: 'pumpportal_claim' }
                });
            }
        } else {
            console.log('   -> PumpPortal not configured, skipping fee claim');
        }

        console.log('\nStep 1: Checking Fee Vault balance...');
        console.log(`   Fee Vault Address: ${config.wallets.feeVault}`);
        const feeBalance = await rpc.getSolBalance(config.wallets.feeVault);
        console.log(`   Fee Vault Balance: ${feeBalance} SOL`);

        const reservedFees = 0.005;
        const amountToSwap = feeBalance - reservedFees;
        console.log(`   Reserved for gas: ${reservedFees} SOL`);
        console.log(`   Available to swap: ${amountToSwap} SOL`);

        if (amountToSwap <= 0.01) {
            console.log('   -> Insufficient fees to swap (need > 0.01 SOL), skipping...');
            await db.logEvent({
                eventType: 'system_notice',
                status: 'skipped',
                metadata: { reason: 'insufficient_fees', balance: feeBalance }
            });
            return { success: true, skipped: true, reason: 'insufficient_balance' };
        }

        console.log('\nStep 2: Creating SimpleSwap exchange...');
        console.log(`   From: ${amountToSwap} SOL (Solana)`);
        console.log(`   To: XAUT (Ethereum)`);
        console.log(`   Destination: ${config.ethereum.goldWallet}`);

        const event = await db.logEvent({
            eventType: 'fee_collection',
            amountIn: amountToSwap,
            tokenIn: 'SOL',
            status: 'pending',
        });
        console.log(`   Event logged (ID: ${event.id})`);

        const exchange = await simpleswap.createExchange(
            'sol', 'xaut', 'sol', 'eth',
            amountToSwap,
            config.ethereum.goldWallet,
            config.simpleswap.solRefundWallet
        );
        console.log(`   SimpleSwap Result:`, JSON.stringify(exchange, null, 2));

        if (!exchange.success) {
            console.log(`   -> FAILED: SimpleSwap exchange creation failed`);
            await db.updateEventStatus(event.id, 'failed', null, 'SimpleSwap create failed');
            throw new Error('SimpleSwap create failed: ' + (exchange.error || 'Unknown error'));
        }

        console.log('\nStep 3: Sending SOL to SimpleSwap deposit address...');
        console.log(`   Exchange ID: ${exchange.id}`);
        console.log(`   Deposit Address: ${exchange.depositAddress}`);
        console.log(`   Amount: ${amountToSwap} SOL`);

        const txHash = await rpc.transferSol(amountToSwap, exchange.depositAddress);
        console.log(`   -> TX Hash: ${txHash}`);

        await db.updateEventStatus(event.id, 'success', txHash);
        console.log(`   -> Event updated to success`);
        await db.logEvent({
            eventType: 'gold_purchase',
            amountIn: amountToSwap,
            amountOut: exchange.amountExpectedTo,
            tokenIn: 'SOL',
            tokenOut: 'XAUT (ETH)',
            txHash: txHash,
            status: 'success',
            metadata: { exchangeId: exchange.id, depositAddress: exchange.depositAddress },
        });

        console.log('Fee collection sent to SimpleSwap!');
        return { success: true, exchangeId: exchange.id };

    } catch (error) {
        console.error('Fee collection failed:', error.message);
        await db.logEvent({
            eventType: 'system_error',
            status: 'failed',
            error_message: error.message,
            metadata: { context: 'fee_collection' }
        });
        return { success: false, error: error.message };
    } finally {
        nextFeeTime = Date.now() + activeFeeInterval;
    }
}

async function redeployGold() {
    console.log('\n════════════════════════════════════════');
    console.log('REDEPLOYING GOLD -> COIN');
    console.log('════════════════════════════════════════');
    console.log(`${new Date().toISOString()}`);

    try {
        const ethBalance = await eth.getEthBalance();
        if (ethBalance < 0.005) {
            throw new Error('Insufficient ETH for gas (Need > 0.005 ETH)');
        }

        const xautBalance = await eth.getXautBalance();
        if (xautBalance <= 0) {
            console.log('No gold to redeploy, skipping...');
            await db.logEvent({
                eventType: 'system_notice',
                status: 'skipped',
                metadata: { reason: 'no_gold_to_sell' }
            });
            console.log('Switching to long-term intervals: 15min fees, 3hr redeploy');
            activeFeeInterval = 15 * 60 * 1000;
            nextFeeTime = Date.now() + activeFeeInterval;
            activeRedeployInterval = 3 * 60 * 60 * 1000;
            nextRedeployTime = Date.now() + activeRedeployInterval;
            return { success: true, skipped: true, reason: 'no_gold' };
        }

        const goldToSell = xautBalance * config.flywheel.redeployPercentage;
        if (goldToSell < 0.01) {
            console.log('Amount too small for SimpleSwap, skipping...');
            console.log('Switching to long-term intervals: 15min fees, 3hr redeploy');
            activeFeeInterval = 15 * 60 * 1000;
            nextFeeTime = Date.now() + activeFeeInterval;
            activeRedeployInterval = 3 * 60 * 60 * 1000;
            nextRedeployTime = Date.now() + activeRedeployInterval;
            return { success: true, skipped: true, reason: 'small_amount' };
        }

        const saleEvent = await db.logEvent({
            eventType: 'gold_sale',
            amountIn: goldToSell,
            tokenIn: 'XAUT',
            status: 'pending',
        });

        const exchange = await simpleswap.createExchange(
            'xaut', 'sol', 'eth', 'sol',
            goldToSell,
            config.wallets.feeVault,
            config.ethereum.goldWallet
        );

        if (!exchange.success) throw new Error('SimpleSwap create failed');

        const ethTx = await eth.sendXaut(goldToSell, exchange.depositAddress);
        await db.updateEventStatus(saleEvent.id, 'success', ethTx.txHash);

        await db.logEvent({
            eventType: 'gold_sale',
            amountIn: goldToSell,
            amountOut: exchange.amountExpectedTo,
            tokenIn: 'XAUT',
            tokenOut: 'SOL',
            txHash: ethTx.txHash,
            status: 'success',
            metadata: { exchangeId: exchange.id }
        });

        console.log('Switching to long-term intervals: 15min fees, 3hr redeploy');
        activeFeeInterval = 15 * 60 * 1000;
        nextFeeTime = Date.now() + activeFeeInterval;
        activeRedeployInterval = 3 * 60 * 60 * 1000;
        nextRedeployTime = Date.now() + activeRedeployInterval;
        return { success: true, goldSold: goldToSell, txHash: ethTx.txHash };

    } catch (error) {
        console.error('Redeploy failed:', error.message);
        await db.logEvent({
            eventType: 'system_error',
            status: 'failed',
            error_message: error.message,
            metadata: { context: 'redeploy_gold' }
        });
        return { success: false, error: error.message };
    } finally {
        console.log('Updating intervals: 15min fees, 3hr redeploy');
        activeFeeInterval = 15 * 60 * 1000;
        nextFeeTime = Date.now() + activeFeeInterval;
        activeRedeployInterval = 3 * 60 * 60 * 1000;
        nextRedeployTime = Date.now() + activeRedeployInterval;
    }
}

async function finishRedeploy() {
    try {
        const solBalance = await rpc.getSolBalance(rpc.getBotKeypair().publicKey.toString());
        const buyThreshold = 0.05;

        if (solBalance > buyThreshold) {
            console.log(`\nSOL Detected (${solBalance} SOL). Finishing redeploy...`);
            const amountToBuy = solBalance - 0.01;
            if (amountToBuy <= 0) return;

            const dex = require('./dex');
            const buyResult = await dex.buyProjectCoin(amountToBuy);

            if (!buyResult.success) {
                throw new Error(`Buyback failed: ${buyResult.error}`);
            }

            await db.logEvent({
                eventType: 'redeploy_finish',
                amountIn: amountToBuy,
                amountOut: buyResult.amountOut,
                tokenIn: 'SOL',
                tokenOut: config.tokens.projectCoinMint,
                txHash: buyResult.txHash,
                status: 'success'
            });
        }
    } catch (error) {
        console.error('Error in finishRedeploy:', error.message);
        await db.logEvent({
            eventType: 'system_error',
            status: 'failed',
            error_message: error.message,
            metadata: { context: 'finish_redeploy' }
        });
    }
}

function calculateNextRedeploy() {
    const now = Date.now();
    const msUntil = nextRedeployTime - now;
    return {
        nextRedeploy: new Date(nextRedeployTime),
        msUntil,
        formatted: `${Math.floor(msUntil / (1000 * 60))}m ${Math.floor((msUntil % (1000 * 60)) / 1000)}s`,
    };
}

function calculateNextFeeCollection() {
    const now = Date.now();
    const msUntil = nextFeeTime - now;
    return {
        nextCollection: new Date(nextFeeTime),
        msUntil,
        formatted: `${Math.floor(msUntil / (1000 * 60))}m ${Math.floor((msUntil % (1000 * 60)) / 1000)}s`,
    };
}

module.exports = {
    initRelativeTimers,
    collectFeesAndBuyGold,
    redeployGold,
    finishRedeploy,
    calculateNextRedeploy,
    calculateNextFeeCollection,
};
