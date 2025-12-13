import { useRef } from 'react'
import './ImageUploader.css'

interface ImageUploaderProps {
  onImageUpload: (imageDataUrl: string) => void
}

function ImageUploader({ onImageUpload }: ImageUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      const reader = new FileReader()
      reader.onload = (event) => {
        const result = event.target?.result as string
        onImageUpload(result)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <div className="image-uploader">
      <div className="camera-box" onClick={handleClick}>
        <div className="camera-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="5" width="18" height="14" rx="2" />
            <circle cx="12" cy="12" r="3" />
            <path d="M7 5V3h10v2" />
          </svg>
        </div>
        <p className="upload-text">Tap to upload a photo</p>
        <p className="upload-hint">Select a full-body photo for best results</p>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden-input"
      />
    </div>
  )
}

export default ImageUploader
