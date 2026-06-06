/**
 * claimFees.js
 * Finds the token's Raydium pool automatically using TOKEN_CA,
 * claims accumulated trading fees into the creator wallet.
 * No extra env vars needed — uses what's already in .env
 *
 * Runs every 30 minutes automatically when required.
 * Add one line to server.js: require('./claimFees');
 */

require("dotenv").config();

const {
  Connection, PublicKey, Keypair,
  Transaction, LAMPORTS_PER_SOL,
} = require("@solana/web3.js");
const bs58  = require("bs58");
const https = require("https");

const SOLANA_RPC     = process.env.SOLANA_RPC;
const TOKEN_CA       = process.env.TOKEN_CA;
const CREATOR_WALLET = process.env.CREATOR_WALLET;
const INTERVAL_MS    = 30 * 60 * 1000; // 30 minutes

if (!SOLANA_RPC || !TOKEN_CA || !CREATOR_WALLET || !process.env.CREATOR_PRIVATE_KEY) {
  console.log("[claimFees] Missing env vars — skipping");
  return;
}

const connection = new Connection(SOLANA_RPC, { commitment: "confirmed" });
const creatorKP  = Keypair.fromSecretKey(bs58.decode(process.env.CREATOR_PRIVATE_KEY));
const log        = m => console.log(`[${new Date().toISOString()}] [claimFees] ${m}`);

// ── HELPERS ─────────────────────────────────────────────────
function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      let d = ""; res.on("data", c => d += c);
      res.on("end", () => { try { resolve(JSON.parse(d)); } catch { reject(new Error("parse")); } });
    });
    req.on("error", reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error("timeout")); });
  });
}

// ── FIND POOL FROM TOKEN CA ──────────────────────────────────
async function findPool(tokenCA) {
  try {
    // Search Raydium pairs for this token
    const data = await fetchJSON(
      `https://api.raydium.io/v2/main/pairs`
    );
    const pairs = data?.data || data || [];
    const pair  = pairs.find(p =>
      p.baseMint === tokenCA || p.quoteMint === tokenCA
    );
    if (pair) {
      log(`Pool found: ${pair.ammId} (${pair.name})`);
      return { poolId: pair.ammId, type: "amm" };
    }
  } catch (e) { log(`Raydium pairs lookup failed: ${e.message}`); }

  // Try CPMM search (pump.fun graduated tokens)
  try {
    const data = await fetchJSON(
      `https://api.raydium.io/v2/main/cpmm/pools?mint=${tokenCA}`
    );
    const pool = data?.data?.[0];
    if (pool) {
      log(`CPMM pool found: ${pool.poolId}`);
      return { poolId: pool.poolId, type: "cpmm" };
    }
  } catch (e) { log(`CPMM lookup failed: ${e.message}`); }

  // Try DEXScreener as fallback to find pool address
  try {
    const data = await fetchJSON(
      `https://api.dexscreener.com/latest/dex/tokens/${tokenCA}`
    );
    const pair = data?.pairs?.find(p => p.dexId === "raydium");
    if (pair?.pairAddress) {
      log(`Pool found via DEXScreener: ${pair.pairAddress}`);
      return { poolId: pair.pairAddress, type: "cpmm" };
    }
  } catch (e) { log(`DEXScreener lookup failed: ${e.message}`); }

  return null;
}

// ── CLAIM FEES ───────────────────────────────────────────────
async function claimFees() {
  log("Starting fee claim...");
  try {
    const balanceBefore = await connection.getBalance(new PublicKey(CREATOR_WALLET));
    log(`Creator wallet: ◎${(balanceBefore / LAMPORTS_PER_SOL).toFixed(4)}`);

    // Find the pool automatically
    const pool = await findPool(TOKEN_CA);
    if (!pool) {
      log("No Raydium pool found for this token — fees may route directly to wallet");
      return;
    }

    // Use Raydium SDK v2 with dynamic import (works inside CommonJS)
    let sdk;
    try {
      sdk = await import("@raydium-io/raydium-sdk-v2");
    } catch {
      log("Raydium SDK not installed. Run: npm install @raydium-io/raydium-sdk-v2");
      log("Fee balance will still be tracked — engine distributes whatever is in creator wallet");
      return;
    }

    const { Raydium, TxVersion } = sdk;
    const raydium = await Raydium.load({
      connection,
      owner: creatorKP.publicKey,
      signAllTransactions: async txs => {
        for (const tx of txs) {
          if ("version" in tx) tx.sign([creatorKP]);
          else tx.partialSign(creatorKP);
        }
        return txs;
      },
      disableLoadToken: true,
    });

    if (pool.type === "cpmm") {
      const poolInfo = await raydium.cpmm.getRpcPoolInfo(pool.poolId);
      if (!poolInfo) { log("Could not load CPMM pool info"); return; }
      const { execute } = await raydium.cpmm.collectFundFee({
        poolInfo,
        authority: creatorKP.publicKey,
        txVersion: TxVersion.V0,
      });
      const { txId } = await execute({ sendAndConfirm: true });
      log(`✓ CPMM fees claimed — tx: ${txId}`);
    } else {
      // AMM V4 — fees auto-distribute to LP holders, no manual claim needed
      log(`AMM pool detected — fees distribute automatically to LP positions`);
    }

    const balanceAfter = await connection.getBalance(new PublicKey(CREATOR_WALLET));
    const gained = (balanceAfter - balanceBefore) / LAMPORTS_PER_SOL;
    if (gained > 0) log(`◎${gained.toFixed(4)} added to creator wallet`);
    else log(`Creator wallet unchanged — fees may accumulate over time`);

  } catch (e) {
    log(`Error: ${e.message}`);
  }
}

// ── RUN ──────────────────────────────────────────────────────
claimFees();
setInterval(claimFees, INTERVAL_MS);
log(`Fee claimer running — checks every ${INTERVAL_MS / 60000} minutes`);
