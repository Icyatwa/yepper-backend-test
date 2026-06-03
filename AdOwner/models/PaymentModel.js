// AdOwner/models/PaymentModel.js (PostgreSQL)
const { query } = require('../../config/db');

const Payment = {
  async create(data) {
    const { rows } = await query(
      `INSERT INTO payments (payment_id, tx_ref, base_reference, ad_id, advertiser_id, web_owner_id,
        website_id, category_id, amount, currency, status, xentri_pay_data, flutterwave_data,
        refund_applied, wallet_applied, amount_paid, payment_method, payment_type,
        is_reassignment, notes, metadata, paid_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)
       RETURNING *`,
      [data.paymentId, data.tx_ref, data.baseReference||null, data.adId||null,
       data.advertiserId, data.webOwnerId, data.websiteId||null, data.categoryId||null,
       data.amount, data.currency||'RWF', data.status||'pending',
       data.xentriPayData ? JSON.stringify(data.xentriPayData) : null,
       data.flutterwaveData ? JSON.stringify(data.flutterwaveData) : null,
       data.refundApplied||0, data.walletApplied||0, data.amountPaid||null,
       data.paymentMethod||'xentripay', data.paymentType||null,
       data.isReassignment||false, data.notes||null,
       data.metadata ? JSON.stringify(data.metadata) : null, data.paidAt||null]
    );
    return rows[0];
  },
  async findById(id) {
    const { rows } = await query(`SELECT * FROM payments WHERE id = $1`, [id]);
    return rows[0] || null;
  },
  async findByPaymentId(paymentId) {
    const { rows } = await query(`SELECT * FROM payments WHERE payment_id = $1`, [paymentId]);
    return rows[0] || null;
  },
  async findByTxRef(txRef) {
    const { rows } = await query(`SELECT * FROM payments WHERE tx_ref = $1`, [txRef]);
    return rows[0] || null;
  },
  async findByAdvertiser(advertiserId, filters = {}) {
    let q = `SELECT * FROM payments WHERE advertiser_id = $1`;
    const vals = [advertiserId];
    if (filters.status) { q += ` AND status = $${vals.length+1}`; vals.push(filters.status); }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await query(q, vals);
    return rows;
  },
  async findByWebOwner(webOwnerId, filters = {}) {
    let q = `SELECT * FROM payments WHERE web_owner_id = $1`;
    const vals = [webOwnerId];
    if (filters.status) { q += ` AND status = $${vals.length+1}`; vals.push(filters.status); }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await query(q, vals);
    return rows;
  },
  async findByBaseReference(baseReference) {
    const { rows } = await query(`SELECT * FROM payments WHERE base_reference = $1 ORDER BY created_at ASC`, [baseReference]);
    return rows;
  },
  async findAvailableRefunds(advertiserId) {
    const { rows } = await query(
      `SELECT * FROM payments WHERE advertiser_id = $1 AND status IN ('refunded','internally_refunded') AND refund_used IS NOT TRUE ORDER BY refunded_at ASC`,
      [advertiserId]
    );
    return rows;
  },
  // Fetch all payments for a specific ad, joined with website/category/ad info
  async findByAd(adId) {
    const { rows } = await query(
      `SELECT p.*,
              w.website_name,
              c.category_name, c.price AS category_price,
              ia.business_name AS ad_business_name
       FROM payments p
       LEFT JOIN websites w ON w.id = p.website_id
       LEFT JOIN ad_categories c ON c.id = p.category_id
       LEFT JOIN import_ads ia ON ia.id = p.ad_id
       WHERE p.ad_id = $1 ORDER BY p.created_at DESC`,
      [adId]
    );
    return rows;
  },
  // Fetch refund-eligible payments for a specific advertiser, joined with ad business name
  async findRefundsByAdvertiser(advertiserId) {
    const { rows } = await query(
      `SELECT p.amount, p.refunded_at, p.refund_reason, p.refund_used,
              ia.business_name AS ad_business_name
       FROM payments p
       LEFT JOIN import_ads ia ON ia.id = p.ad_id
       WHERE p.advertiser_id = $1 AND p.status = 'refunded' AND p.refund_used IS NOT TRUE
       ORDER BY p.refunded_at ASC`,
      [advertiserId]
    );
    return rows;
  },
  async update(id, fields) {
    const keys = Object.keys(fields);
    if (!keys.length) return this.findById(id);
    const setClauses = keys.map((k,i) => `${toSnake(k)} = $${i+2}`).join(', ');
    const vals = keys.map(k => typeof fields[k]==='object'&&fields[k]!==null ? JSON.stringify(fields[k]) : fields[k]);
    const { rows } = await query(
      `UPDATE payments SET ${setClauses} WHERE id = $1 RETURNING *`, [id, ...vals]
    );
    return rows[0] || null;
  },
  async findAll(filters = {}) {
    let q = `SELECT * FROM payments WHERE 1=1`;
    const vals = [];
    if (filters.status) { q += ` AND status = $${vals.length+1}`; vals.push(filters.status); }
    q += ` ORDER BY created_at DESC`;
    const { rows } = await query(q, vals);
    return rows;
  },
};
function toSnake(s){ return s.replace(/[A-Z]/g,c=>`_${c.toLowerCase()}`); }
module.exports = Payment;