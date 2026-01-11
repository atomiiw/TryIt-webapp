import React, { useState, useRef, useCallback } from 'react';
import './StackedCards.css';

export interface ClothingItem {
  id: string;
  name: string;
  brand: string;
  imageUrl: string;
  price?: string;
  size?: string;
}

interface StackedCardsProps {
  items: ClothingItem[];
  onItemSelect?: (item: ClothingItem, index: number) => void;
  onRemoveItem?: (item: ClothingItem, index: number) => void;
  initialIndex?: number;
}

const StackedCards: React.FC<StackedCardsProps> = ({
  items,
  onItemSelect,
  onRemoveItem,
  initialIndex = 0
}) => {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);

  // Sync currentIndex when initialIndex changes (e.g., new item added)
  React.useEffect(() => {
    setCurrentIndex(initialIndex);
  }, [initialIndex]);

  const containerRef = useRef<HTMLDivElement>(null);
  const startXRef = useRef(0);
  const startYRef = useRef(0);
  const isHorizontalSwipeRef = useRef<boolean | null>(null);

  const SWIPE_THRESHOLD = 50;
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

    // Determine swipe direction on first significant movement
    if (isHorizontalSwipeRef.current === null) {
      if (Math.abs(diffX) > 10 || Math.abs(diffY) > 10) {
        isHorizontalSwipeRef.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    // Only handle horizontal swipes
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

      setTimeout(() => setIsAnimating(false), 400);
    }

    setDragOffset(0);
    isHorizontalSwipeRef.current = null;
  }, [isDragging, dragOffset, currentIndex, items.length]);

  const handleCardClick = (item: ClothingItem, index: number) => {
    if (onItemSelect && index === currentIndex) {
      onItemSelect(item, index);
    }
  };

  const goToCard = (index: number) => {
    if (index !== currentIndex && !isAnimating) {
      setIsAnimating(true);
      setCurrentIndex(index);
      setTimeout(() => setIsAnimating(false), 400);
    }
  };

  if (items.length === 0) {
    return (
      <div className="stacked-cards-empty">
        <div className="empty-icon">👕</div>
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
        {cardsToRender.map(({ item, itemIndex, position }) => (
          <div
            key={item.id}
            className={`stacked-card ${position === 0 ? 'active' : ''}`}
            data-position={position}
            onClick={() => handleCardClick(item, itemIndex)}
          >
            <div className="card-image-container">
              <img
                src={item.imageUrl}
                alt={item.name}
                className="card-image"
                draggable={false}
              />
              {onRemoveItem && position === 0 && (
                <button
                  className="card-remove-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemoveItem(item, itemIndex);
                  }}
                  aria-label="Remove item"
                >
                  ×
                </button>
              )}
            </div>
            <div className="card-content">
              <p className="card-brand">{item.brand}</p>
              <h3 className="card-name">{item.name}</h3>
              {item.price && <p className="card-price">{item.price}</p>}
              {item.size && <span className="card-size">{item.size}</span>}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination dots */}
      {items.length > 1 && (
        <div className="stacked-cards-pagination">
          {items.map((_, index) => (
            <button
              key={index}
              className={`pagination-dot ${index === currentIndex ? 'active' : ''}`}
              onClick={() => goToCard(index)}
              aria-label={`Go to item ${index + 1}`}
            />
          ))}
        </div>
      )}

      {/* Item counter */}
      <div className="stacked-cards-counter">
        {currentIndex + 1} / {items.length}
      </div>
    </div>
  );
};

export default StackedCards;
