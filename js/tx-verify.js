/* ══════════════════════════════════════════════════════════════════
   tx-verify.js  —  Automated blockchain TX verification for Pro

   HOW IT WORKS:
   ─────────────
   1. User submits TX hash + network
   2. We call the blockchain API to look up the transaction
   3. We verify: destination = our wallet, amount >= $20, confirmed
   4. TX hash uniqueness enforced in Supabase (one hash = one Pro)
   5. If valid → auto-activate Pro instantly
   6. If invalid → show clear error reason

   SUPPORTED NETWORKS:
   ─────────────────
   • TRC20 (Tron)  — via Tronscan API
   • BEP20 (BSC)   — via public RPC
   • ERC20 (ETH)   — via public RPC
   • Binance Pay   — manual review (off-chain, can't auto-verify)
══════════════════════════════════════════════════════════════════ */

/* ── Our wallet addresses (must match config) ─────────────────── */
var TX_WALLETS = {
  trc20: 'TGt3FQmv8AFPqbj6PnQGUAmemV9gDNm4bt',
  bep20: '0x507772f8714bca8e73a7984446edb59fea9bfba3',
  erc20: '0x507772f8714bca8e73a7984446edb59fea9bfba3'
};

var PRO_MIN_USD = 20;

/* ── USDT contract addresses ──────────────────────────────────── */
var USDT_CONTRACTS = {
  bep20: '0x55d398326f99059ff775485246999027b3197955',
  erc20: '0xdac17f958d2ee523a2206206994597c13d831ec7'
};

var USDT_DECIMALS = { bep20: 18, erc20: 6 };

/* ── Public RPC endpoints ─────────────────────────────────────── */
var TX_RPC = {
  bep20: 'https://bsc-dataseed.binance.org',
  erc20: 'https://ethereum-rpc.publicnode.com'
};

/* ERC-20 Transfer(address,address,uint256) event signature */
var TRANSFER_SIG = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

/* ══════════════════════════════════════════════════════════════════
   MAIN ENTRY POINT
══════════════════════════════════════════════════════════════════ */

/**
 * Verify a TX hash on the blockchain.
 * @param {string} txHash  — transaction hash
 * @param {string} network — 'TRC20' | 'BEP20' | 'ERC20'
 * @returns {Promise<{valid:boolean, reason?:string, amount?:number, token?:string}>}
 */
function verifyTxHash(txHash, network) {
  txHash  = (txHash  || '').trim();
  network = (network || '').toUpperCase();

  if (!txHash) return Promise.resolve({ valid: false, reason: 'Please enter a TX hash.' });

  /* Step 1: check Supabase for duplicate TX hash */
  return supaCheckTxHashUsed(txHash).then(function(used) {
    if (used) return { valid: false, reason: 'This TX hash has already been used to activate Pro.' };

    /* Step 2: verify on the correct blockchain */
    if (network === 'TRC20')  return _verifyTRC20(txHash);
    if (network === 'BEP20')  return _verifyEVM(txHash, 'bep20');
    if (network === 'ERC20')  return _verifyEVM(txHash, 'erc20');

    return { valid: false, reason: 'This network does not support auto-verification.' };
  });
}

/* ══════════════════════════════════════════════════════════════════
   TRC20 (TRON) VERIFICATION  —  via Tronscan API
══════════════════════════════════════════════════════════════════ */

function _verifyTRC20(txHash) {
  return fetch('https://apilist.tronscanapi.com/api/transaction-info?hash=' + txHash)
    .then(function(r) { return r.json(); })
    .then(function(data) {
      /* TX not found or failed */
      if (!data || !data.hash) {
        return { valid: false, reason: 'Transaction not found on Tron. Check the hash and try again.' };
      }
      if (data.contractRet !== 'SUCCESS') {
        return { valid: false, reason: 'Transaction failed on Tron (status: ' + (data.contractRet || 'unknown') + ').' };
      }

      /* Check for TRC20 token transfer */
      var info = data.tokenTransferInfo;
      if (!info) {
        /* Maybe it's a TRC20 trigger but no tokenTransferInfo — check trc20TransferInfo */
        var trc20List = data.trc20TransferInfo;
        if (trc20List && trc20List.length > 0) {
          for (var i = 0; i < trc20List.length; i++) {
            var t = trc20List[i];
            if ((t.to_address || '').toLowerCase() === TX_WALLETS.trc20.toLowerCase()) {
              var dec = parseInt(t.decimals || t.tokenInfo && t.tokenInfo.tokenDecimal) || 6;
              var amt = parseFloat(t.amount_str || t.quant) / Math.pow(10, dec);
              if (amt >= PRO_MIN_USD) {
                return { valid: true, amount: amt, token: (t.tokenInfo && t.tokenInfo.tokenAbbr) || 'USDT', network: 'TRC20' };
              } else {
                return { valid: false, reason: 'Amount ($' + amt.toFixed(2) + ') is below the $' + PRO_MIN_USD + ' minimum for Pro.' };
              }
            }
          }
        }
        return { valid: false, reason: 'No USDT transfer to our wallet found in this transaction.' };
      }

      /* Standard tokenTransferInfo path */
      var toAddr = (info.to_address || '').trim();
      if (toAddr.toLowerCase() !== TX_WALLETS.trc20.toLowerCase()) {
        return { valid: false, reason: 'Payment was not sent to the correct wallet address.' };
      }

      var decimals = parseInt(info.tokenInfo && info.tokenInfo.tokenDecimal) || 6;
      var amount   = parseFloat(info.amount_str) / Math.pow(10, decimals);

      if (amount < PRO_MIN_USD) {
        return { valid: false, reason: 'Amount ($' + amount.toFixed(2) + ') is below the $' + PRO_MIN_USD + ' minimum for Pro.' };
      }

      return { valid: true, amount: amount, token: (info.tokenInfo && info.tokenInfo.tokenAbbr) || 'USDT', network: 'TRC20' };
    })
    .catch(function() {
      return { valid: false, reason: 'Could not reach Tron network. Please try again in a moment.' };
    });
}

