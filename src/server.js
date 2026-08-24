const path = require('node:path');
const { openDb } = require('./db');
const { createWeather } = require('./lib/weather');
const { createApp } = require('./app');

const db = openDb(path.join(__dirname, '..', 'data', 'ministry.sqlite'));
const now = () => new Date();
const weather = createWeather({ db, fetchFn: global.fetch, now });
const app = createApp({ db, now, weather });

const port = Number(process.env.PORT) || 3006;

app.listen(port, () => {
  console.log(`The Ministry of Weather is open at http://localhost:${port}`);
});
