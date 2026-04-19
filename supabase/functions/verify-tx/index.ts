// ══════════════════════════════════════════════════════════════════
// verify-tx  —  Supabase Edge Function
//
// Server-side replacement for the old client-trusting tx-verify.js.
// The client POSTs { uid, tx_hash, network, contact } and this function:
//   1. Looks up the transaction on the correct chain (Tron / BSC / ETH).
//   2. Verifies destination wallet, status, and USD amount ≥ PRO_MIN_USD.
//   3. On pass, calls grant_pro_via_tx via the service_role key.
//      (anon/authenticated EXECUTE is REVOKED — see tx_verify_lockdown.sql)
//
// Response shape matches what pro-system.js expects:
//   { ok: true,  reason: 'granted', amount, token, network }
//   { ok: false, reason: '<human message>' }
// ══════════════════════════════════════════════════════════════════

const TX_WALLETS = {
  trc20: 'TGt3FQmv8AFPqbj6PnQGUAmemV9gDNm4bt',
  bep20: '0x507772f8714bca8e73a7984446edb59fea9bfba3',
  erc20: '0x507772f8714bca8e73a7984446edb59fea9bfba3',
} as const;

const PRO_MIN_USD = 20;

const USDT_CONTRACTS = {
  bep20: '0x55d398326f99059ff775485246999027b3197955',
  erc20: '0xdac17f958d2ee523a2206206994597c13d831ec7',
} as const;

const USDT_DECIMALS = { bep20: 18, erc20: 6 } as const;

const TX_RPC = {
  bep20: 'https://bsc-dataseed.binance.org',
  erc20: 'https://ethereum-rpc.publicnode.com',
} as const;

const TRANSFER_SIG =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

type Verdict =
  | { valid: true; amount: number; token: string; network: string }
  | { valid: false; reason: string };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}

async function jsonRpc(
  url: string,
  method: string,
  params: unknown[],
): Promise<any> {
  try {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method, params, id: 1 }),
    });
    if (!r.ok) return null;
    const d = await r.json();
    return d?.result ?? null;
  } catch {
    return null;
  }
}

async function getNativePrice(coinId: string): Promise<number> {
  try {
    const r = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`,
    );
    const d = await r.json();
    return Number(d?.[coinId]?.usd) || 0;
  } catch {
    return 0;
  }
}

async function verifyTRC20(txHash: string): Promise<Verdict> {
  try {
    const r = await fetch(
      `https://apilist.tronscanapi.com/api/transaction-info?hash=${txHash}`,
    );
    const data = await r.json();
    if (!data || !data.hash) {
      return { valid: false, reason: 'Transaction not found on Tron. Check the hash and try again.' };
    }
    if (data.contractRet !== 'SUCCESS') {
      return { valid: false, reason: `Transaction failed on Tron (status: ${data.contractRet || 'unknown'}).` };
    }

    const expected = TX_WALLETS.trc20.toLowerCase();
    const info = data.tokenTransferInfo;

    if (info) {
      if (String(info.to_address || '').toLowerCase() !== expected) {
        return { valid: false, reason: 'Payment was not sent to the correct wallet address.' };
      }
      const dec = parseInt(info.tokenInfo?.tokenDecimal) || 6;
      const amt = parseFloat(info.amount_str) / Math.pow(10, dec);
      if (amt < PRO_MIN_USD) {
        return { valid: false, reason: `Amount ($${amt.toFixed(2)}) is below the $${PRO_MIN_USD} minimum for Pro.` };
      }
      return { valid: true, amount: amt, token: info.tokenInfo?.tokenAbbr || 'USDT', network: 'TRC20' };
    }

    const trc20List = data.trc20TransferInfo || [];
    for (const t of trc20List) {
      if (String(t.to_address || '').toLowerCase() !== expected) continue;
      const dec = parseInt(t.decimals || t.tokenInfo?.tokenDecimal) || 6;
      const amt = parseFloat(t.amount_str || t.quant) / Math.pow(10, dec);
      if (amt < PRO_MIN_USD) {
        return { valid: false, reason: `Amount ($${amt.toFixed(2)}) is below the $${PRO_MIN_USD} minimum for Pro.` };
      }
      return { valid: true, amount: amt, token: t.tokenInfo?.tokenAbbr || 'USDT', network: 'TRC20' };
    }

    return { valid: false, reason: 'No USDT transfer to our wallet found in this transaction.' };
  } catch {
    return { valid: false, reason: 'Could not reach Tron network. Please try again in a moment.' };
  }
}

