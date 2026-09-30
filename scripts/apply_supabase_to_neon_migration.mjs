import postgres from 'postgres';

const NEON_URL = 'postgresql://neondb_owner:npg_UdsjJ0W1PahI@ep-crimson-frog-aytuz9ib-pooler.c-5.us-east-2.aws.neon.tech/neondb?channel_binding=require&sslmode=require';
const SUPA_URL = 'https://bjlyhoxereyvhnuqiqtn.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJqbHlob3hlcmV5dmhudXFpcXRuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODg4MzEwMzYsImV4cCI6MjEwNDQwNzAzNn0.cAC-kbrRp68YCvNDR3sivSGJNExze1A2RHdZllH4D70';

const headers = { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` };

async function fetchAll(endpoint) {
  let all = [];
  let page = 0;
  const limit = 500;
  while (true) {
    const res = await fetch(`${SUPA_URL}/rest/v1/${endpoint}?limit=${limit}&offset=${page * limit}`, { headers });
    if (!res.ok) throw new Error(`Failed to fetch ${endpoint}: ${res.status} ${res.statusText}`);
    const data = await res.json();
    all = all.concat(data);
    if (data.length < limit) break;
    page++;
  }
  return all;
}

async function migrate() {
  console.log('Fetching historical data from Supabase...');
  const [
    categories,
    products,
    variants,
    coupons,
    orders,
    orderItems,
    advanceOrders,
    advanceTimeline,
    advancePayments
  ] = await Promise.all([
    fetchAll('categories'),
    fetchAll('products'),
    fetchAll('product_variants'),
    fetchAll('coupons'),
    fetchAll('orders'),
    fetchAll('order_items'),
    fetchAll('advance_orders'),
    fetchAll('advance_order_timeline'),
    fetchAll('advance_order_payments')
  ]);

  const sql = postgres(NEON_URL);

  // Ensure category column exists on order_items
  await sql`ALTER TABLE public.order_items ADD COLUMN IF NOT EXISTS category TEXT`;

  const countsBefore = {
    orders: (await sql`SELECT count(*)::int as c FROM public.orders`)[0].c,
    orderItems: (await sql`SELECT count(*)::int as c FROM public.order_items`)[0].c,
    advanceOrders: (await sql`SELECT count(*)::int as c FROM public.advance_orders`)[0].c,
    products: (await sql`SELECT count(*)::int as c FROM public.products`)[0].c,
    categories: (await sql`SELECT count(*)::int as c FROM public.categories`)[0].c,
  };
  console.log('\nNeon counts BEFORE migration:', countsBefore);

  console.log('\nApplying migration in transaction...');
  await sql.begin(async (tx) => {
    // 1. Categories
    for (const cat of categories) {
      await tx`
        INSERT INTO public.categories (id, name_en, name_ta, is_active, sort_order, created_at, updated_at)
        VALUES (
          ${cat.id}, ${cat.name_en || cat.name || 'Category'}, ${cat.name_ta || cat.name_en || 'Category'},
          ${cat.is_active ?? true}, ${cat.sort_order ?? 0},
          ${cat.created_at || new Date()}, ${cat.updated_at || new Date()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ Inserted categories (${categories.length} processed)`);

    // 2. Products
    for (const prod of products) {
      await tx`
        INSERT INTO public.products (
          id, name, name_ta, category, category_id,
          price, offer_price, purchase_price, mrp,
          stock_quantity, is_active, image_url, description,
          barcode, sku, item_type, created_at, updated_at
        ) VALUES (
          ${prod.id}, ${prod.name}, ${prod.name_ta || prod.name},
          ${prod.category || 'General'}, ${prod.category_id || null},
          ${prod.price || prod.selling_price || 0}, ${prod.offer_price ?? prod.selling_price ?? prod.price ?? 0},
          ${prod.purchase_price ?? prod.cost_price ?? 0}, ${prod.mrp ?? prod.price ?? 0},
          ${prod.stock_quantity || prod.stock || 0}, ${prod.is_active ?? true},
          ${prod.image_url || prod.image || null}, ${prod.description || ''},
          ${prod.barcode || null}, ${prod.sku || null},
          ${prod.item_type || 'product'}, ${prod.created_at || new Date()}, ${prod.updated_at || new Date()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ Inserted products (${products.length} processed)`);

    // 3. Variants
    for (const v of variants) {
      await tx`
        INSERT INTO public.product_variants (
          id, product_id, variant_name, sku, barcode,
          price, stock, is_default, is_active, sort_order,
          created_at, updated_at
        ) VALUES (
          ${v.id}, ${v.product_id}, ${v.variant_name}, ${v.sku || null}, ${v.barcode || null},
          ${v.price || v.additional_price || 0}, ${v.stock || v.stock_quantity || 0},
          ${v.is_default ?? false}, ${v.is_active ?? true}, ${v.sort_order ?? 0},
          ${v.created_at || new Date()}, ${v.updated_at || new Date()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ Inserted variants (${variants.length} processed)`);

    // 4. Coupons
    for (const c of coupons) {
      await tx`
        INSERT INTO public.coupons (
          id, code, percentage, is_active, expiry_date, usage_limit, usage_count, min_order_value, created_at, updated_at
        ) VALUES (
          ${c.id}, ${c.code}, ${c.percentage || c.discount_value || 0},
          ${c.is_active ?? true}, ${c.expiry_date || null},
          ${c.usage_limit || null}, ${c.usage_count || 0},
          ${c.min_order_value || c.min_order_amount || 0},
          ${c.created_at || new Date()}, ${c.updated_at || new Date()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ Inserted coupons (${coupons.length} processed)`);

    // 5. Orders
    for (const o of orders) {
      const pMode = String(o.payment_mode || o.payment_method || 'cash').toLowerCase();
      const paymentsJson = Array.isArray(o.payments) && o.payments.length > 0
        ? o.payments
        : [{ mode: pMode, amount: Number(o.total || 0) }];

      await tx`
        INSERT INTO public.orders (
          id, invoice_no, customer_name, phone, address,
          total, status, order_mode, order_type, user_id,
          items, coupon_code, discount_amount, manual_discount_amount,
          delivery_charge, total_gst, gst_amount, payment_mode, payment_method,
          remarks, reference_number, invoice_pdf_url,
          payments, change_given, tailor_name, created_at, updated_at
        ) VALUES (
          ${o.id}, ${o.invoice_no}, ${o.customer_name || 'Walk-in Customer'}, ${o.phone || ''}, ${o.address || ''},
          ${Number(o.total || 0)}, ${o.status || 'completed'}, ${o.order_mode || 'offline'}, ${o.order_type || 'pos_sale'}, ${o.user_id || null},
          ${tx.json(o.items || [])}, ${o.coupon_code || null}, ${Number(o.discount_amount || 0)}, ${Number(o.manual_discount_amount || 0)},
          ${Number(o.delivery_charge || 0)}, ${Number(o.total_gst || 0)}, ${Number(o.gst_amount || 0)}, ${pMode}, ${pMode},
          ${o.remarks || ''}, ${o.reference_number || null}, ${o.invoice_pdf_url || null},
          ${tx.json(paymentsJson)}, ${Number(o.change_given || 0)}, ${o.tailor_name || ''},
          ${o.created_at || new Date()}, ${o.updated_at || new Date()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ Inserted orders (${orders.length} processed)`);

    // 6. Order items
    for (const item of orderItems) {
      await tx`
        INSERT INTO public.order_items (
          id, order_id, product_id, variant_id, product_name, name,
          product_tamil_name, tamil_name, variant_name, quantity, unit,
          unit_type, base_quantity, base_price, unit_price, line_total,
          image_url, is_manual, discount, gst_amount, gst_rate,
          source, note, category, created_at
        ) VALUES (
          ${item.id}, ${item.order_id}, ${item.product_id || null}, ${item.variant_id || null},
          ${item.product_name || item.name || 'Product'}, ${item.name || item.product_name || 'Product'},
          ${item.product_tamil_name || null}, ${item.tamil_name || null}, ${item.variant_name || null},
          ${Number(item.quantity || 1)}, ${item.unit || 'piece'}, ${item.unit_type || 'unit'},
          ${Number(item.base_quantity || 1)}, ${Number(item.base_price || item.unit_price || 0)},
          ${Number(item.unit_price || item.base_price || 0)}, ${Number(item.line_total || 0)},
          ${item.image_url || null}, ${item.is_manual ?? false}, ${Number(item.discount || 0)},
          ${Number(item.gst_amount || 0)}, ${Number(item.gst_rate || 0)},
          ${item.source || 'catalogue'}, ${item.note || null}, ${item.category || null},
          ${item.created_at || new Date()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ Inserted order items (${orderItems.length} processed)`);

    // 7. Advance orders
    for (const adv of advanceOrders) {
      await tx`
        INSERT INTO public.advance_orders (
          id, deposit_id, customer_name, phone, address,
          product_name, products, category, description,
          total_amount, deposit_amount, expected_delivery_date,
          status, remarks, created_by, created_by_name,
          created_at, updated_at, completed_at, completed_order_id,
          invoice_number, final_payment_method
        ) VALUES (
          ${adv.id}, ${adv.deposit_id}, ${adv.customer_name}, ${adv.phone || ''}, ${adv.address || ''},
          ${adv.product_name || 'Advance Order Item'}, ${tx.json(adv.products || [])}, ${adv.category || ''}, ${adv.description || ''},
          ${Number(adv.total_amount || 0)}, ${Number(adv.deposit_amount || 0)}, ${adv.expected_delivery_date},
          ${adv.status || 'pending_deposit'}, ${adv.remarks || ''}, ${adv.created_by || null}, ${adv.created_by_name || ''},
          ${adv.created_at || new Date()}, ${adv.updated_at || new Date()}, ${adv.completed_at || null}, ${adv.completed_order_id || null},
          ${adv.invoice_number || null}, ${adv.final_payment_method || null}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ Inserted advance orders (${advanceOrders.length} processed)`);

    // 8. Advance timeline
    for (const tl of advanceTimeline) {
      await tx`
        INSERT INTO public.advance_order_timeline (
          advance_order_id, event_type, label, remarks, created_by, created_at
        ) VALUES (
          ${tl.advance_order_id}, ${tl.event_type}, ${tl.label},
          ${tl.remarks || ''}, ${tl.created_by || null}, ${tl.created_at || new Date()}
        )
      `;
    }
    console.log(`✓ Inserted advance timeline events (${advanceTimeline.length} processed)`);

    // 9. Advance payments
    for (const p of advancePayments) {
      await tx`
        INSERT INTO public.advance_order_payments (
          id, advance_order_id, payment_type, amount, payment_method, remarks, received_by, received_at
        ) VALUES (
          ${p.id}, ${p.advance_order_id}, ${p.payment_type},
          ${Number(p.amount || 0)}, ${p.payment_method || 'cash'},
          ${p.remarks || ''}, ${p.received_by || null}, ${p.received_at || new Date()}
        )
        ON CONFLICT (id) DO NOTHING
      `;
    }
    console.log(`✓ Inserted advance payments (${advancePayments.length} processed)`);
  });

  const countsAfter = {
    orders: (await sql`SELECT count(*)::int as c FROM public.orders`)[0].c,
    orderItems: (await sql`SELECT count(*)::int as c FROM public.order_items`)[0].c,
    advanceOrders: (await sql`SELECT count(*)::int as c FROM public.advance_orders`)[0].c,
    advanceTimeline: (await sql`SELECT count(*)::int as c FROM public.advance_order_timeline`)[0].c,
    advancePayments: (await sql`SELECT count(*)::int as c FROM public.advance_order_payments`)[0].c,
    products: (await sql`SELECT count(*)::int as c FROM public.products`)[0].c,
    categories: (await sql`SELECT count(*)::int as c FROM public.categories`)[0].c,
  };
  console.log('\nNeon counts AFTER migration:', countsAfter);
  console.log('\n=============================================================');
  console.log('MIGRATION COMMITTED TO NEON POSTGRES SUCCESSFULLY!');
  console.log('=============================================================');

  await sql.end();
}

migrate().catch(console.error);
