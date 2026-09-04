const crypto = require('node:crypto');
const { names, reasons } = require('../../config/rivals');

function roundCoord(n) {
  return Number(Number(n).toFixed(3));
}

function seedInt(s) {
  return parseInt(crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 8), 16);
}

function pick(seed, arr) {
  return arr[seed % arr.length];
}

function rivalForSlot({ latitude, longitude, localDate, period, actualCondition }) {
  const seed = seedInt(`${roundCoord(latitude)}|${roundCoord(longitude)}|${localDate}|${period}`);
  const pool = reasons[actualCondition] || reasons.sun;
  return { name: pick(seed, names), reason: pick(Math.floor(seed / names.length), pool) };
}

function theatreFiler({ cityId, localDate, condition, attempt = 0 }) {
  const seed = seedInt(attempt === 0 ? `${cityId}|${localDate}` : `${cityId}|${localDate}|${attempt}`);
  const pool = reasons[condition] || reasons.sun;
  return { name: pick(seed, names), reason: pick(Math.floor(seed / names.length), pool) };
}

function theatreRequestedWeather({ cityId, localDate, actual }) {
  const seed = seedInt(`${cityId}|${localDate}`);
  const offset = (seed % 7) - 3;
  let temperatureC = actual.temperatureC + offset;
  if (temperatureC < -20) temperatureC = -20;
  if (temperatureC > 45) temperatureC = 45;
  return {
    condition: actual.condition,
    temperatureC,
    wind: actual.wind,
    humidity: actual.humidity
  };
}

module.exports = { roundCoord, rivalForSlot, theatreFiler, theatreRequestedWeather, seedInt };