/* ══════════════════════════════════════════════════════════════════
   EVM (BSC / ETH) VERIFICATION  —  via public RPC
══════════════════════════════════════════════════════════════════ */

function _verifyEVM(txHash, net) {
  var rpcUrl       = TX_RPC[net];
  var wallet       = TX_WALLETS[net].toLowerCase();
  var usdtAddr     = USDT_CONTRACTS[net];
  var usdtDec      = USDT_DECIMALS[net];

  var pTx      = _rpc(rpcUrl, 'eth_getTransactionByHash', [txHash]);
  var pReceipt = _rpc(rpcUrl, 'eth_getTransactionReceipt', [txHash]);

  return Promise.all([pTx, pReceipt]).then(function(res) {
    var tx      = res[0];
    var receipt = res[1];

    if (!tx || !receipt) {
      return { valid: false, reason: 'Transaction not found on ' + net.toUpperCase() + '. It may still be pending — wait a few minutes and retry.' };
    }
    if (receipt.status !== '0x1') {
      return { valid: false, reason: 'Transaction failed (reverted) on ' + net.toUpperCase() + '.' };
    }

    /* ── Check logs for USDT (ERC-20) Transfer to our wallet ── */
    var logs = receipt.logs || [];
    for (var i = 0; i < logs.length; i++) {
      var log = logs[i];
      if (!log.topics || log.topics.length < 3) continue;
      if (log.topics[0] !== TRANSFER_SIG) continue;
      if (log.address.toLowerCase() !== usdtAddr) continue;

      var to = '0x' + log.topics[2].slice(26).toLowerCase();
      if (to === wallet) {
        var rawAmt = parseInt(log.data, 16);
        var amount = rawAmt / Math.pow(10, usdtDec);
        if (amount >= PRO_MIN_USD) {
          return { valid: true, amount: amount, token: 'USDT', network: net.toUpperCase() };
        } else {
          return { valid: false, reason: 'Amount ($' + amount.toFixed(2) + ') is below the $' + PRO_MIN_USD + ' minimum for Pro.' };
        }
      }
    }

    /* ── Check native BNB / ETH transfer ── */
    if (tx.to && tx.to.toLowerCase() === wallet) {
      var weiVal = parseInt(tx.value, 16);
      if (weiVal > 0) {
        var nativeAmt = weiVal / 1e18;
        var coinId = (net === 'bep20') ? 'binancecoin' : 'ethereum';
        return _getNativePrice(coinId).then(function(price) {
          if (!price || price <= 0) {
            return { valid: false, reason: 'Could not fetch ' + (net === 'bep20' ? 'BNB' : 'ETH') + ' price to verify USD value. Try again later.' };
          }
          var usdVal = nativeAmt * price;
          if (usdVal >= PRO_MIN_USD) {
            return { valid: true, amount: usdVal, token: (net === 'bep20' ? 'BNB' : 'ETH'), network: net.toUpperCase() };
          } else {
            return { valid: false, reason: 'Payment value (~$' + usdVal.toFixed(2) + ') is below the $' + PRO_MIN_USD + ' minimum for Pro.' };
          }
        });
      }
    }

    return { valid: false, reason: 'No payment to our wallet found in this transaction.' };
  }).catch(function() {
    return { valid: false, reason: 'Could not reach ' + net.toUpperCase() + ' network. Please try again in a moment.' };
  });
}

/* ── JSON-RPC helper ──────────────────────────────────────────── */
function _rpc(url, method, params) {
  return fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: method, params: params, id: 1 })
  }).then(function(r) { return r.json(); })
    .then(function(d) { return d.result || null; })
    .catch(function()  { return null; });
}

/* ── Native token price (BNB/ETH → USD) ──────────────────────── */
function _getNativePrice(coinId) {
  /* Try app's already-loaded coin data first */
  if (typeof ALL_COINS !== 'undefined' && ALL_COINS && ALL_COINS.length) {
    for (var i = 0; i < ALL_COINS.length; i++) {
      if (ALL_COINS[i].id === coinId && ALL_COINS[i].current_price) {
        return Promise.resolve(ALL_COINS[i].current_price);
      }
    }
  }
  /* Fallback: quick CoinGecko call */
  return fetch('https://api.coingecko.com/api/v3/simple/price?ids=' + coinId + '&vs_currencies=usd')
    .then(function(r) { return r.json(); })
    .then(function(d) { return d[coinId] ? d[coinId].usd : 0; })
    .catch(function()  { return 0; });
}
