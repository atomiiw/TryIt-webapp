import { useState, useEffect } from 'react'
import ShoppingPage from './components/ShoppingPage'
import logo from './assets/TryIt_Logo.png'
import './App.css'
import type { SizeGuide } from './utils/sizeCollector'

const SESSION_STORAGE_KEY = 'tryit_session'

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
  specificType: string
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
}

function App() {
  // Initialize state from sessionStorage if available
  const [userData, setUserData] = useState<UserData>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (saved) {
        const parsed = JSON.parse(saved)
        console.log('📦 Restored session from storage')
        return parsed
      }
    } catch (e) {
      console.warn('Failed to restore session:', e)
    }
    return {
      image: null,
      croppedImage: null,
      weight: 70,
      weightUnit: 'kg',
      height: 180,
      heightUnit: 'cm',
      heightInches: null,
      item: null,
      items: []
    }
  })

  // Save to sessionStorage whenever userData changes
  useEffect(() => {
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(userData))
    } catch (e) {
      // sessionStorage might be full or unavailable
      console.warn('Failed to save session:', e)
    }
  }, [userData])

  const updateUserData = (updates: Partial<UserData>) => {
    setUserData(prev => ({ ...prev, ...updates }))
  }

  return (
    <div className="app">
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
