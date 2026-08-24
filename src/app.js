const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const brand = require('../config/brand');
const { createVisitorMiddleware } = require('./middleware/visitor');

function createApp({ db, now, weather }) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.locals.brand = brand;
  app.locals.weather = weather;

  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(createVisitorMiddleware({ db, now }));

  app.get('/', (req, res) => {
    res.render('layout', { page: 'home' });
  });

  return app;
}

module.exports = { createApp };
