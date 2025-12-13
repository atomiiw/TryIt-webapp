import { useState, useRef, useEffect } from 'react'
import './ImageCropper.css'

interface ImageCropperProps {
  imageSrc: string
  onCropComplete: (croppedDataUrl: string) => void
  onBack: () => void
}

function ImageCropper({ imageSrc, onCropComplete, onBack }: ImageCropperProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 })
  const [fillMode, setFillMode] = useState<'cover' | 'contain'>('cover')

  const FRAME_RATIO = 4 / 3 // 4:3 aspect ratio (width:height -> but displayed as portrait so 3:4)
  const FRAME_WIDTH = 300
  const FRAME_HEIGHT = FRAME_WIDTH * FRAME_RATIO // 400px for 3:4 portrait

  useEffect(() => {
    const img = new Image()
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height })

      // Calculate initial scale to fit the frame
      const imgRatio = img.width / img.height
      const frameRatio = FRAME_WIDTH / FRAME_HEIGHT

      let initialScale: number
      if (fillMode === 'cover') {
        // Cover: image fills the frame completely
        if (imgRatio > frameRatio) {
          initialScale = FRAME_HEIGHT / img.height
        } else {
          initialScale = FRAME_WIDTH / img.width
        }
      } else {
        // Contain: entire image visible within frame
        if (imgRatio > frameRatio) {
          initialScale = FRAME_WIDTH / img.width
        } else {
          initialScale = FRAME_HEIGHT / img.height
        }
      }

      setScale(initialScale)
      setPosition({ x: 0, y: 0 })
    }
    img.src = imageSrc
  }, [imageSrc, fillMode])

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y
    })
  }

  const handleMouseUp = () => {
    setIsDragging(false)
  }

  const handleTouchStart = (e: React.TouchEvent) => {
    const touch = e.touches[0]
    setIsDragging(true)
    setDragStart({ x: touch.clientX - position.x, y: touch.clientY - position.y })
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return
    const touch = e.touches[0]
    setPosition({
      x: touch.clientX - dragStart.x,
      y: touch.clientY - dragStart.y
    })
  }

  const handleTouchEnd = () => {
    setIsDragging(false)
  }

  const handleScaleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setScale(parseFloat(e.target.value))
  }

  const getEdgeColor = (img: HTMLImageElement, canvas: HTMLCanvasElement): string => {
    const ctx = canvas.getContext('2d')!
    const tempCanvas = document.createElement('canvas')
    const tempCtx = tempCanvas.getContext('2d')!
    tempCanvas.width = img.width
    tempCanvas.height = img.height
    tempCtx.drawImage(img, 0, 0)

    // Sample colors from edges
    const samples: number[][] = []
    const sampleSize = 10

    // Top edge
    for (let x = 0; x < img.width; x += Math.floor(img.width / sampleSize)) {
      const data = tempCtx.getImageData(x, 0, 1, 1).data
      samples.push([data[0], data[1], data[2]])
    }
    // Bottom edge
    for (let x = 0; x < img.width; x += Math.floor(img.width / sampleSize)) {
      const data = tempCtx.getImageData(x, img.height - 1, 1, 1).data
      samples.push([data[0], data[1], data[2]])
    }
    // Left edge
    for (let y = 0; y < img.height; y += Math.floor(img.height / sampleSize)) {
      const data = tempCtx.getImageData(0, y, 1, 1).data
      samples.push([data[0], data[1], data[2]])
    }
    // Right edge
    for (let y = 0; y < img.height; y += Math.floor(img.height / sampleSize)) {
      const data = tempCtx.getImageData(img.width - 1, y, 1, 1).data
      samples.push([data[0], data[1], data[2]])
    }

    // Average the colors
    const avg = samples.reduce(
      (acc, color) => [acc[0] + color[0], acc[1] + color[1], acc[2] + color[2]],
      [0, 0, 0]
    ).map(v => Math.round(v / samples.length))

    return `rgb(${avg[0]}, ${avg[1]}, ${avg[2]})`
  }

  const handleCrop = () => {
    const canvas = canvasRef.current!
    const ctx = canvas.getContext('2d')!

    canvas.width = FRAME_WIDTH * 2 // Higher resolution output
    canvas.height = FRAME_HEIGHT * 2

    const img = new Image()
    img.onload = () => {
      // Fill with edge color first (Instagram-style)
      const edgeColor = getEdgeColor(img, canvas)
      ctx.fillStyle = edgeColor
      ctx.fillRect(0, 0, canvas.width, canvas.height)

      // Calculate where to draw the image
      const scaledWidth = img.width * scale * 2
      const scaledHeight = img.height * scale * 2
      const drawX = (canvas.width - scaledWidth) / 2 + position.x * 2
      const drawY = (canvas.height - scaledHeight) / 2 + position.y * 2

      ctx.drawImage(img, drawX, drawY, scaledWidth, scaledHeight)

      const dataUrl = canvas.toDataURL('image/jpeg', 0.9)
      onCropComplete(dataUrl)
    }
    img.src = imageSrc
  }

  return (
    <div className="image-cropper">
      <h2>Adjust Your Photo</h2>
      <p className="cropper-hint">Drag to reposition, use slider to resize</p>

      <div
        className="crop-container"
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        style={{ width: FRAME_WIDTH, height: FRAME_HEIGHT }}
      >
        <div className="image-wrapper">
          <img
            src={imageSrc}
            alt="Upload preview"
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              cursor: isDragging ? 'grabbing' : 'grab'
            }}
            draggable={false}
          />
        </div>
        <div className="crop-frame" />
      </div>

      <div className="cropper-controls">
        <div className="scale-control">
          <label>Size</label>
          <input
            type="range"
            min="0.1"
            max="3"
            step="0.01"
            value={scale}
            onChange={handleScaleChange}
          />
        </div>

        <div className="fill-mode-toggle">
          <button
            className={fillMode === 'cover' ? 'active' : ''}
            onClick={() => setFillMode('cover')}
          >
            Fill Frame
          </button>
          <button
            className={fillMode === 'contain' ? 'active' : ''}
            onClick={() => setFillMode('contain')}
          >
            Fit Inside
          </button>
        </div>
      </div>

      <div className="cropper-actions">
        <button className="btn-secondary" onClick={onBack}>Back</button>
        <button className="btn-primary" onClick={handleCrop}>Continue</button>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  )
}

export default ImageCropper
