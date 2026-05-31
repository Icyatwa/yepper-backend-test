// middleware/adminAuth.js
const adminAuth = (req, res, next) => {
  const ref   = req.headers['x-node-ref'];
  const token = req.headers['x-node-key'];

  const validRef   = process.env.ADMIN_NAME;
  const validToken = process.env.ADMIN_SECRET;

  if (
    !ref   || !token        ||
    !validRef || !validToken ||
    ref   !== validRef      ||
    token !== validToken
  ) {
    return res.status(401).json({ success: false, message: 'Unauthorized' });
  }

  req.admin = { username: ref };
  next();
};

module.exports = adminAuth;
