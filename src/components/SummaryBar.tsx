import './SummaryBar.css'

interface Product {
  name: string
  image: string
  sizeRange: string
}

interface SummaryBarProps {
  product: Product | null
  isReady: boolean
  onSubmit: () => void
}

function SummaryBar({ product, isReady, onSubmit }: SummaryBarProps) {
  return (
    <div className="summary-bar">
      <div className="summary-content">
        {product ? (
          <div className="selected-item">
            <div className="item-thumbnail">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18M9 21V9" />
              </svg>
            </div>
            <span className="item-label">Selected: {product.name}</span>
          </div>
        ) : (
          <div className="selected-item empty">
            <span className="item-label">No item selected</span>
          </div>
        )}

        <button
          className={`submit-btn ${isReady ? 'ready' : ''}`}
          onClick={onSubmit}
          disabled={!isReady}
        >
          See Their Fit →
        </button>
      </div>
    </div>
  )
}

export default SummaryBar
