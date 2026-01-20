import { useState, useRef, useEffect, useCallback } from 'react'
import './ImageCropper.css'

// Individual aspect ratios
const ALL_RATIOS = {
  '9:16': 9/16,
  '16:9': 16/9,
  '2:3': 2/3,
  '3:2': 3/2,
  '3:4': 3/4,
  '4:3': 4/3,
  '4:5': 4/5,
  '5:4': 5/4,
  '1:1': 1,
  '21:9': 21/9,
} as const

type RatioLabel = keyof typeof ALL_RATIOS

// Ratio buttons - pairs are toggleable, singles are not
const RATIO_BUTTONS: { labels: [RatioLabel] | [RatioLabel, RatioLabel] }[] = [
  { labels: ['9:16', '16:9'] },
  { labels: ['2:3', '3:2'] },
  { labels: ['3:4', '4:3'] },
  { labels: ['4:5', '5:4'] },
  { labels: ['1:1'] },
  { labels: ['21:9'] },
]

interface AspectRatio {
  label: RatioLabel
  value: number
}

// Find closest aspect ratio to given dimensions
function findClosestRatio(width: number, height: number): AspectRatio {
  const imageRatio = width / height
  let closestLabel: RatioLabel = '3:4'
  let minDiff = Infinity

  for (const [label, value] of Object.entries(ALL_RATIOS)) {
    const diff = Math.abs(imageRatio - value)
    if (diff < minDiff) {
      minDiff = diff
      closestLabel = label as RatioLabel
    }
  }
  return { label: closestLabel, value: ALL_RATIOS[closestLabel] }
}

interface ImageCropperProps {
  image: string
  onCrop: (croppedImage: string) => void
  onCancel: () => void
}

