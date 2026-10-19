-- ============================================================================
-- Migration: 0024_remove_orphan_inventory_movements.sql
-- Description: Remove stock movements that belong to no product or variant.
--
-- Deleting a product already removes its movements (hard_delete_product plus
-- ON DELETE CASCADE), but rows written without any product_id/variant_id can
-- never be reached by a delete and show in the ledger as "Product #null".
-- The /api/inventory-movements endpoint now rejects such rows.
-- ============================================================================

DELETE FROM public.inventory_movements
WHERE product_id IS NULL
  AND variant_id IS NULL;
