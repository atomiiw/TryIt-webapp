import { useState, useEffect } from 'react'
import ShoppingPage from './components/ShoppingPage'
import logo from './assets/TryIt_Logo.png'
import './App.css'
import type { SizeGuide } from './utils/sizeCollector'
import type { PersonAnalysis } from './utils/personAnalyzer'

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
  // Initialize state from sessionStorage if available
  const [userData, setUserData] = useState<UserData>(() => {
    try {
      const saved = sessionStorage.getItem(SESSION_STORAGE_KEY)
      if (saved) {
        return JSON.parse(saved)
      }
    } catch {
      // Failed to restore session
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
      items: [],
      personAnalysis: null
    }
  })

  // Save to sessionStorage whenever userData changes
  useEffect(() => {
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
