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
  const [isInteracting, setIsInteracting] = useState(false) // Track user interaction for transitions
  const [lastSelectedInPair, setLastSelectedInPair] = useState<Record<string, RatioLabel>>({}) // Remember last selection per pair

  const containerRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLImageElement>(null)
  const ratioSelectorRef = useRef<HTMLDivElement>(null)
  const isDragging = useRef(false)
  const lastPosition = useRef({ x: 0, y: 0 })
  const lastTouchDistance = useRef<number | null>(null)
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null)
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

      let cropWidth, cropHeight

      // Default: fill full width
      cropWidth = containerWidth
      cropHeight = cropWidth / selectedRatio.value

      // If height exceeds container (e.g. 9:16 portrait), fill height instead
      if (cropHeight > containerHeight) {
        cropHeight = containerHeight
        cropWidth = cropHeight * selectedRatio.value
      }

      setCropAreaSize({ width: cropWidth, height: cropHeight })
    }

    updateCropArea()
    window.addEventListener('resize', updateCropArea)
    return () => window.removeEventListener('resize', updateCropArea)
  }, [selectedRatio])

  // Track if this is the first load (to set initial scale to fill width)
  const isFirstLoad = useRef(true)

  // Load image dimensions on mount
  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height })
    }
    img.src = image
  }, [image])

  // Set initial scale when image loads (fill container width)
  useEffect(() => {
    if (imageSize.width === 0 || !containerRef.current) return

    if (isFirstLoad.current) {
      // First load: scale image width to fill container width
      const containerWidth = containerRef.current.clientWidth
      const widthFillScale = containerWidth / imageSize.width
      initialScale.current = widthFillScale
      setScale(widthFillScale)
      setPosition({ x: 0, y: 0 })
      isFirstLoad.current = false
      setImageLoaded(true)
    }
  }, [imageSize])

  // When ratio changes, always reset to fill-width zoom
  useEffect(() => {
    if (cropAreaSize.width === 0 || cropAreaSize.height === 0 || imageSize.width === 0) return
    if (isFirstLoad.current) return // Skip if first load hasn't happened yet
    if (!containerRef.current) return

    // Always reset to fill container width when ratio changes
    const containerWidth = containerRef.current.clientWidth
    const widthFillScale = containerWidth / imageSize.width

    // But ensure it still covers the crop area
    const minScaleX = cropAreaSize.width / imageSize.width
    const minScaleY = cropAreaSize.height / imageSize.height
    const minScale = Math.max(minScaleX, minScaleY)

    // Use the larger of fill-width scale or minimum needed
    const newScale = Math.max(widthFillScale, minScale * 1.001)

    setScale(newScale)
    setPosition({ x: 0, y: 0 }) // Reset position to center

    setImageLoaded(true)
  }, [cropAreaSize, imageSize])

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
    setIsInteracting(true)
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
    setIsInteracting(false)
    lastTouchDistance.current = null
    lastTouchCenter.current = null
  }

  // Touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      handleStart(e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2) {
      isDragging.current = false
      setIsInteracting(true) // Pinch zoom is also interaction
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      lastTouchDistance.current = dist
      // Track center point for two-finger pan
      lastTouchCenter.current = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      }
    }
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    e.preventDefault()

    if (e.touches.length === 1 && isDragging.current) {
      handleMove(e.touches[0].clientX, e.touches[0].clientY)
    } else if (e.touches.length === 2 && lastTouchDistance.current && lastTouchCenter.current) {
      // Calculate new distance for zoom
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )

      // Calculate new center point for pan
      const newCenter = {
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      }

      // Calculate pan delta
      const panDelta = {
        x: newCenter.x - lastTouchCenter.current.x,
        y: newCenter.y - lastTouchCenter.current.y
      }

      const scaleFactor = dist / lastTouchDistance.current
      const minScale = getMinScale()
      const newScale = Math.max(minScale, Math.min(5, scale * scaleFactor))

      setScale(newScale)
      // Apply both zoom and pan
      setPosition(prev => constrainPosition({
        x: prev.x + panDelta.x,
        y: prev.y + panDelta.y
      }, newScale))

      lastTouchDistance.current = dist
      lastTouchCenter.current = newCenter
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
  const handleRatioChange = (ratio: AspectRatio, pairKey?: string) => {
    setSelectedRatio(ratio)
    // Remember which ratio was selected in this pair
    if (pairKey) {
      setLastSelectedInPair(prev => ({ ...prev, [pairKey]: ratio.label }))
    }
    // Don't set imageLoaded to false - keep image mounted for smooth transition
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
              className={`cropper-image ${isInteracting ? 'dragging' : ''}`}
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

        {/* Aspect ratio selector - centered */}
        <div className="ratio-selector">
          <div className="ratio-options" ref={ratioSelectorRef}>
            {RATIO_BUTTONS.map((btn) => {
              const isPair = btn.labels.length === 2
              const pairKey = btn.labels[0] // Use first label as key for the pair
              // Check if this button contains the selected ratio
              const isActive = selectedRatio && btn.labels.includes(selectedRatio.label)
              // Get the currently displayed label: selected if active, last remembered, or first as default
              const rememberedLabel = lastSelectedInPair[pairKey]
              const displayLabel = isActive
                ? selectedRatio.label
                : (rememberedLabel && btn.labels.includes(rememberedLabel) ? rememberedLabel : btn.labels[0])
              const displayValue = ALL_RATIOS[displayLabel]
              // Get the opposite ratio for pairs (to show as ghost)
              const ghostLabel = isPair ? btn.labels.find(l => l !== displayLabel) : null
              const ghostValue = ghostLabel ? ALL_RATIOS[ghostLabel] : null

              const handleClick = () => {
                if (isActive && isPair) {
                  // Toggle to the other ratio in the pair
                  const otherLabel = btn.labels.find(l => l !== selectedRatio.label)!
                  handleRatioChange({ label: otherLabel, value: ALL_RATIOS[otherLabel] }, pairKey)
                } else if (!isActive) {
                  // Use remembered label or default to first
                  const labelToUse = rememberedLabel && btn.labels.includes(rememberedLabel) ? rememberedLabel : btn.labels[0]
                  handleRatioChange({ label: labelToUse, value: ALL_RATIOS[labelToUse] }, pairKey)
                }
              }

              return (
                <button
                  key={btn.labels[0]}
                  className={`ratio-btn ${isActive ? 'active' : ''} ${isPair ? 'toggleable' : ''}`}
                  onClick={handleClick}
                >
                  <div className="ratio-icon-container">
                    {/* Ghost icon for toggleable pairs */}
                    {isPair && ghostValue && (
                      <div
                        className="ratio-icon ghost"
                        style={{
                          aspectRatio: `${ghostValue}`,
                          ...(ghostValue < 1
                            ? { height: '24px' }
                            : { width: '24px' }
                          ),
                        }}
                      />
                    )}
                    {/* Main icon */}
                    <div
                      className="ratio-icon"
                      style={{
                        aspectRatio: `${displayValue}`,
                        ...(displayValue < 1
                          ? { height: '24px' }
                          : { width: '24px' }
                        ),
                      }}
                    />
                  </div>
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
