import { useState, useRef, useEffect } from 'react'
import './MeasurementInput.css'

interface MeasurementInputProps {
  onComplete: (data: {
    gender: 'male' | 'female'
    height: number
    heightUnit: 'cm' | 'ft'
    weight: number
    weightUnit: 'kg' | 'lb'
  }) => void
  onBack: () => void
}

// Generate height options
const heightOptionsCm = Array.from({ length: 151 }, (_, i) => 50 + i) // 50cm to 200cm (child to adult)
const heightOptionsFt = [
  '1\'8"', '1\'9"', '1\'10"', '1\'11"',
  '2\'0"', '2\'1"', '2\'2"', '2\'3"', '2\'4"', '2\'5"', '2\'6"', '2\'7"', '2\'8"', '2\'9"', '2\'10"', '2\'11"',
  '3\'0"', '3\'1"', '3\'2"', '3\'3"', '3\'4"', '3\'5"', '3\'6"', '3\'7"', '3\'8"', '3\'9"', '3\'10"', '3\'11"',
  '4\'0"', '4\'1"', '4\'2"', '4\'3"', '4\'4"', '4\'5"', '4\'6"', '4\'7"', '4\'8"', '4\'9"', '4\'10"', '4\'11"',
  '5\'0"', '5\'1"', '5\'2"', '5\'3"', '5\'4"', '5\'5"', '5\'6"', '5\'7"', '5\'8"', '5\'9"', '5\'10"', '5\'11"',
  '6\'0"', '6\'1"', '6\'2"', '6\'3"', '6\'4"', '6\'5"', '6\'6"', '6\'7"', '6\'8"', '6\'9"', '6\'10"', '6\'11"',
  '7\'0"'
]

// Convert ft'in" string to total inches
const ftToInches = (ftStr: string): number => {
  const match = ftStr.match(/(\d+)'(\d+)"/)
  if (match) {
    return parseInt(match[1]) * 12 + parseInt(match[2])
  }
  return 0
}

// Generate weight options
const weightOptionsKg = Array.from({ length: 171 }, (_, i) => 10 + i) // 10kg to 180kg
const weightOptionsLb = Array.from({ length: 376 }, (_, i) => 22 + i) // 22lb to 397lb

interface ScrollPickerProps {
  options: (string | number)[]
  value: string | number
  onChange: (value: string | number) => void
  unit: string
}

function ScrollPicker({ options, value, onChange, unit }: ScrollPickerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const itemHeight = 50
  const visibleItems = 5

  const selectedIndex = options.findIndex(opt => opt === value)

  useEffect(() => {
    if (containerRef.current) {
      const scrollTop = selectedIndex * itemHeight
      containerRef.current.scrollTop = scrollTop
    }
  }, [selectedIndex])

  const handleScroll = () => {
    if (containerRef.current) {
      const scrollTop = containerRef.current.scrollTop
      const index = Math.round(scrollTop / itemHeight)
      const clampedIndex = Math.max(0, Math.min(index, options.length - 1))
      if (options[clampedIndex] !== value) {
        onChange(options[clampedIndex])
      }
    }
  }

  return (
    <div className="scroll-picker-wrapper">
      <div className="scroll-picker-highlight" />
      <div
        className="scroll-picker"
        ref={containerRef}
        onScroll={handleScroll}
        style={{ height: itemHeight * visibleItems }}
      >
        <div style={{ height: itemHeight * 2 }} />
        {options.map((option, index) => (
          <div
            key={index}
            className={`scroll-picker-item ${option === value ? 'selected' : ''}`}
            style={{ height: itemHeight }}
            onClick={() => {
              onChange(option)
              if (containerRef.current) {
                containerRef.current.scrollTo({
                  top: index * itemHeight,
                  behavior: 'smooth'
                })
              }
            }}
          >
            {option} {unit}
          </div>
        ))}
        <div style={{ height: itemHeight * 2 }} />
      </div>
    </div>
  )
}

function MeasurementInput({ onComplete, onBack }: MeasurementInputProps) {
  const [gender, setGender] = useState<'male' | 'female'>('male')
  const [heightUnit, setHeightUnit] = useState<'cm' | 'ft'>('cm')
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg')
  const [heightCm, setHeightCm] = useState<number>(170)
  const [heightFt, setHeightFt] = useState<string>('5\'7"')
  const [weightKg, setWeightKg] = useState<number>(70)
  const [weightLb, setWeightLb] = useState<number>(154)

  const handleContinue = () => {
    let finalHeight: number
    let finalWeight: number

    if (heightUnit === 'cm') {
      finalHeight = heightCm
    } else {
      // Convert ft'in" to cm for storage
      finalHeight = Math.round(ftToInches(heightFt) * 2.54)
    }

    if (weightUnit === 'kg') {
      finalWeight = weightKg
    } else {
      // Convert lb to kg for storage
      finalWeight = Math.round(weightLb * 0.453592)
    }

    onComplete({
      gender,
      height: finalHeight,
      heightUnit,
      weight: finalWeight,
      weightUnit
    })
  }

  return (
    <div className="measurement-input">
      <h2>Enter Measurements</h2>
      <p className="measurement-hint">Scroll to select your measurements</p>

      {/* Gender Selection */}
      <div className="measurement-section">
        <label>Gender</label>
        <div className="gender-toggle">
          <button
            className={gender === 'male' ? 'active' : ''}
            onClick={() => setGender('male')}
          >
            Male
          </button>
          <button
            className={gender === 'female' ? 'active' : ''}
            onClick={() => setGender('female')}
          >
            Female
          </button>
        </div>
      </div>

      {/* Height Section */}
      <div className="measurement-section">
        <div className="section-header">
          <label>Height</label>
          <div className="unit-toggle">
            <button
              className={heightUnit === 'cm' ? 'active' : ''}
              onClick={() => setHeightUnit('cm')}
            >
              cm
            </button>
            <button
              className={heightUnit === 'ft' ? 'active' : ''}
              onClick={() => setHeightUnit('ft')}
            >
              ft
            </button>
          </div>
        </div>
        {heightUnit === 'cm' ? (
          <ScrollPicker
            options={heightOptionsCm}
            value={heightCm}
            onChange={(v) => setHeightCm(v as number)}
            unit="cm"
          />
        ) : (
          <ScrollPicker
            options={heightOptionsFt}
            value={heightFt}
            onChange={(v) => setHeightFt(v as string)}
            unit=""
          />
        )}
      </div>

      {/* Weight Section */}
      <div className="measurement-section">
        <div className="section-header">
          <label>Weight</label>
          <div className="unit-toggle">
            <button
              className={weightUnit === 'kg' ? 'active' : ''}
              onClick={() => setWeightUnit('kg')}
            >
              kg
            </button>
            <button
              className={weightUnit === 'lb' ? 'active' : ''}
              onClick={() => setWeightUnit('lb')}
            >
              lb
            </button>
          </div>
        </div>
        {weightUnit === 'kg' ? (
          <ScrollPicker
            options={weightOptionsKg}
            value={weightKg}
            onChange={(v) => setWeightKg(v as number)}
            unit="kg"
          />
        ) : (
          <ScrollPicker
            options={weightOptionsLb}
            value={weightLb}
            onChange={(v) => setWeightLb(v as number)}
            unit="lb"
          />
        )}
      </div>

      <div className="measurement-actions">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" onClick={handleContinue}>Continue</button>
      </div>
    </div>
  )
}

export default MeasurementInput
