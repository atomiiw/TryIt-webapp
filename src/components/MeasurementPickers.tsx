import { useState, useRef, useEffect, useCallback } from 'react'
import type { UserData } from '../App'
import './MeasurementPickers.css'

interface MeasurementPickersProps {
  weight: number | null
  weightUnit: 'lb' | 'kg'
  height: number | null
  heightUnit: 'ft' | 'cm'
  heightInches: number | null
  onUpdate: (updates: Partial<UserData>) => void
}

// Generate weight options
const weightLbOptions = Array.from({ length: 301 }, (_, i) => 50 + i) // 50-350 lb
const weightKgOptions = Array.from({ length: 151 }, (_, i) => 20 + i) // 20-170 kg

// Generate height options
const heightFtOptions = [3, 4, 5, 6, 7]
const heightInOptions = Array.from({ length: 12 }, (_, i) => i) // 0-11 inches
const heightCmOptions = Array.from({ length: 121 }, (_, i) => 100 + i) // 100-220 cm

const ITEM_HEIGHT = 28

function MeasurementPickers({
  weight,
  weightUnit,
  height,
  heightUnit,
  heightInches,
  onUpdate
}: MeasurementPickersProps) {
  const [showWeightPicker, setShowWeightPicker] = useState(false)
  const [showHeightPicker, setShowHeightPicker] = useState(false)

  const weightScrollRef = useRef<HTMLDivElement>(null)
  const heightScrollRef = useRef<HTMLDivElement>(null)
  const ftScrollRef = useRef<HTMLDivElement>(null)
  const inScrollRef = useRef<HTMLDivElement>(null)

  const formatWeight = () => {
    if (weight === null) return 'Weight'
    return `${weight} ${weightUnit}`
  }

  const formatHeight = () => {
    if (height === null) return 'Height'
    if (heightUnit === 'ft') {
      return `${height}'${heightInches || 0}"`
    }
    return `${height} cm`
  }

  const handleWeightUnitToggle = (unit: 'lb' | 'kg') => {
    if (unit !== weightUnit) {
      let newWeight = weight
      if (weight !== null) {
        if (unit === 'kg') {
          newWeight = Math.round(weight * 0.453592)
        } else {
          newWeight = Math.round(weight / 0.453592)
        }
      }
      onUpdate({ weightUnit: unit, weight: newWeight })
    }
  }

  const handleHeightUnitToggle = (unit: 'ft' | 'cm') => {
    if (unit !== heightUnit) {
      let newHeight = height
      let newInches = heightInches
      if (height !== null) {
        if (unit === 'cm') {
          const totalInches = height * 12 + (heightInches || 0)
          newHeight = Math.round(totalInches * 2.54)
          newInches = null
        } else {
          const totalInches = Math.round(height / 2.54)
          newHeight = Math.floor(totalInches / 12)
          newInches = totalInches % 12
        }
      }
      onUpdate({ heightUnit: unit, height: newHeight, heightInches: newInches })
    }
  }

  // Scroll to selected value when picker opens
  const scrollToValue = useCallback((ref: React.RefObject<HTMLDivElement | null>, index: number) => {
    if (ref.current) {
      const scrollTop = index * ITEM_HEIGHT
      ref.current.scrollTo({ top: scrollTop, behavior: 'auto' })
    }
  }, [])

  // Handle scroll end - snap to nearest value
  const handleScrollEnd = useCallback((
    ref: React.RefObject<HTMLDivElement | null>,
    options: number[],
    onSelect: (val: number) => void
  ) => {
    if (!ref.current) return

    const scrollTop = ref.current.scrollTop
    const index = Math.round(scrollTop / ITEM_HEIGHT)
    const clampedIndex = Math.max(0, Math.min(index, options.length - 1))

    onSelect(options[clampedIndex])
  }, [])

  // Setup scroll listeners
  useEffect(() => {
    if (showWeightPicker && weightScrollRef.current) {
      const options = weightUnit === 'lb' ? weightLbOptions : weightKgOptions
      const currentIndex = weight !== null ? options.indexOf(weight) : 0
      scrollToValue(weightScrollRef, Math.max(0, currentIndex))

      let scrollTimeout: ReturnType<typeof setTimeout>
      const handleScroll = () => {
        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          handleScrollEnd(weightScrollRef, options, (val) => onUpdate({ weight: val }))
        }, 100)
      }

      const scrollEl = weightScrollRef.current
      scrollEl.addEventListener('scroll', handleScroll)
      return () => {
        scrollEl.removeEventListener('scroll', handleScroll)
        clearTimeout(scrollTimeout)
      }
    }
  }, [showWeightPicker, weightUnit, weight, scrollToValue, handleScrollEnd, onUpdate])

  useEffect(() => {
    if (showHeightPicker && heightUnit === 'cm' && heightScrollRef.current) {
      const currentIndex = height !== null ? heightCmOptions.indexOf(height) : 0
      scrollToValue(heightScrollRef, Math.max(0, currentIndex))

      let scrollTimeout: ReturnType<typeof setTimeout>
      const handleScroll = () => {
        clearTimeout(scrollTimeout)
        scrollTimeout = setTimeout(() => {
          handleScrollEnd(heightScrollRef, heightCmOptions, (val) => onUpdate({ height: val }))
        }, 100)
      }

      const scrollEl = heightScrollRef.current
      scrollEl.addEventListener('scroll', handleScroll)
      return () => {
        scrollEl.removeEventListener('scroll', handleScroll)
        clearTimeout(scrollTimeout)
      }
    }
  }, [showHeightPicker, heightUnit, height, scrollToValue, handleScrollEnd, onUpdate])

  useEffect(() => {
    if (showHeightPicker && heightUnit === 'ft') {
      if (ftScrollRef.current) {
        const ftIndex = height !== null ? heightFtOptions.indexOf(height) : 0
        scrollToValue(ftScrollRef, Math.max(0, ftIndex))

        let scrollTimeout: ReturnType<typeof setTimeout>
        const handleScroll = () => {
          clearTimeout(scrollTimeout)
          scrollTimeout = setTimeout(() => {
            handleScrollEnd(ftScrollRef, heightFtOptions, (val) => onUpdate({ height: val }))
          }, 100)
        }

        const scrollEl = ftScrollRef.current
        scrollEl.addEventListener('scroll', handleScroll)
        return () => {
          scrollEl.removeEventListener('scroll', handleScroll)
          clearTimeout(scrollTimeout)
        }
      }
    }
  }, [showHeightPicker, heightUnit, height, scrollToValue, handleScrollEnd, onUpdate])

  useEffect(() => {
    if (showHeightPicker && heightUnit === 'ft') {
      if (inScrollRef.current) {
        const inIndex = heightInches !== null ? heightInOptions.indexOf(heightInches) : 0
        scrollToValue(inScrollRef, Math.max(0, inIndex))

        let scrollTimeout: ReturnType<typeof setTimeout>
        const handleScroll = () => {
          clearTimeout(scrollTimeout)
          scrollTimeout = setTimeout(() => {
            handleScrollEnd(inScrollRef, heightInOptions, (val) => onUpdate({ heightInches: val }))
          }, 100)
        }

        const scrollEl = inScrollRef.current
        scrollEl.addEventListener('scroll', handleScroll)
        return () => {
          scrollEl.removeEventListener('scroll', handleScroll)
          clearTimeout(scrollTimeout)
        }
      }
    }
  }, [showHeightPicker, heightUnit, heightInches, scrollToValue, handleScrollEnd, onUpdate])

  return (
    <div className="measurement-pickers">
      {/* Weight Picker */}
      <div className="picker-column">
        <div className="unit-toggle">
          <button
            className={weightUnit === 'lb' ? 'active' : ''}
            onClick={() => handleWeightUnitToggle('lb')}
          >
            lb
          </button>
          <span>|</span>
          <button
            className={weightUnit === 'kg' ? 'active' : ''}
            onClick={() => handleWeightUnitToggle('kg')}
          >
            kg
          </button>
        </div>

        <div className="picker-display" onClick={() => setShowWeightPicker(!showWeightPicker)}>
          <span>{formatWeight()}</span>
          <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        {showWeightPicker && (
          <div className="picker-dropdown">
            <div className="picker-wheel">
              <div className="picker-scroll" ref={weightScrollRef}>
                <div className="picker-spacer" />
                {(weightUnit === 'lb' ? weightLbOptions : weightKgOptions).map(val => (
                  <div
                    key={val}
                    className={`picker-option ${weight === val ? 'centered' : ''}`}
                    onClick={() => {
                      onUpdate({ weight: val })
                      setShowWeightPicker(false)
                    }}
                  >
                    {val} {weightUnit}
                  </div>
                ))}
                <div className="picker-spacer" />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Height Picker */}
      <div className="picker-column">
        <div className="unit-toggle">
          <button
            className={heightUnit === 'ft' ? 'active' : ''}
            onClick={() => handleHeightUnitToggle('ft')}
          >
            ft
          </button>
          <span>|</span>
          <button
            className={heightUnit === 'cm' ? 'active' : ''}
            onClick={() => handleHeightUnitToggle('cm')}
          >
            cm
          </button>
        </div>

        <div className="picker-display" onClick={() => setShowHeightPicker(!showHeightPicker)}>
          <span>{formatHeight()}</span>
          <svg className="chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>

        {showHeightPicker && (
          <div className="picker-dropdown">
            <div className="picker-wheel">
              {heightUnit === 'cm' ? (
                <div className="picker-scroll" ref={heightScrollRef}>
                  <div className="picker-spacer" />
                  {heightCmOptions.map(val => (
                    <div
                      key={val}
                      className={`picker-option ${height === val ? 'centered' : ''}`}
                      onClick={() => {
                        onUpdate({ height: val })
                        setShowHeightPicker(false)
                      }}
                    >
                      {val} cm
                    </div>
                  ))}
                  <div className="picker-spacer" />
                </div>
              ) : (
                <div className="picker-scroll dual">
                  <div className="picker-sub-column" ref={ftScrollRef}>
                    <div className="picker-spacer" />
                    {heightFtOptions.map(val => (
                      <div
                        key={val}
                        className={`picker-option ${height === val ? 'centered' : ''}`}
                        onClick={() => onUpdate({ height: val })}
                      >
                        {val} ft
                      </div>
                    ))}
                    <div className="picker-spacer" />
                  </div>
                  <div className="picker-sub-column" ref={inScrollRef}>
                    <div className="picker-spacer" />
                    {heightInOptions.map(val => (
                      <div
                        key={val}
                        className={`picker-option ${heightInches === val ? 'centered' : ''}`}
                        onClick={() => onUpdate({ heightInches: val })}
                      >
                        {val} in
                      </div>
                    ))}
                    <div className="picker-spacer" />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

export default MeasurementPickers
