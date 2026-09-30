-- Migration: 20260930_0020_update_vasthraalayam_store_details.sql
-- Update store details for VASTHRAALAYAM BOUTIQUE (address, phone, Instagram, remove email)

BEGIN;

UPDATE public.store_settings
SET name = 'VASTHRAALAYAM BOUTIQUE',
    owner_name = 'Vasthraalayam Boutique',
    phone = '+91 98844 23899',
    shop_contact_number = '+91 98844 23899',
    email = '',
    address = 'No. 465/10, Medavakkam Main Road, Ullagaram, Puzhudhivakkam, Chennai - 600091',
    instagram_id = 'vasthraalayamboutique',
    updated_at = NOW()
WHERE id = 1;

COMMIT;
