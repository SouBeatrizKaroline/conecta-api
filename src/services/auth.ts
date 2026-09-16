
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');

const SECRET = process.env.JWT_SECRET;
const EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

function signToken(user) {
  return jwt.sign(
    { sub: String(user.id), email: user.email, role: user.role || 'user' },
    SECRET,
    { expiresIn: EXPIRES_IN }
  );
}

function requireAuth(req, res, next) {
  const [scheme, token] = (req.headers.authorization || '').split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Token ausente' });
  }
  try {
    const payload = jwt.verify(token, SECRET);
    req.user = { id: payload.sub, email: payload.email, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }
}

function requireRole(...roles) {
  return (req, res, next) =>
    roles.includes(req.user?.role)
      ? next()
      : res.status(403).json({ error: 'Permissão insuficiente' });
}

module.exports = { signToken, requireAuth, requireRole, bcrypt };
