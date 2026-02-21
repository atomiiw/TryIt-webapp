import React, { useState, useRef, useCallback, useEffect, useLayoutEffect } from 'react';
import './StackedCards.css';
import DukeLogo from '../assets/Duke Logo.png';
import { removeWhiteBackground } from '../utils/removeWhiteBackground';

const BACKEND_URL = 'https://closai-backend.vercel.app';

export interface ClothingItem {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  price?: string;
  size?: string;
  gender?: string;
}

interface StackedCardsProps {
  items: ClothingItem[];
  onItemSelect?: (item: ClothingItem, index: number) => void;
  onRemoveItem?: (item: ClothingItem, index: number) => void;
  initialIndex?: number;
  navigationTrigger?: number;
  showDuplicateNotification?: boolean;
  onDuplicateNotificationDismiss?: () => void;
}

/**
 * Fetch image through backend proxy to get base64 (avoids CORS)
 */
async function fetchImageAsBase64(imageUrl: string): Promise<string> {
  // Check if it's a Duke shop image
  if (imageUrl.includes('shop.duke.edu/site/img/')) {
    const imagePath = imageUrl.replace('https://shop.duke.edu/site/img/', '');
    const proxyUrl = `${BACKEND_URL}/api/duke/image-proxy?path=${encodeURIComponent(imagePath)}`;

    const response = await fetch(proxyUrl);
    if (!response.ok) {
      throw new Error(`Proxy fetch failed: ${response.status}`);
    }

    const data = await response.json();
    return `data:${data.contentType};base64,${data.base64}`;
  }

  // For non-Duke images, return as-is
  return imageUrl;
}

