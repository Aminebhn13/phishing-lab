import { useState, useEffect } from 'react'
import SwapPage from './SwapPage.jsx'
import AdminPage from './AdminPage.jsx'

export default function App() {
  const [page, setPage] = useState('swap')

  useEffect(() => {
    const path = window.location.pathname
    if (path === '/admin') setPage('admin')
    else setPage('swap')
  }, [])

  return page === 'admin' ? <AdminPage /> : <SwapPage />
}
