const { ethers } = require('ethers');
const config = require('./config');

const ERC20_ABI = [
    "function balanceOf(address owner) view returns (uint256)",
    "function transfer(address to, uint amount) returns (bool)",
    "function decimals() view returns (uint8)"
];

let provider;
let wallet;
let xautContract;

function initCrypto() {
    if (!config.ethereum.rpcUrl || !config.ethereum.privateKey) {
        console.warn('Ethereum not fully configured. Multi-chain features will fail.');
        return false;
    }

    try {
        provider = new ethers.JsonRpcProvider(config.ethereum.rpcUrl);
        wallet = new ethers.Wallet(config.ethereum.privateKey, provider);
        xautContract = new ethers.Contract(config.ethereum.xautContract, ERC20_ABI, wallet);
        return true;
    } catch (error) {
        console.error('Failed to init Ethereum:', error.message);
        return false;
    }
}

initCrypto();

async function getEthBalance() {
    if (!wallet) return 0;
    try {
        const balance = await provider.getBalance(wallet.address);
        return parseFloat(ethers.formatEther(balance));
    } catch (error) {
        console.error('Failed to get ETH balance:', error.message);
        return 0;
    }
}

async function getXautBalance() {
    if (!xautContract) return 0;
    try {
        const balance = await xautContract.balanceOf(wallet.address);
        return parseFloat(ethers.formatUnits(balance, 6));
    } catch (error) {
        console.error('Failed to get XAUT balance:', error.message);
        return 0;
    }
}

async function sendXaut(amount, toAddress) {
    if (!xautContract) throw new Error('Ethereum not initialized');

    console.log(`Sending ${amount} XAUT to ${toAddress}...`);

    try {
        const amountWei = ethers.parseUnits(amount.toString(), 6);

        const tx = await xautContract.transfer(toAddress, amountWei);
        console.log(`   Tx Sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`Tx Confirmed in block ${receipt.blockNumber}`);

        return {
            success: true,
            txHash: tx.hash
        };
    } catch (error) {
        console.error('Send XAUT failed:', error.message);
        throw error;
    }
}

module.exports = {
    getEthBalance,
    getXautBalance,
    sendXaut,
    walletAddress: wallet ? wallet.address : null
};
