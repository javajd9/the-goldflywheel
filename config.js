require('dotenv').config();

const config = {
  helius: {
    rpcUrl: process.env.HELIUS_RPC_URL || 'https://mainnet.helius-rpc.com',
    webhookSecret: process.env.HELIUS_WEBHOOK_SECRET || '',
  },

  pumpPortal: {
    apiKey: process.env.PUMPPORTAL_API_KEY || '',
    pool: process.env.PUMPPORTAL_POOL || 'pump',
    tokenMint: process.env.PROJECT_COIN_MINT || process.env.TOKEN_MINT || '',
  },

  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/gold_flywheel',
    ssl: process.env.DB_SSL === 'true',
  },

  wallets: {
    feeVault: process.env.FEE_VAULT || '',
    goldVault: process.env.GOLD_VAULT || '',
    treasury: process.env.TREASURY_WALLET || '',
  },

  tokens: {
    projectCoinMint: (process.env.PROJECT_COIN_MINT && !process.env.PROJECT_COIN_MINT.includes('AddressHere'))
      ? process.env.PROJECT_COIN_MINT
      : (process.env.TOKEN_MINT && !process.env.TOKEN_MINT.includes('ca-here'))
        ? process.env.TOKEN_MINT
        : process.env.PROJECT_COIN_MINT || '',
  },

  botPrivateKey: process.env.BOT_PRIVATE_KEY || '',

  creatorPrivateKey: process.env.CREATOR_PRIVATE_KEY || '',

  intervals: {
    feeCollection: '*/5 * * * *',
    redeploy: '*/15 * * * *',
    snapshot: '*/15 * * * * *',
  },

  flywheel: {
    redeployPercentage: 0.10,
  },

  webhook: {
    port: parseInt(process.env.WEBHOOK_PORT || '3000', 10),
    enabled: process.env.ENABLE_WEBHOOK === 'true',
  },

  simpleswap: {
    apiKey: process.env.SIMPLESWAP_API_KEY || '',
    solRefundWallet: process.env.SOL_REFUND_WALLET || '',
  },

  ethereum: {
    rpcUrl: process.env.ETH_RPC_URL || '',
    privateKey: process.env.ETH_PRIVATE_KEY || '',
    goldWallet: process.env.ETH_GOLD_WALLET || '',
    xautContract: process.env.XAUT_CONTRACT_ADDRESS || '0x45804880De22913dAFFE09598207abE1C984F90C',
  },
};

function validateConfig() {
  const required = [
    ['HELIUS_RPC_URL', config.helius.rpcUrl],
    ['FEE_VAULT', config.wallets.feeVault],
    ['GOLD_VAULT', config.wallets.goldVault],
    ['TREASURY_WALLET', config.wallets.treasury],
    ['PROJECT_COIN_MINT', config.tokens.projectCoinMint],
  ];

  const missing = required.filter(([name, value]) => !value);

  if (missing.length > 0) {
    console.warn('Missing configuration:');
    missing.forEach(([name]) => console.warn(`   - ${name}`));
    console.warn('   Some features may not work correctly.\n');
  }
}

validateConfig();

module.exports = config;
