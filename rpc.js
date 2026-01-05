const { Connection, PublicKey, Keypair, Transaction, VersionedTransaction, SystemProgram, sendAndConfirmTransaction } = require('@solana/web3.js');
const bs58 = require('bs58');
const config = require('./config');

const connection = new Connection(config.helius.rpcUrl, 'confirmed');

function getBotKeypair() {
    if (!config.botPrivateKey) {
        throw new Error('BOT_PRIVATE_KEY not configured');
    }
    const secretKey = bs58.decode(config.botPrivateKey);
    return Keypair.fromSecretKey(secretKey);
}

async function getSolBalance(walletAddress) {
    try {
        const pubkey = new PublicKey(walletAddress);
        const balance = await connection.getBalance(pubkey);
        return balance / 1e9;
    } catch (error) {
        console.error(`Failed to get SOL balance for ${walletAddress}:`, error.message);
        return 0;
    }
}

async function getTokenBalance(walletAddress, tokenMint) {
    try {
        const wallet = new PublicKey(walletAddress);
        const mint = new PublicKey(tokenMint);

        const response = await connection.getParsedTokenAccountsByOwner(wallet, {
            mint: mint
        });

        if (response.value.length === 0) {
            return 0;
        }

        const balance = response.value[0].account.data.parsed.info.tokenAmount.uiAmount;
        return balance || 0;
    } catch (error) {
        console.error(`Failed to get token balance:`, error.message);
        return 0;
    }
}

async function sendTransaction(transaction) {
    const botKeypair = getBotKeypair();

    try {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [botKeypair],
            { commitment: 'confirmed' }
        );
        return signature;
    } catch (error) {
        console.error('Transaction failed:', error.message);
        throw error;
    }
}

async function getTransactionStatus(signature) {
    try {
        const status = await connection.getSignatureStatus(signature);
        return {
            confirmed: status?.value?.confirmationStatus === 'confirmed' ||
                status?.value?.confirmationStatus === 'finalized',
            finalized: status?.value?.confirmationStatus === 'finalized',
            error: status?.value?.err || null,
        };
    } catch (error) {
        console.error('Failed to get transaction status:', error.message);
        return { confirmed: false, finalized: false, error: error.message };
    }
}

async function getRecentBlockhash() {
    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
    return { blockhash, lastValidBlockHeight };
}

async function getCurrentSlot() {
    return await connection.getSlot();
}

async function transferSol(amount, toAddress, fromKeypair = null) {
    const sender = fromKeypair || getBotKeypair();
    const toPublicKey = new PublicKey(toAddress);

    console.log(`Transferring ${amount} SOL to ${toAddress}...`);
    console.log(`   Sender: ${sender.publicKey.toString()}`);

    const transaction = new Transaction().add(
        SystemProgram.transfer({
            fromPubkey: sender.publicKey,
            toPubkey: toPublicKey,
            lamports: Math.floor(amount * 1e9),
        })
    );

    try {
        const signature = await sendAndConfirmTransaction(
            connection,
            transaction,
            [sender],
            { commitment: 'confirmed' }
        );
        console.log(`SOL Transfer sent: ${signature}`);
        return signature;
    } catch (error) {
        console.error('SOL Transfer failed:', error.message);
        throw error;
    }
}

async function sendAndConfirmVersionedTransaction(versionedTx) {
    const botKeypair = getBotKeypair();

    try {
        versionedTx.sign([botKeypair]);

        const signature = await connection.sendTransaction(versionedTx, {
            skipPreflight: false,
            maxRetries: 3,
            preflightCommitment: 'confirmed',
        });

        console.log(`Transaction sent: ${signature}`);

        const confirmation = await connection.confirmTransaction(signature, 'confirmed');

        if (confirmation.value.err) {
            throw new Error(`Transaction failed: ${JSON.stringify(confirmation.value.err)}`);
        }

        return signature;

    } catch (error) {
        console.error('Versioned transaction failed:', error.message);
        throw error;
    }
}

module.exports = {
    connection,
    getBotKeypair,
    getSolBalance,
    getTokenBalance,
    sendTransaction,
    getTransactionStatus,
    getRecentBlockhash,
    getCurrentSlot,
    transferSol,
    sendAndConfirmVersionedTransaction,
};
