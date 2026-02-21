import { useState, useEffect } from 'react'
import ShoppingPage from './components/ShoppingPage'
import logo from './assets/TryIt_Logo.png'
import './App.css'
import type { SizeGuide } from './utils/sizeCollector'
import type { PersonAnalysis } from './utils/personAnalyzer'
import { analyzeItem } from './utils/analyzeItem'

const SESSION_STORAGE_KEY = 'tryit_session'
const TEST_MODE = window.location.pathname === '/test-mode'
const TEST_MODE_IDS = ['2388797', '2398101', '2390524', '2383610', '2388963', '2397821']

export interface ItemData {
  id: string
  sku: string
  name: string
  shortDescription: string
  fullDescription: string
  imageUrl: string
  price: number
  currency: string
  color: string
  inStock: boolean
  type: string
  gender: string
  source: string
  purchaseUrl: string
  availableSizes: string[]
  brand?: string
  sizeGuide?: SizeGuide
}

export interface UserData {
  image: string | null
  croppedImage: string | null  // The frame-captured image (4:3 aspect, with blur background)
  weight: number | null
  weightUnit: 'lb' | 'kg'
  height: number | null
  heightUnit: 'ft' | 'cm'
  heightInches: number | null
  item: ItemData | null  // Current active item (for backward compatibility)
  items: ItemData[]      // All scanned items for stacked cards
  personAnalysis: PersonAnalysis | null  // Cached person analysis (run once when image changes)
}

function App() {
  const defaultUserData: UserData = {
    image: null,
    croppedImage: null,
    weight: 70,
    weightUnit: 'kg',
    height: 180,
    heightUnit: 'cm',
    heightInches: null,
    item: null,
    items: [],
    personAnalysis: null
  }

  // Initialize state from sessionStorage if available (skip in test mode)
  const [userData, setUserData] = useState<UserData>(() => {
    if (TEST_MODE) return defaultUserData
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {
      // Failed to restore session
    }
    return defaultUserData
  })

  const [testModeLoading, setTestModeLoading] = useState(TEST_MODE)

  // Test mode: preload 6 items on mount
  useEffect(() => {
    if (!TEST_MODE) return

    const preloadItems = async () => {
      const results = await Promise.allSettled(
        TEST_MODE_IDS.map(async (id) => {
          const response = await fetch(`https://closai-backend.vercel.app/api/duke/item?id=${id}`)
          if (!response.ok) throw new Error(`Failed to fetch item ${id}`)
          const data = await response.json()
          const rawItem = data.item as ItemData
          const analyzed = await analyzeItem(rawItem)
          return { ...analyzed, id: `${analyzed.id}-${Date.now()}-${id}` }
        })
      )

      const items = results
        .filter((r): r is PromiseFulfilledResult<ItemData> => r.status === 'fulfilled')
        .map(r => r.value)

      setUserData(prev => ({ ...prev, items, item: items[0] || null }))
      setTestModeLoading(false)
    }

    preloadItems()
  }, [])

  // Save to sessionStorage whenever userData changes (skip in test mode)
  useEffect(() => {
    if (TEST_MODE) return
    try {
      // Try to save with image first
      const dataToSave = {
        ...userData,
        personAnalysis: null // Exclude analysis - regenerates quickly
      }
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(dataToSave))
    } catch (e) {
      // If quota exceeded, try without image
      try {
        const dataWithoutImage = {
          ...userData,
          image: null,
          croppedImage: null,
          personAnalysis: null
        }
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(dataWithoutImage))
      } catch {
        // sessionStorage might be full or unavailable
      }
    }
  }, [userData])

  const updateUserData = (updates: Partial<UserData>) => {
    setUserData(prev => ({ ...prev, ...updates }))
  }

  return (
    <div className="app">
      {testModeLoading && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 9999,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          background: 'rgba(255,255,255,0.92)', backdropFilter: 'blur(4px)'
        }}>
          <div style={{
            width: 36, height: 36, border: '3px solid #e0e0e0',
            borderTopColor: '#333', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite'
          }} />
          <p style={{ marginTop: 16, fontSize: 15, color: '#555' }}>Loading test items...</p>
          <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
        </div>
      )}

      <div className="slogan-ribbon">
        <p className="slogan"><span className="slogan-bold">Shopping for someone back home? 🎁</span><br />See how it'll fit on them.</p>
      </div>

      <header className="app-header">
        <img src={logo} alt="TryIt" className="logo" />
      </header>

      <main className="app-main">
        <ShoppingPage
          userData={userData}
          onUpdate={updateUserData}
        />
      </main>
    </div>
  )
}

export default App
