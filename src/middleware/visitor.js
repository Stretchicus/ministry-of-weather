const crypto = require('node:crypto');

const COOKIE_NAME = 'ministry_visitor';
const ONE_YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function createVisitorMiddleware({ db, now }) {
  const findVisitor = db.prepare('SELECT * FROM visitors WHERE token = ?');
  const insertVisitor = db.prepare(
    'INSERT INTO visitors (token, created_at) VALUES (?, ?)'
  );

  return function visitor(req, res, next) {
    let token = req.cookies[COOKIE_NAME];
    let visitor = token ? findVisitor.get(token) : undefined;

    if (!visitor) {
      token = crypto.randomBytes(24).toString('hex');
      insertVisitor.run(token, now().toISOString());
      visitor = findVisitor.get(token);
      res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: ONE_YEAR_MS,
        secure: process.env.NODE_ENV === 'production'
      });
    }

    req.visitor = visitor;
    next();
  };
}

module.exports = { createVisitorMiddleware };