export default function ImageCropper({ image, onCrop, onCancel }: ImageCropperProps) {
  const [selectedRatio, setSelectedRatio] = useState<AspectRatio | null>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [cropAreaSize, setCropAreaSize] = useState({ width: 0, height: 0 })
  const [imageLoaded, setImageLoaded] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const ratioSelectorRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const lastPosition = useRef({ x: 0, y: 0 })
  const lastTouchDistance = useRef<number | null>(null)
  const initialScale = useRef(1)

  // Auto-detect closest ratio on initial image load
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      const closest = findClosestRatio(img.width, img.height)
      setSelectedRatio(closest)

      // Scroll to the selected ratio button after a short delay
      setTimeout(() => {
        if (ratioSelectorRef.current) {
          const selectedBtn = ratioSelectorRef.current.querySelector('.ratio-btn.active')
          if (selectedBtn) {
            selectedBtn.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' })
          }
        }
      }, 100)
    }
    img.src = image
  }, [image])

  // Calculate crop area size based on container and aspect ratio
  useEffect(() => {
    if (!selectedRatio) return

    const updateCropArea = () => {
      if (!containerRef.current) return

      const container = containerRef.current
      const containerWidth = container.clientWidth
      const containerHeight = container.clientHeight
      const padding = 32

      const maxWidth = containerWidth - padding * 2
      const maxHeight = containerHeight - padding * 2

      let cropWidth, cropHeight

      if (selectedRatio.value <= 1) {
        // Portrait or square - constrain by height first
        cropHeight = Math.min(maxHeight, maxWidth / selectedRatio.value)
        cropWidth = cropHeight * selectedRatio.value
        // Make sure it fits width too
        if (cropWidth > maxWidth) {
          cropWidth = maxWidth
          cropHeight = cropWidth / selectedRatio.value
        }
      } else {
        // Landscape - constrain by width first
        cropWidth = Math.min(maxWidth, maxHeight * selectedRatio.value)
        cropHeight = cropWidth / selectedRatio.value
        // Make sure it fits height too
        if (cropHeight > maxHeight) {
          cropHeight = maxHeight
          cropWidth = cropHeight * selectedRatio.value
        }
      }

      setCropAreaSize({ width: cropWidth, height: cropHeight })
    }

    updateCropArea()
    window.addEventListener('resize', updateCropArea)
    return () => window.removeEventListener('resize', updateCropArea)
  }, [selectedRatio])

  // Load image and set initial scale when ratio or image changes
  useEffect(() => {
    if (cropAreaSize.width === 0 || cropAreaSize.height === 0) return

    const img = new Image()
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height })

      // Calculate initial scale to cover crop area
      const scaleX = cropAreaSize.width / img.width
      const scaleY = cropAreaSize.height / img.height
      const newScale = Math.max(scaleX, scaleY) * 1.001

      initialScale.current = newScale
      setScale(newScale)
      setPosition({ x: 0, y: 0 })
      setImageLoaded(true)
    }
    img.src = image
  }, [image, cropAreaSize])

  // Constrain position to keep crop area covered
  const constrainPosition = useCallback((pos: { x: number; y: number }, currentScale: number) => {
    if (imageSize.width === 0 || cropAreaSize.width === 0) return pos

    const scaledWidth = imageSize.width * currentScale
    const scaledHeight = imageSize.height * currentScale

    const maxX = Math.max(0, (scaledWidth - cropAreaSize.width) / 2)
    const maxY = Math.max(0, (scaledHeight - cropAreaSize.height) / 2)

    return {
      x: Math.max(-maxX, Math.min(maxX, pos.x)),
      y: Math.max(-maxY, Math.min(maxY, pos.y))
    }
  }, [imageSize, cropAreaSize])

  // Get minimum scale to cover crop area
  const getMinScale = useCallback(() => {
    if (imageSize.width === 0 || cropAreaSize.width === 0) return 1
    const scaleX = cropAreaSize.width / imageSize.width
    const scaleY = cropAreaSize.height / imageSize.height
    return Math.max(scaleX, scaleY)
  }, [imageSize, cropAreaSize])

  // Handle start of drag
  const handleStart = (clientX: number, clientY: number) => {
    isDragging.current = true
    lastPosition.current = { x: clientX - position.x, y: clientY - position.y }
  }

  // Handle drag move
  const handleMove = (clientX: number, clientY: number) => {
    if (!isDragging.current) return

    const newPos = {
      x: clientX - lastPosition.current.x,
      y: clientY - lastPosition.current.y
    }

    setPosition(constrainPosition(newPos, scale))
  }

  // Handle end of drag
  const handleEnd = () => {
    isDragging.current = false
    lastTouchDistance.current = null
  }

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleStart(e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2) {
      isDragging.current = false
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      lastTouchDistance.current = dist
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()

    if (e.touches.length === 1 && isDragging.current) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2 && lastTouchDistance.current) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )

      const scaleFactor = dist / lastTouchDistance.current
      const minScale = getMinScale()
      const newScale = Math.max(minScale, Math.min(5, scale * scaleFactor))

      setScale(newScale)
      setPosition(prev => constrainPosition(prev, newScale))
      lastTouchDistance.current = dist
    }
  }

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault()
    handleStart(e.clientX, e.clientY)
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    handleMove(e.clientX, e.clientY)
  }

  // Wheel zoom
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const delta = e.deltaY > 0 ? 0.95 : 1.05
    const minScale = getMinScale()
    const newScale = Math.max(minScale, Math.min(5, scale * delta))

    setScale(newScale)
    setPosition(prev => constrainPosition(prev, newScale))
  }

  // Crop and output
  const handleCrop = () => {
    if (!imageRef.current || imageSize.width === 0 || !selectedRatio) return

    const canvas = document.createElement('canvas')
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Output at high quality (max 1536px on longest side)
    const maxOutputSize = 1536
    let outputWidth, outputHeight

    if (selectedRatio.value >= 1) {
      outputWidth = maxOutputSize
      outputHeight = Math.round(maxOutputSize / selectedRatio.value)
    } else {
      outputHeight = maxOutputSize
      outputWidth = Math.round(maxOutputSize * selectedRatio.value)
    }

    canvas.width = outputWidth
    canvas.height = outputHeight

    // Calculate source rectangle from the image
    const scaledWidth = imageSize.width * scale
    const scaledHeight = imageSize.height * scale

    // Center of crop area in scaled image coordinates
    const cropCenterX = scaledWidth / 2 - position.x
    const cropCenterY = scaledHeight / 2 - position.y

    // Source rectangle in original image coordinates
    const srcX = (cropCenterX - cropAreaSize.width / 2) / scale
    const srcY = (cropCenterY - cropAreaSize.height / 2) / scale
    const srcWidth = cropAreaSize.width / scale
    const srcHeight = cropAreaSize.height / scale

    ctx.drawImage(
      imageRef.current,
      srcX, srcY, srcWidth, srcHeight,
      0, 0, outputWidth, outputHeight
    )

    onCrop(canvas.toDataURL('image/jpeg', 0.92))
  }

  // Handle ratio change
  const handleRatioChange = (ratio: AspectRatio) => {
    setSelectedRatio(ratio)
    setImageLoaded(false)
  }

  return (
    <div className="image-cropper-overlay">
      <div className="image-cropper-modal">
        {/* Header */}
        <div className="cropper-header">
          <button className="cropper-btn cancel" onClick={onCancel}>Cancel</button>
          <span className="cropper-title">Crop</span>
          <button className="cropper-btn done" onClick={handleCrop}>Done</button>
        </div>

        {/* Crop area */}
        <div
          ref={containerRef}
          className="cropper-container"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleEnd}
          onMouseLeave={handleEnd}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleEnd}
          onWheel={handleWheel}
        >
          {/* Image */}
          {imageLoaded && (
            <img
              ref={imageRef}
              src={image}
              alt="Crop preview"
              className="cropper-image"
              style={{
                transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${scale})`,
              }}
              draggable={false}
            />
          )}

          {/* Dark overlay with transparent crop window */}
          <div className="cropper-mask">
            <div
              className="crop-window"
              style={{
                width: cropAreaSize.width,
                height: cropAreaSize.height,
              }}
            >
              {/* Grid lines */}
              <div className="crop-grid">
                <div className="grid-line h" style={{ top: '33.33%' }} />
                <div className="grid-line h" style={{ top: '66.66%' }} />
                <div className="grid-line v" style={{ left: '33.33%' }} />
                <div className="grid-line v" style={{ left: '66.66%' }} />
              </div>
            </div>
          </div>
        </div>

        {/* Aspect ratio selector - horizontally scrollable */}
        <div className="ratio-selector">
          <div className="ratio-options" ref={ratioSelectorRef}>
            {RATIO_BUTTONS.map((btn) => {
              // Check if this button contains the selected ratio
              const isActive = selectedRatio && btn.labels.includes(selectedRatio.label)
              // Get the currently displayed label (selected one if active, first one otherwise)
              const displayLabel = isActive ? selectedRatio.label : btn.labels[0]
              const displayValue = ALL_RATIOS[displayLabel]

              const handleClick = () => {
                if (isActive && btn.labels.length === 2) {
                  // Toggle to the other ratio in the pair
                  const otherLabel = btn.labels.find(l => l !== selectedRatio.label)!
                  handleRatioChange({ label: otherLabel, value: ALL_RATIOS[otherLabel] })
                } else {
                  // Select the first ratio in the pair
                  handleRatioChange({ label: btn.labels[0], value: ALL_RATIOS[btn.labels[0]] })
                }
              }

              return (
                <button
                  key={btn.labels[0]}
                  className={`ratio-btn ${isActive ? 'active' : ''}`}
                  onClick={handleClick}
                >
                  <div
                    className="ratio-icon"
                    style={{
                      aspectRatio: `${displayValue}`,
                      // Portrait: fix height, Landscape: fix width
                      ...(displayValue < 1
                        ? { height: '24px' }
                        : { width: '24px' }
                      ),
                    }}
                  />
                  <span className="ratio-label">{displayLabel}</span>
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
