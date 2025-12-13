import type { UserData } from '../types'
import './Preview.css'

interface PreviewProps {
  userData: UserData
  onStartOver: () => void
}

function Preview({ userData, onStartOver }: PreviewProps) {
  const formatHeight = () => {
    if (userData.heightUnit === 'ft') {
      const totalInches = Math.round(userData.height / 2.54)
      const feet = Math.floor(totalInches / 12)
      const inches = totalInches % 12
      return `${feet}'${inches}"`
    }
    return `${userData.height} cm`
  }

  const formatWeight = () => {
    if (userData.weightUnit === 'lb') {
      return `${Math.round(userData.weight / 0.453592)} lb`
    }
    return `${userData.weight} kg`
  }

  return (
    <div className="preview">
      <h2>Your Profile</h2>
      <p className="preview-hint">Review your information</p>

      <div className="preview-image-container">
        <img src={userData.image} alt="Profile" className="preview-image" />
      </div>

      <div className="preview-details">
        <div className="preview-item">
          <span className="preview-label">Gender</span>
          <span className="preview-value">{userData.gender === 'male' ? 'Male' : 'Female'}</span>
        </div>
        <div className="preview-item">
          <span className="preview-label">Height</span>
          <span className="preview-value">{formatHeight()}</span>
        </div>
        <div className="preview-item">
          <span className="preview-label">Weight</span>
          <span className="preview-value">{formatWeight()}</span>
        </div>
      </div>

      <div className="preview-status">
        <div className="processing-indicator">
          <div className="spinner" />
          <span>Processing your measurements...</span>
        </div>
      </div>

      <div className="preview-actions">
        <button className="btn-secondary" onClick={onStartOver}>Start Over</button>
      </div>
    </div>
  )
}

export default Preview
