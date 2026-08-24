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

function theatreFiler({ cityId, localDate, condition }) {
  const seed = seedInt(`${cityId}|${localDate}`);
  const pool = reasons[condition] || reasons.sun;
  return { name: pick(seed, names), reason: pick(Math.floor(seed / names.length), pool) };
}

module.exports = { roundCoord, rivalForSlot, theatreFiler };
