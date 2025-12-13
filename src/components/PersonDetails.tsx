import { useRef } from 'react'
import './PersonDetails.css'

interface PersonDetailsProps {
  height: number | null
  weight: number | null
  gender: string | null
  onHeightChange: (height: number) => void
  onWeightChange: (weight: number) => void
  onGenderChange: (gender: string) => void
}

function PersonDetails({
  height,
  weight,
  gender,
  onHeightChange,
  onWeightChange,
  onGenderChange
}: PersonDetailsProps) {
  const heightInputRef = useRef<HTMLInputElement>(null)
  const weightInputRef = useRef<HTMLInputElement>(null)

  return (
    <div className="person-details">
      <h2 className="section-header">Tell us about them</h2>
      <p className="section-subtext">Helps us estimate their best fit.</p>

      <div className="input-group">
        <div className="input-field">
          <div className="input-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <line x1="4" y1="21" x2="4" y2="3" />
              <line x1="2" y1="21" x2="6" y2="21" />
              <line x1="2" y1="3" x2="6" y2="3" />
              <line x1="4" y1="8" x2="8" y2="8" />
              <line x1="4" y1="13" x2="6" y2="13" />
              <line x1="4" y1="18" x2="6" y2="18" />
            </svg>
          </div>
          <input
            ref={heightInputRef}
            type="number"
            inputMode="numeric"
            placeholder="Height (cm)"
            value={height || ''}
            onChange={(e) => onHeightChange(parseInt(e.target.value) || 0)}
          />
        </div>

        <div className="input-field">
          <div className="input-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="4" y="8" width="16" height="12" rx="2" />
              <line x1="12" y1="8" x2="12" y2="4" />
              <circle cx="12" cy="4" r="1" fill="currentColor" />
              <line x1="8" y1="14" x2="16" y2="14" />
            </svg>
          </div>
          <input
            ref={weightInputRef}
            type="number"
            inputMode="numeric"
            placeholder="Weight (kg)"
            value={weight || ''}
            onChange={(e) => onWeightChange(parseInt(e.target.value) || 0)}
          />
        </div>

        <div className="input-field">
          <div className="input-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <circle cx="12" cy="7" r="3" />
              <path d="M12 10c-4 0-6 3-6 6v4h12v-4c0-3-2-6-6-6z" />
            </svg>
          </div>
          <select
            value={gender || ''}
            onChange={(e) => onGenderChange(e.target.value)}
          >
            <option value="" disabled>Gender</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="nonbinary">Nonbinary</option>
            <option value="prefer-not-to-say">Prefer Not to Say</option>
          </select>
        </div>
      </div>
    </div>
  )
}

export default PersonDetails
