# TryIt

Virtual try-on webapp. Scan a clothing barcode in a store, upload a photo of yourself, and see AI-generated images of you wearing the item in three fits (fitted, regular, comfortable) with a size recommendation.

Built Dec 2025 to Apr 2026. Solo project.

## How it works

1. Scan a barcode with your phone camera (ZXing for barcode, Tesseract.js OCR fallback for price tags)
2. App looks up the SKU against a local UPC mapping table, then fetches product info from the retailer API
3. Upload or take a photo of yourself
4. OpenAI vision analyzes body composition (build type, age range, gender) from the photo
5. Size recommendation is computed by matching user measurements against the brand's size guide
6. Three try-on images are generated in parallel (one per fit) via Gemini image generation through a Vercel backend

## Features

**Barcode scanning.** ZXing multi-format reader with Tesseract.js OCR fallback for printed SKUs.

**Product lookup.** UPC to SKU mapping table, then retailer API for product details, images, available sizes.

**Body analysis.** OpenAI vision extracts body composition from user photo. Cached per session so it only runs once.

**Size recommendation.** Matches user height/weight/composition against brand size guides (cm and inch). Returns fitted/regular/comfortable sizes with confidence level.

**Fit description.** Computes per-measurement fit ratios and generates natural language fit sentences for the image model prompt.

**Virtual try-on.** Gemini generates three images in parallel, one per fit type, each routed through a separate API key queue to avoid rate limits.

**Stacked cards.** Scan multiple items in one session. Previous items stack behind the current one.

## File structure

```
src/
  App.tsx                  Session state, barcode/item/user data flow
  components/
    ShoppingPage.tsx       Main page layout and step orchestration
    BarcodeScanner.tsx     Camera barcode scanning UI
    ImageUploader.tsx      Photo upload/capture
    ImageCropper.tsx       Crop and frame user photo (4:3 with blur background)
    MeasurementInput.tsx   Height/weight input
    PersonDetails.tsx      Body analysis display
    ResultsSection.tsx     Try-on results and size recommendation display
    StackedCards.tsx       Multi-item card stack
    SummaryBar.tsx         Session summary header
  utils/
    barcodeProcessor.ts    ZXing + Tesseract scanning logic
    upcLookup.ts           UPC to SKU mapping
    analyzeItem.ts         Product info fetch from retailer API
    personAnalyzer.ts      OpenAI vision body analysis
    sizeCollector.ts       Brand size guide loading and matching
    sizeIdentifier.ts      Size recommendation algorithm
    fitDescriber.ts        Fit ratio calculation, natural language fit sentences
    tryOnService.ts        Gemini try-on generation, per-key request queuing
    brandIdentifier.ts     Brand detection from product data
    chooseWatermark.ts     Watermark selection for generated images
    removeWhiteBackground.ts  Product image background removal
  services/
    aiWorkflow.ts          AI processing pipeline (placeholder)
  hooks/
    useTimeOnPage.ts       Page time tracking for analytics

closai-backend-repo/       Vercel serverless backend
  api/
    gemini-tryon-duke.js   Gemini image generation endpoint
    openai-analyze-image.js  OpenAI vision proxy
    claude-select-combo.js   Claude clothing combo selection
    gemini-describe.js     Gemini product description
  adapters/
    DukeAdapter.js         Retailer API adapter
```
