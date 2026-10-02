# Modal Footer Mobile Audit & Fix Report

## Root Cause Analysis
The root cause was that modal outer containers used `100vh`/`h-screen` and non-sticky footers inside scrollable flex containers. On mobile devices (~360–412px), dynamic browser address bars and toolbars made `100vh` 60–100px taller than the physical viewport; combined with `flex-1` stretching the form body, the un-stuck action bar was pushed below the viewport fold, creating an apparent empty whitespace area beneath the inputs with no reachable Cancel or Confirm button.

---

## Audit & Verification Matrix

| Modal / Dialog | File | Footer visible on mobile before? | Fix applied | Tested (pass/fail) |
|---|---|---|---|---|
| **Adjust Inventory Stock** | [`AdjustStockModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/inventory/AdjustStockModal.tsx) | **No** (Pushed off-screen below fold, empty gap after note) | Converted container to `100dvh` bottom sheet (`rounded-t-3xl sm:rounded-3xl`), body `overflow-y-auto flex-1 min-h-0`, sticky action bar (`sticky bottom-0 z-20 shrink-0 bg-[#FBFAF6] border-t pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-4px_12px_rgba(0,0,0,0.06)] sm:shadow-none`), side-by-side buttons with `min-h-[48px]`, dynamic count & disabled state preserved, desktop pixel-identical. | **PASS** |
| **Print Barcode Labels** | [`BarcodePrintModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/barcode/BarcodePrintModal.tsx) | **No** (Pushed off-screen below fold) | Changed to `100dvh` bottom sheet, sticky action bar `sticky bottom-0 z-20`, full-width side-by-side buttons `min-h-[48px]`, `pb-[max(0.75rem,env(safe-area-inset-bottom))]`. | **PASS** |
| **Quick Edit Price** | [`QuickPriceModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/inventory/QuickPriceModal.tsx) | **No** (Clipped off bottom fold) | Converted to `100dvh` bottom sheet, body `overflow-y-auto flex-1 min-h-0`, sticky bottom actions with `min-h-[48px]` touch targets and safe-area inset padding. | **PASS** |
| **Create Barcode (SKU)** | [`CreateBarcodeModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/barcode/CreateBarcodeModal.tsx) | **No** (Bottom action row pushed off viewport) | Converted to `100dvh` bottom sheet, form body `overflow-y-auto flex-1 min-h-0`, sticky action bar with `min-h-[48px]` side-by-side touch targets and safe-area padding. | **PASS** |
| **Barcode Sheet Preview** | [`BarcodeSheetPreviewModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/barcode/BarcodeSheetPreviewModal.tsx) | **No** (Print/Cancel buttons submerged below screen) | Converted to `100dvh` bottom sheet, scrollable sheet preview area, sticky footer action bar with `min-h-[48px]` buttons and safe-area padding. | **PASS** |
| **Create Custom Label Size** | [`CreateCustomSizeModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/barcode/CreateCustomSizeModal.tsx) | **No** (Long form pushed Save/Cancel below fold) | Added `max-h-[100dvh] sm:max-h-[92dvh]`, `overflow-y-auto flex-1 min-h-0` for dimension inputs, sticky footer action bar with `min-h-[48px]` buttons and safe-area padding. | **PASS** |
| **Record Expense** | [`RecordExpenseModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/expenses/RecordExpenseModal.tsx) | **No** (Category list & notes pushed Save button off-screen) | Changed to `100dvh` bottom sheet, body `overflow-y-auto flex-1 min-h-0`, sticky action bar `sticky bottom-0 z-20` with `min-h-[48px]` side-by-side buttons and safe-area padding. | **PASS** |
| **Create Advance Order** | [`AdvanceOrders.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/pages/AdvanceOrders.tsx) | **No** (Customer/fitting fields pushed Create button off-screen) | Form body wrapped in `overflow-y-auto flex-1 min-h-0`, sticky action bar `sticky bottom-0 z-20` with `min-h-[48px]` buttons, 100dvh mobile bottom sheet. | **PASS** |
| **Receive Payment (Advance)** | [`AdvanceOrders.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/pages/AdvanceOrders.tsx) | **Partial** (Small screens clipped payment method buttons) | Made container `max-h-[100dvh]`, sticky footer with `min-h-[48px]` Confirm button and safe-area padding. | **PASS** |
| **Advance Order Drawer** | [`AdvanceOrders.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/pages/AdvanceOrders.tsx) | **No** (Print Receipt & Settle buttons submerged) | Pinned bottom action bar to `sticky bottom-0 z-20 bg-white` with `min-h-[48px]` buttons and `pb-[max(1rem,env(safe-area-inset-bottom))]`. | **PASS** |
| **Hard Delete Confirmation** | [`HardDeleteModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/common/HardDeleteModal.tsx) | **No** (When impact list was long, Type 'DELETE' & Confirm pushed off) | Changed to `100dvh` bottom sheet, body `overflow-y-auto flex-1 min-h-0`, sticky action bar with `min-h-[48px]` buttons and safe-area padding. | **PASS** |
| **Barcode Redirect Dialog** | [`BarcodeRedirectDialog.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/pos/BarcodeRedirectDialog.tsx) | **Partial** (Actions clipped on keyboard open) | Set `max-h-[100dvh]`, body `overflow-y-auto flex-1 min-h-0`, sticky footer with `min-h-[48px]` actions and safe-area padding. | **PASS** |
| **Add Ad-Hoc / Unregistered Item** | [`AddUnregisteredItemModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/pos/AddUnregisteredItemModal.tsx) | **No** (Buttons inside form at bottom, 32px height, hidden below fold) | Converted to `100dvh` bottom sheet, body `overflow-y-auto flex-1 min-h-0`, sticky action bar with `min-h-[48px]` Cancel & Confirm buttons, safe-area padding. | **PASS** |
| **Change Password** | [`ChangePasswordModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/settings/ChangePasswordModal.tsx) | **Partial** (No cancel button on mobile, sub-48px touch targets) | Added mobile bottom sheet `100dvh`, sticky footer with Cancel + Update buttons, `min-h-[48px]` touch targets, safe-area padding. | **PASS** |
| **Low Stock Alarm** | [`LowStockAlarmModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/dashboard/LowStockAlarmModal.tsx) | **Partial** (Sub-48px button, lacked safe-area padding) | Added `items-end sm:items-center p-0 sm:p-4`, `100dvh` max-height, sticky footer with `min-h-[48px]` touch target and safe-area padding. | **PASS** |
| **Add / Edit Product & Service Form** | [`AddEditProductView.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/inventory/AddEditProductView.tsx) | **Partial** (Pinned actions were 34px, overlapped by gesture bar) | Added `sticky bottom-0 z-20`, `min-h-[48px]` full-width side-by-side buttons on mobile, `pb-[max(0.75rem,env(safe-area-inset-bottom))]`. | **PASS** |
| **POS Search Catalog / Edit Modal** | [`CatalogModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/CatalogModal.tsx) | **Partial** (Edit product mode lacked Cancel button inside form) | Added Cancel button alongside Save with `min-h-[48px]` touch targets and safe-area padding. | **PASS** |
| **Add Product to Store** | [`AddProductModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/AddProductModal.tsx) | **No** (Lacked max-height, buttons scrolled off bottom, lacked Cancel) | Converted to `100dvh` bottom sheet, scrollable body, sticky action bar with Cancel & Save (`min-h-[48px]`), safe-area padding. | **PASS** |
| **Variant Selector Modal** | [`VariantSelectorModal.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/VariantSelectorModal.tsx) | **Yes** (Bottom sheet already present) | Upgraded stepper & CTA touch target height to `min-h-[48px]` on mobile. | **PASS** |
| **Stock Movement History Drawer** | [`StockHistoryDrawer.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/inventory/StockHistoryDrawer.tsx) | **Partial** (No bottom close action on mobile) | Added mobile sticky bottom Close action bar with `min-h-[48px]` and safe-area padding. | **PASS** |
| **Barcode Settings Drawer & Save Profile Modal** | [`BarcodeSettingsDrawer.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/barcode/BarcodeSettingsDrawer.tsx) | **Partial** (Sub-48px touch targets, no safe-area inset) | Made drawer footer sticky with `min-h-[48px]` and safe-area inset; made Save Profile modal a `100dvh` bottom sheet on mobile. | **PASS** |
| **Shopping Cart Drawer** | [`Drawers.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/Drawers.tsx) | **Partial** (Footer overlapped gesture bar on Android/iOS) | Added `sticky bottom-0 z-20 shrink-0 bg-white`, `min-h-[48px]` button, and `pb-[max(1rem,env(safe-area-inset-bottom))]`. | **PASS** |
| **Image Mapping Confirmation Modal** | [`ImageMappingTool.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/components/dashboard/ImageMappingTool.tsx) | **No** (Fixed dialog clipped on small screens) | Converted to `100dvh` bottom sheet, scrollable mappings list, sticky bottom actions with `min-h-[48px]` buttons and safe-area padding. | **PASS** |
| **Invoice Preview Modal (Bill View / Share)** | [`Dashboard.tsx`](file:///c:/vasuntharalayam%20boutique/vasthraalayam%20boutique/src/pages/Dashboard.tsx) | **No** (Action buttons cramped in header, cut off on mobile) | Converted to `100dvh` bottom sheet, added sticky bottom mobile action bar with Print & Download buttons (`min-h-[48px]`), safe-area padding. | **PASS** |

---

## Technical Guarantees
1. **Dynamic Button Labels & State:**
   - In Restock mode: `"Confirm Restock (+N Units)"`
   - In Remove Stock mode: `"Confirm Removal (-N Units)"`
   - In Reconciliation mode: `"Confirm Count (N Units)"`
   - Dynamically updates with keypad, stepper (-/+), and Quick Add chips (+1, +5, +10, +25, +50, +100).
   - Disabled while quantity is 0 or invalid, or when removing more than current stock.
2. **Viewport & Safe Area:**
   - Replaced all mobile modal `vh` with `dvh` (`max-h-[100dvh]`).
   - Sticky action bar with `position: sticky; bottom: 0; z-index: 20;` and solid background (`#FBFAF6` / `white`) + border-top.
   - Safe-area spacing using `pb-[max(0.75rem,env(safe-area-inset-bottom))]` (or 1rem) to clear gesture navigation bars.
3. **Touch Targets & Responsiveness:**
   - Buttons have a minimum height of 48px on mobile (`min-h-[48px]`).
   - Under ~640px, buttons span full width side-by-side (`flex-1` / `flex-[1.5]`).
   - Desktop viewports (>=640px) remain pixel-identical to their original desktop layouts.
4. **Single Code Path & Safety:**
   - Mobile and desktop buttons invoke the identical handlers (`handleSubmit`, `onClose`, etc.).
   - Double-submit prevention with loading spinners preserved across all forms.
