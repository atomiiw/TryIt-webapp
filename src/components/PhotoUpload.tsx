import { useRef, forwardRef, useImperativeHandle } from 'react'
import sampleBackground from '../assets/Simple_upload.jpg'
import './PhotoUpload.css'

interface PhotoUploadProps {
  image: string | null
  onImageChange: (image: string | null) => void
}

export interface PhotoUploadHandle {
  captureFrame: () => Promise<string | null>
}

const PhotoUpload = forwardRef<PhotoUploadHandle, PhotoUploadProps>(
  ({ image, onImageChange }, ref) => {
    const fileInputRef = useRef<HTMLInputElement>(null)
    const frameRef = useRef<HTMLDivElement>(null)

    // Expose captureFrame method to parent
    useImperativeHandle(ref, () => ({
      captureFrame: async () => {
        if (!frameRef.current || !image) return null
        try {
          // Create a canvas to capture the current view
          const frame = frameRef.current
          const rect = frame.getBoundingClientRect()
          const canvas = document.createElement('canvas')
          canvas.width = rect.width
          canvas.height = rect.height
          const ctx = canvas.getContext('2d')
          if (!ctx) return null

          // Draw the image
          const img = new Image()
          img.crossOrigin = 'anonymous'

          return new Promise<string | null>((resolve) => {
            img.onload = () => {
              // Fill with background if needed
              ctx.fillStyle = '#000'
              ctx.fillRect(0, 0, canvas.width, canvas.height)

              // Calculate image dimensions to contain within frame
              const imgAspect = img.width / img.height
              const frameAspect = canvas.width / canvas.height
              let drawWidth, drawHeight, offsetX, offsetY

              if (imgAspect > frameAspect) {
                // Image is wider - fit to width
                drawWidth = canvas.width
                drawHeight = drawWidth / imgAspect
                offsetX = 0
                offsetY = (canvas.height - drawHeight) / 2
              } else {
                // Image is taller - fit to height
                drawHeight = canvas.height
                drawWidth = drawHeight * imgAspect
                offsetX = (canvas.width - drawWidth) / 2
                offsetY = 0
              }

              ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight)

              resolve(canvas.toDataURL('image/png'))
            }
            img.onerror = () => resolve(null)
            img.src = image
          })
        } catch (error) {
          console.error('Failed to capture frame:', error)
          return null
        }
      }
    }), [image])

    const handleClick = () => {
      if (!image) {
        fileInputRef.current?.click()
      }
    }

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) {
        const reader = new FileReader()
        reader.onload = (event) => {
          const result = event.target?.result as string
          onImageChange(result)
        }
        reader.readAsDataURL(file)
      }
    }

    const handleChangePhoto = () => {
      onImageChange(null)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }

    return (
      <div className="photo-upload">
        <div
          ref={frameRef}
          className={`upload-frame ${image ? 'has-image' : ''}`}
          onClick={!image ? handleClick : undefined}
        >
          {!image ? (
            <>
              <div
                className="sample-background"
                style={{ backgroundImage: `url(${sampleBackground})` }}
              />
              <div className="upload-placeholder">
                <svg className="person-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="12" cy="8" r="4" />
                  <path d="M4 20c0-4 4-7 8-7s8 3 8 7" />
                </svg>
                <span className="upload-text">Add a photo of the person</span>
                <span className="upload-hint">(full body preferred)</span>
              </div>
            </>
          ) : (
            <>
              {/* Blurred background fill */}
              <div
                className="blur-background"
                style={{ backgroundImage: `url(${image})` }}
              />
              {/* Main image - autofit, no zoom/pan */}
              <img
                src={image}
                alt="Uploaded"
                className="main-image"
                draggable={false}
              />
              {/* Change photo button - inside frame like regenerate */}
              <button className="change-photo-link" onClick={handleChangePhoto}>
                change photo
              </button>
            </>
          )}
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
)

export default PhotoUpload
