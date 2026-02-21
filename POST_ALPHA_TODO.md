# Post-Alpha To-Do List

## 1. Add missing brand size guides
- [x] Duke tops (women XS-2XL, men S-2XL, unisex averaged)
- [x] Duke sweater (men, women, unisex)
- [x] Peter Millar (men tops S-3XL)
- [x] '47 (smart quote fix for brand detection)
- [x] Fix brand identification algorithm (exact brand+R pattern matching from size guide list)

## 2. Cap shirt image height in item card stack
- [x] Bottom-anchored positioning with CSS variables (--image-height, --image-bottom)
- [x] Remove max-width cap (was making League brand images tiny)
- [x] Bottom-half width detection: scale down if bottom half > 120px wide
- [x] Raised top-edge positioning for scaled-down images (SCALED_IMAGE_TOP)

## 3. Unify size representation to abbreviations
- [x] Frontend normalizeSize + formatSizeRange in BarcodeScanner.tsx
- [x] Backend normalizeSize in item.js extractSizes
- [x] Simplified abbreviateSize in ResultsSection / ResultsSectionDemo

## 4. Improve try-on prompt for differentiated fit pictures
- [ ] Not started

## 5. Fix size guide matching bugs
- [x] Pants were showing tops measurements (backend says "bottom", code only checked for "bottoms")
- [x] Lululemon women's numerical sizes (4, 6, 8…) now map to letter sizes (XS, S, M…) for size guide matching
- [x] Size range display now sorted correctly ("2 - 14" instead of "4 - 14")
- [x] Items with "pant", "jogger", "shorts", "legging", etc. in the name are now detected as bottoms even if backend says "top"
- [x] "How size is estimated" sheet only shows measurements the size guide actually has (no more "—" rows)
- [x] Size recommendations show numbers (e.g. "8") for lululemon items sold in numerical sizes, letters for everything else
- [x] Backend now preserves size guide URLs from item descriptions (was broken by nested HTML tags)
- [x] Gender detection picks up lululemon size guide links in descriptions (e.g. "/size-guide/womens" → women)
- [x] Unisex size guides are now computed on the fly by averaging men's and women's data — consistent across all sizes
- [x] Cleaned up size guide data: removed bad precomputed unisex entries, duplicate "Lululemon" entries
- [x] Added complete lululemon size data from lululemon.com (including extended sizes 1X, 2X, 3XL, 4XL, 5XL)
- [x] Renamed `data/` folder to `size_guides/` and added to git tracking

## 6. Test mode with preloaded items
- [x] Add `/test-mode` route that preloads 6 hardcoded items (by internalId) into "What's the Item?"
- [x] Activated simply by visiting `/test-mode` URL — no code changes needed to switch between test and production
- [x] Scanning still works in test mode (appends items like production)
- [x] Reloading `/test-mode` resets back to the 6 preloaded items
- [x] InternalIds: 2388797, 2398101, 2390524, 2383610, 2388963, 2397821