const StackedCards: React.FC<StackedCardsProps> = ({
  items,
  onItemSelect,
  onRemoveItem,
  initialIndex = 0,
  navigationTrigger = 0,
  showDuplicateNotification = false,
  onDuplicateNotificationDismiss
}) => {
  // Top edge position (px from container top) for images scaled down due to wide bottom half
  const SCALED_IMAGE_TOP = 30;

  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const [isNotificationFadingOut, setIsNotificationFadingOut] = useState(false);

  // Store processed images with white backgrounds removed
  const [processedImages, setProcessedImages] = useState<Record<string, string>>({});

  // Per-image max-height: if bottom half > 120px, cap total at 240px
  const [imageMaxHeights, setImageMaxHeights] = useState<Record<string, number>>({});


  // Store y offset for each item's name (to position size badge)
  const [nameYOffset, setNameYOffset] = useState<Record<string, number>>({});
  const nameRefs = useRef<Record<string, HTMLSpanElement | null>>({});

  // Measure name element to calculate size badge offset
  useLayoutEffect(() => {
    const measureNames = () => {
      const newOffsets: Record<string, number> = {};
      const LINE_HEIGHT = 14;

      for (const item of items) {
        const nameEl = nameRefs.current[item.id];
        if (nameEl) {
          // Use scrollHeight to determine if 1 or 2 lines
          const lines = Math.ceil(nameEl.scrollHeight / LINE_HEIGHT);
          // 1 line: offset = 14 (badge moves down with name)
          // 2 lines: offset = 0 (badge stays at top)
          newOffsets[item.id] = lines <= 1 ? LINE_HEIGHT : 0;
        }
      }
      setNameYOffset(prev => {
        const hasChanges = Object.keys(newOffsets).some(
          id => prev[id] !== newOffsets[id]
        );
        return hasChanges ? { ...prev, ...newOffsets } : prev;
      });
    };

    // Measure immediately
    measureNames();

    // Also measure after fonts load (in case font affects line wrapping)
    if (document.fonts?.ready) {
      document.fonts.ready.then(measureNames);
    }
  }, [items, currentIndex]);

  // Reusable animated navigation function
  const animateToIndex = useCallback((targetIndex: number) => {
    if (targetIndex === currentIndex || isAnimating) return;

    setIsAnimating(true);

    const direction = targetIndex > currentIndex ? 1 : -1;
    const steps = Math.abs(targetIndex - currentIndex);
    const stepDelay = Math.min(150, 400 / steps);

    let currentStep = 0;
    const animate = () => {
      currentStep++;
      setCurrentIndex(prev => prev + direction);

      if (currentStep < steps) {
        setTimeout(animate, stepDelay);
      } else {
        setTimeout(() => setIsAnimating(false), 200);
      }
    };

    animate();
  }, [currentIndex, isAnimating]);

  // Track if this is first mount
  const isFirstMount = useRef(true);
  const lastTriggerRef = useRef(navigationTrigger);

  // Sync currentIndex when initialIndex or navigationTrigger changes
  useEffect(() => {
    if (isFirstMount.current) {
      // On first mount, just set directly
      setCurrentIndex(initialIndex);
      isFirstMount.current = false;
    } else if (navigationTrigger !== lastTriggerRef.current || initialIndex !== currentIndex) {
      // On subsequent changes or trigger, animate to the new index
      lastTriggerRef.current = navigationTrigger;
      animateToIndex(initialIndex);
    }
  }, [initialIndex, navigationTrigger]);

  // Handle duplicate notification auto-dismiss after 2.5 seconds
  useEffect(() => {
    if (showDuplicateNotification) {
      setIsNotificationFadingOut(false);

      const fadeTimer = setTimeout(() => {
        setIsNotificationFadingOut(true);
      }, 2100); // Start fade 400ms before dismissing

      const dismissTimer = setTimeout(() => {
        onDuplicateNotificationDismiss?.();
        setIsNotificationFadingOut(false);
      }, 2500);

      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(dismissTimer);
      };
    }
  }, [showDuplicateNotification, onDuplicateNotificationDismiss]);

  // Process images: fetch via proxy then remove white backgrounds
  useEffect(() => {
    const processImages = async () => {
      for (const item of items) {
        // Skip if already processed
        if (processedImages[item.id]) continue;

        try {
          // Step 1: Fetch image as base64 via proxy (avoids CORS)
          const base64Url = await fetchImageAsBase64(item.imageUrl);

          // Step 2: Remove white background and crop to content
          const processedUrl = await removeWhiteBackground(base64Url, {
            threshold: 254,
            tolerance: 3,
            smoothEdges: false,
            cropToContent: true
          });

          setProcessedImages(prev => ({
            ...prev,
            [item.id]: processedUrl
          }));
        } catch (error) {
          // Fall back to original image
          setProcessedImages(prev => ({
            ...prev,
            [item.id]: item.imageUrl
          }));
        }
      }
    };

    processImages();
  }, [items, processedImages]);

  // Measure content width in upper and lower halves, scale down if too wide
  useEffect(() => {
    const DEFAULT_MAX_HEIGHT = 150;
    const BOTTOM_WIDTH_LIMIT = 135;
    const UPPER_WIDTH_LIMIT = 140;

    for (const item of items) {
      const src = processedImages[item.id];
      if (!src || imageMaxHeights[item.id] !== undefined) continue;

      const img = new Image();
      img.onload = () => {
        const natW = img.naturalWidth;
        const natH = img.naturalHeight;

        // Draw to canvas to read pixel data
        const canvas = document.createElement('canvas');
        canvas.width = natW;
        canvas.height = natH;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          setImageMaxHeights(prev => ({ ...prev, [item.id]: DEFAULT_MAX_HEIGHT }));
          return;
        }
        ctx.drawImage(img, 0, 0);

        const halfY = Math.floor(natH / 2);

        // Helper: scan rows for max content width
        const measureMaxWidth = (imageData: ImageData) => {
          let maxW = 0;
          for (let row = 0; row < imageData.height; row++) {
            let leftmost = -1;
            let rightmost = -1;
            for (let col = 0; col < imageData.width; col++) {
              const alpha = imageData.data[(row * imageData.width + col) * 4 + 3];
              if (alpha > 10) {
                if (leftmost === -1) leftmost = col;
                rightmost = col;
              }
            }
            if (leftmost !== -1) {
              maxW = Math.max(maxW, rightmost - leftmost + 1);
            }
          }
          return maxW;
        };

        // Measure upper half and bottom half content widths
        const upperContentWidth = measureMaxWidth(ctx.getImageData(0, 0, natW, halfY));
        const bottomContentWidth = measureMaxWidth(ctx.getImageData(0, halfY, natW, natH - halfY));

        // Compute rendered widths at default max height
        const renderScale = Math.min(DEFAULT_MAX_HEIGHT, natH) / natH;
        const renderedUpperWidth = upperContentWidth * renderScale;
        const renderedBottomWidth = bottomContentWidth * renderScale;

        // Determine max height from each constraint
        let maxH = DEFAULT_MAX_HEIGHT;
        if (renderedUpperWidth > UPPER_WIDTH_LIMIT) {
          maxH = Math.min(maxH, natH * (UPPER_WIDTH_LIMIT / upperContentWidth));
        }
        if (renderedBottomWidth > BOTTOM_WIDTH_LIMIT) {
          maxH = Math.min(maxH, natH * (BOTTOM_WIDTH_LIMIT / bottomContentWidth));
        }

        setImageMaxHeights(prev => ({ ...prev, [item.id]: maxH }));
      };
      img.src = src;
    }
  }, [processedImages, items, imageMaxHeights]);

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const SWIPE_THRESHOLD = 30;  // Reduced for faster response
  const MAX_DRAG = 150;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating || items.length <= 1) return;

    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    isHorizontalSwipeRef.current = null;
    setIsDragging(true);
  }, [isAnimating, items.length]);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!isDragging || isAnimating) return;

    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startXRef.current;
    const diffY = currentY - startYRef.current;

    // Determine swipe direction on first significant movement (reduced threshold)
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > 5 || Math.abs(diffY) > 5) {
        isHorizontalSwipeRef.current = Math.abs(diffX) >= Math.abs(diffY);
      }
    }

    // Only prevent page scrolling for horizontal swipes
    if (isHorizontalSwipeRef.current) {
      e.preventDefault();

      // Limit drag distance and add resistance at edges
      let constrainedOffset = diffX;

      // Add resistance when trying to go past boundaries
      if ((currentIndex === 0 && diffX > 0) ||
          (currentIndex === items.length - 1 && diffX < 0)) {
        constrainedOffset = diffX * 0.3; // Rubber band effect
      }

      constrainedOffset = Math.max(-MAX_DRAG, Math.min(MAX_DRAG, constrainedOffset));
      setDragOffset(constrainedOffset);
    }
  }, [isDragging, isAnimating, currentIndex, items.length]);

  const handleTouchEnd = useCallback(() => {
    if (!isDragging) return;

    setIsDragging(false);

    if (Math.abs(dragOffset) > SWIPE_THRESHOLD) {
      setIsAnimating(true);

      if (dragOffset > SWIPE_THRESHOLD && currentIndex > 0) {
        // Swiped right - go to previous
        setCurrentIndex(prev => prev - 1);
      } else if (dragOffset < -SWIPE_THRESHOLD && currentIndex < items.length - 1) {
        // Swiped left - go to next
        setCurrentIndex(prev => prev + 1);
      }

      setTimeout(() => setIsAnimating(false), 250);  // Faster animation
    }

    setDragOffset(0);
    isHorizontalSwipeRef.current = null;
  }, [isDragging, dragOffset, currentIndex, items.length]);

  // Notify parent when currentIndex changes (from swipe or pagination)
  const prevIndexRef = useRef(currentIndex);
  useEffect(() => {
    if (currentIndex !== prevIndexRef.current) {
      prevIndexRef.current = currentIndex;
      // Notify parent of the new active item
      if (onItemSelect && items[currentIndex]) {
        onItemSelect(items[currentIndex], currentIndex);
      }
    }
  }, [currentIndex, items, onItemSelect]);

  const handleCardClick = (item: ClothingItem, index: number) => {
    if (onItemSelect && index === currentIndex) {
      onItemSelect(item, index);
    }
  };

  const goToCard = (targetIndex: number) => {
    animateToIndex(targetIndex);
  };

  if (items.length === 0) {
    return (
      <div className="stacked-cards-empty">
        <div className="empty-icon">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none">
            <rect x="8" y="12" width="32" height="28" rx="4" stroke="#012169" strokeWidth="2"/>
            <path d="M8 20H40" stroke="#012169" strokeWidth="2"/>
            <circle cx="24" cy="32" r="4" stroke="#012169" strokeWidth="2"/>
          </svg>
        </div>
        <p>Scan items to add them here</p>
      </div>
    );
  }

  // Generate cards to render (current ± 2)
  const cardsToRender = [];
  for (let i = -2; i <= 2; i++) {
    const itemIndex = currentIndex + i;
    if (itemIndex >= 0 && itemIndex < items.length) {
      cardsToRender.push({
        item: items[itemIndex],
        itemIndex,
        position: i,
      });
    }
  }

  return (
    <div className="stacked-cards-container">
      <div
        className="stacked-cards-wrapper"
        ref={containerRef}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {cardsToRender.map(({ item, itemIndex, position }) => {
          // Base transforms for each position (from CSS)
          const baseTransforms: Record<number, { x: number; rotate: number; origin: string }> = {
            0: { x: 0, rotate: 0, origin: 'center bottom' },
            '-1': { x: -191, rotate: -5, origin: 'right bottom' },
            1: { x: 191, rotate: 5, origin: 'left bottom' },
            '-2': { x: -400, rotate: -10, origin: 'right bottom' },
            2: { x: 380, rotate: 10, origin: 'left bottom' },
          };
          const base = baseTransforms[position] || { x: 0, rotate: 0, origin: 'center bottom' };

          // Apply dragOffset to all cards during dragging
          const currentX = base.x + (isDragging ? dragOffset : 0);

          return (
          <div
            key={item.id}
            className={`stacked-card ${position === 0 ? 'active' : ''}`}
            data-position={position}
            style={{
              transform: isDragging ? `translateX(${currentX}px) rotate(${base.rotate}deg)` : undefined,
              transformOrigin: isDragging ? base.origin : undefined,
            }}
            onClick={() => handleCardClick(item, itemIndex)}
          >
            {/* White card background - Rectangle 1 (trapezoid with stroke and shadow) */}
            <svg className="card-background" viewBox="0 0 180 162" fill="none" xmlns="http://www.w3.org/2000/svg" overflow="visible">
              <path
                d="M0 16.8938C0 9.57128 6.50135 3.956082 13.7459 5.02146L169.746 27.9626C175.636 28.8288 180 33.8819 180 39.8349L180 150C180 156.627 174.627 162 168 162L12 162C5.37258 162 0 156.627 0 150L0 16.8938Z"
                fill="white"
                stroke="rgba(0,0,0,0.25)"
                strokeWidth="0.2"
                strokeLinejoin="round"
              />
            </svg>

            {/* Item image - Rectangle 2 (RIGHT aligned) */}
            <div className="card-item-image">
              {(() => {
                const maxH = imageMaxHeights[item.id];
                const wasScaledDown = maxH !== undefined && maxH < 150;
                return (
                  <img
                    src={processedImages[item.id] || item.imageUrl}
                    alt={item.name}
                    className="card-image"
                    draggable={false}
                    style={{
                      transform: 'translateX(-50%)',
                      ...(maxH ? { maxHeight: `${maxH}px` } : {}),
                      ...(wasScaledDown ? { bottom: 'auto', top: `${SCALED_IMAGE_TOP}px` } : {})
                    }}
                  />
                );
              })()}
            </div>

            {/* Gradient fade on image - Rectangle 5 */}
            <div className="card-image-gradient" />

            {/* Duke logo - Rectangle 3: x=9, y=61, 20x24px */}
            <div className="card-duke-logo-wrapper">
              <img src={DukeLogo} alt="Duke" className="card-duke-logo" />
            </div>

            {/* Gender badge - below Duke logo */}
            {item.gender && (
              <div className="card-gender-badge-wrapper">
                <div className="card-gender-badge">
                  <span className="card-gender-text">
                    {item.gender.replace(/s$/, '').toUpperCase()}
                  </span>
                </div>
              </div>
            )}

            {/* Text content - Rectangle: name & price (LEFT side, bottom) */}
            <div className="card-text-content">
              {/* Size badge above name */}
              {item.size && (
                <div
                  className="card-badge-row"
                  style={{
                    '--size-badge-offset': `${nameYOffset[item.id] ?? 14}px`
                  } as React.CSSProperties}
                >
                  <div className="card-size-badge">
                    <span className="card-size-text">{item.size}</span>
                  </div>
                </div>
              )}
              <div className="card-name-wrapper">
                <span
                  className="card-name"
                  ref={(el) => { nameRefs.current[item.id] = el; }}
                >
                  {item.name}
                </span>
              </div>
              {item.price && <p className="card-price">{item.price}</p>}
            </div>

            {/* Remove button */}
            {onRemoveItem && position === 0 && (
              <button
                className="card-remove-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onRemoveItem(item, itemIndex);
                }}
                aria-label="Remove item"
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M1 1L11 11M1 11L11 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                </svg>
              </button>
            )}

            {/* Duplicate notification toast */}
            {showDuplicateNotification && position === 0 && (
              <div className={`duplicate-notification ${isNotificationFadingOut ? 'fading-out' : ''}`}>
                Item has already been added!
              </div>
            )}
          </div>
          );
        })}
      </div>

      {/* Item counter and pagination - above cards */}
      <div className="stacked-cards-header">
        <div className="stacked-cards-counter">
          {currentIndex + 1} of {items.length}
        </div>
        {items.length >= 1 && (
          <div className="stacked-cards-pagination">
            {items.map((_, index) => (
              <button
                key={index}
                className={`pagination-segment ${index === currentIndex ? 'active' : ''}`}
                onClick={() => goToCard(index)}
                aria-label={`Go to item ${index + 1}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default StackedCards;
