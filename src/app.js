const path = require('node:path');
const express = require('express');
const cookieParser = require('cookie-parser');
const brand = require('../config/brand');
const copy = require('../config/copy');
const { CONDITIONS, WINDS, HUMIDITIES } = require('../config/weather');
const { PERIODS } = require('./lib/time');
const { buildBoard } = require('./lib/board');
const {
  hasActiveFilingToday,
  fileOrder,
  cancelOrder,
  listOrdersForVisitor,
  hydrateOrder
} = require('./lib/orders');
const { createVisitorMiddleware } = require('./middleware/visitor');

function loadVisitor(db, id) {
  return db.prepare('SELECT * FROM visitors WHERE id = ?').get(id);
}

function formState(body = {}) {
  return {
    call_me: body.call_me || '',
    place: body.place || '',
    local_date: body.local_date || '',
    period: body.period || 'afternoon',
    condition: body.condition || 'sun',
    temperature_c: body.temperature_c || '18',
    wind: body.wind || 'breeze',
    humidity: body.humidity || 'pleasant',
    reason: body.reason || ''
  };
}

function createApp({ db, now, weather }) {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', 'views'));
  app.locals.brand = brand;
  app.locals.copy = copy;
  app.locals.weather = weather;
  app.locals.CONDITIONS = CONDITIONS;
  app.locals.WINDS = WINDS;
  app.locals.HUMIDITIES = HUMIDITIES;
  app.locals.PERIODS = Object.keys(PERIODS);

  app.use(cookieParser());
  app.use(express.urlencoded({ extended: false }));
  app.use(express.static(path.join(__dirname, '..', 'public')));
  app.use(createVisitorMiddleware({ db, now }));

  app.get('/', async (req, res) => {
    const board = await buildBoard({ db, weather, now: now() });
    res.render('layout', { page: 'home', board });
  });

  app.get('/request', (req, res) => {
    const visitor = loadVisitor(db, req.visitor.id);
    const locked = hasActiveFilingToday(db, visitor.id, now());
    res.render('layout', {
      page: 'request',
      visitor,
      locked,
      error: locked ? copy.alreadyFiled : null,
      places: null,
      form: formState()
    });
  });

  app.post('/request', async (req, res) => {
    const body = req.body;
    let visitor = loadVisitor(db, req.visitor.id);
    const form = formState(body);

    if (!visitor.display_name) {
      const name = typeof body.call_me === 'string' ? body.call_me.trim() : '';
      if (name.length < 2 || name.length > 40) {
        return res.status(200).render('layout', {
          page: 'request',
          visitor,
          locked: false,
          error: 'The clerks require a name of two to forty letters.',
          places: null,
          form
        });
      }
      db.prepare('UPDATE visitors SET display_name = ? WHERE id = ?').run(name, visitor.id);
      visitor = loadVisitor(db, visitor.id);
    }

    if (hasActiveFilingToday(db, visitor.id, now())) {
      return res.status(200).render('layout', {
        page: 'request',
        visitor,
        locked: true,
        error: copy.alreadyFiled,
        places: null,
        form
      });
    }

    const query = typeof body.place === 'string' ? body.place.trim() : '';
    let places = await weather.geocode(query);
    if (!places || places.length === 0) {
      return res.status(200).render('layout', {
        page: 'request',
        visitor,
        locked: false,
        error: copy.parishNotFound,
        places: null,
        form
      });
    }

    let place = places[0];
    if (places.length > 1 && body.place_index === undefined) {
      return res.status(200).render('layout', {
        page: 'request',
        visitor,
        locked: false,
        error: null,
        places,
        form
      });
    }
    if (body.place_index !== undefined) {
      const index = Number.parseInt(body.place_index, 10);
      place = places[index] || places[0];
    }

    const result = fileOrder(db, visitor, {
      placeName: place.name,
      country: place.country,
      latitude: place.latitude,
      longitude: place.longitude,
      timezone: place.timezone,
      localDate: body.local_date,
      period: body.period,
      condition: body.condition,
      temperatureC: Number.parseInt(body.temperature_c, 10),
      wind: body.wind,
      humidity: body.humidity,
      reason: body.reason
    }, now());

    if (!result.ok) {
      const error = result.code === 'already_filed'
        ? copy.alreadyFiled
        : (result.code === 'too_soon' || result.code === 'not_today')
          ? copy.tooSoon
          : 'The clerks cannot stamp that form.';
      return res.status(200).render('layout', {
        page: 'request',
        visitor,
        locked: result.code === 'already_filed',
        error,
        places: null,
        form
      });
    }

    res.redirect('/ledger');
  });

  app.get('/ledger', async (req, res) => {
    const visitor = loadVisitor(db, req.visitor.id);
    const rows = listOrdersForVisitor(db, visitor.id);
    const orders = [];
    for (const order of rows) {
      orders.push(await hydrateOrder(order, { weather, now: now() }));
    }
    res.render('layout', {
      page: 'ledger',
      visitor,
      orders,
      withdrawn: req.query.withdrawn === '1',
      clerkNote: req.query.note || null
    });
  });

  app.post('/orders/:id/cancel', (req, res) => {
    if (req.body.confirm !== 'yes') {
      return res.redirect('/ledger');
    }
    const visitor = loadVisitor(db, req.visitor.id);
    const result = cancelOrder(db, visitor, Number.parseInt(req.params.id, 10), now());
    if (!result.ok) {
      return res.status(200).render('layout', {
        page: 'ledger',
        visitor,
        orders: listOrdersForVisitor(db, visitor.id).map((order) => ({
          ...order,
          status: order.cancelled_at ? 'cancelled' : 'queued',
          canCancel: false,
          actual: null,
          rival: null,
          outcome: null,
          observatory: false
        })),
        withdrawn: false,
        clerkNote: result.code === 'too_late' ? copy.engineEnRoute : null
      });
    }
    const note = encodeURIComponent(`${copy.stampReturned} ${result.copy}`);
    res.redirect(`/ledger?withdrawn=1&note=${note}`);
  });

  return app;
}

module.exports = { createApp };