async function verifyEVM(txHash: string, net: 'bep20' | 'erc20'): Promise<Verdict> {
  const rpcUrl = TX_RPC[net];
  const wallet = TX_WALLETS[net].toLowerCase();
  const usdtAddr = USDT_CONTRACTS[net];
  const usdtDec = USDT_DECIMALS[net];

  const [tx, receipt] = await Promise.all([
    jsonRpc(rpcUrl, 'eth_getTransactionByHash', [txHash]),
    jsonRpc(rpcUrl, 'eth_getTransactionReceipt', [txHash]),
  ]);

  if (!tx || !receipt) {
    return { valid: false, reason: `Transaction not found on ${net.toUpperCase()}. It may still be pending — wait a few minutes and retry.` };
  }
  if (receipt.status !== '0x1') {
    return { valid: false, reason: `Transaction failed (reverted) on ${net.toUpperCase()}.` };
  }

  for (const log of (receipt.logs || [])) {
    if (!log.topics || log.topics.length < 3) continue;
    if (log.topics[0] !== TRANSFER_SIG) continue;
    if (String(log.address).toLowerCase() !== usdtAddr) continue;
    const to = '0x' + String(log.topics[2]).slice(26).toLowerCase();
    if (to !== wallet) continue;
    const rawAmt = parseInt(log.data, 16);
    const amount = rawAmt / Math.pow(10, usdtDec);
    if (amount < PRO_MIN_USD) {
      return { valid: false, reason: `Amount ($${amount.toFixed(2)}) is below the $${PRO_MIN_USD} minimum for Pro.` };
    }
    return { valid: true, amount, token: 'USDT', network: net.toUpperCase() };
  }

  if (tx.to && String(tx.to).toLowerCase() === wallet) {
    const weiVal = parseInt(tx.value, 16);
    if (weiVal > 0) {
      const nativeAmt = weiVal / 1e18;
      const coinId = net === 'bep20' ? 'binancecoin' : 'ethereum';
      const price = await getNativePrice(coinId);
      if (!price) {
        return { valid: false, reason: `Could not fetch ${net === 'bep20' ? 'BNB' : 'ETH'} price to verify USD value. Try again later.` };
      }
      const usd = nativeAmt * price;
      if (usd < PRO_MIN_USD) {
        return { valid: false, reason: `Payment value (~$${usd.toFixed(2)}) is below the $${PRO_MIN_USD} minimum for Pro.` };
      }
      return { valid: true, amount: usd, token: net === 'bep20' ? 'BNB' : 'ETH', network: net.toUpperCase() };
    }
  }

  return { valid: false, reason: 'No payment to our wallet found in this transaction.' };
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json({ ok: false, reason: 'method_not_allowed' }, 405);

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, reason: 'Invalid request body.' }, 400); }

  const uid     = String(body?.uid     ?? '').trim();
  const txHash  = String(body?.tx_hash ?? '').trim();
  const network = String(body?.network ?? '').toUpperCase();
  const contact = String(body?.contact ?? '').trim();

  if (!uid)     return json({ ok: false, reason: 'Missing device id.' }, 400);
  if (!txHash)  return json({ ok: false, reason: 'Please enter a TX hash.' }, 400);
  if (!network) return json({ ok: false, reason: 'Please select a network.' }, 400);

  let verdict: Verdict;
  if (network === 'TRC20')      verdict = await verifyTRC20(txHash);
  else if (network === 'BEP20') verdict = await verifyEVM(txHash, 'bep20');
  else if (network === 'ERC20') verdict = await verifyEVM(txHash, 'erc20');
  else return json({ ok: false, reason: 'This network does not support auto-verification.' });

  if (!verdict.valid) return json({ ok: false, reason: verdict.reason });

  const SUPA_URL     = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!SUPA_URL || !SERVICE_KEY) {
    return json({ ok: false, reason: 'Server misconfigured (missing env).' }, 500);
  }

  const verifiedAmt = `$${verdict.amount.toFixed(2)} ${verdict.token}`;

  try {
    const grantR = await fetch(`${SUPA_URL}/rest/v1/rpc/grant_pro_via_tx`, {
      method: 'POST',
      headers: {
        'apikey':        SERVICE_KEY,
        'Authorization': `Bearer ${SERVICE_KEY}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        p_uid:     uid,
        p_tx_hash: txHash,
        p_network: network,
        p_amount:  verifiedAmt,
        p_contact: contact,
      }),
    });

    if (!grantR.ok) {
      return json({ ok: false, reason: 'Activation server rejected the grant. Please contact support with your TX hash.' }, 502);
    }
    const grant = await grantR.json();
    if (!grant || grant.ok !== true) {
      const reason = grant?.reason === 'tx_used'
        ? 'tx_used'
        : 'Activation failed. Please contact support with your TX hash.';
      return json({ ok: false, reason });
    }

    return json({
      ok: true,
      reason: 'granted',
      amount: verdict.amount,
      token: verdict.token,
      network: verdict.network,
    });
  } catch {
    return json({ ok: false, reason: 'Could not reach the activation server. Please try again.' }, 502);
  }
});
