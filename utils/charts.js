// utils/charts.js — Générateurs d'URL QuickChart.io (Chart.js v2 compatible)
//
// lineURL  → courbe temporelle : données + ligne moyenne + ligne pic max
// hBarURL  → barres horizontales : données + ligne moyenne
//
// Utilise l'API POST /chart/create de QuickChart pour obtenir un short URL
// (<100 chars) contournant la limite des 2048 chars de Discord media.url.

const https = require('https');

const BG   = '#2f3136';
const GRID = 'rgba(255,255,255,0.08)';
const TICK = '#b9bbbe';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function _avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}
function _max(arr)    { return arr.length ? Math.max(...arr) : 0; }
function _maxIdx(arr) { return arr.indexOf(_max(arr)); }

// Transforme 'rgba(88,101,242,1)' → 'rgba(88,101,242,0.15)' pour le fill
function _fade(color, alpha = 0.15) {
  return color.replace(/[\d.]+\)$/, `${alpha})`);
}

// Envoie la config à QuickChart POST /chart/create → retourne le short URL
// Retourne null en cas d'erreur réseau pour ne pas planter le bot
async function _postChart(cfg, w = 520, h = 220) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ backgroundColor: BG, width: w, height: h, chart: cfg });
    const options = {
      hostname: 'quickchart.io',
      path: '/chart/create',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    };
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(raw);
          resolve(json.success ? json.url : null);
        } catch {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(8000, () => { req.destroy(); resolve(null); });
    req.write(body);
    req.end();
  });
}

// ─── Courbe temporelle ────────────────────────────────────────────────────────
// labels  : string[]   ex. ['Lun','Mar',...]
// data    : number[]   valeurs
// color   : string     ex. 'rgba(88,101,242,1)'
// pLabel  : string     ex. '7j' — affiché dans le titre
// unit    : string     ex. 'msg' ou 'min'
// h       : number     hauteur px (défaut 220)
//
// 3 datasets :
//   0 - courbe principale avec remplissage
//   1 - ligne pointillée jaune au niveau de la MOYENNE
//   2 - ligne pointillée orange au niveau du PIC MAX
async function lineURL(labels, data, color, pLabel, unit = '', h = 220) {
  if (!labels.length || !data.length) return null;

  const maxVal = _max(data);
  const avgVal = Math.round(_avg(data));
  const mxIdx  = _maxIdx(data);
  const u      = unit ? ` ${unit}` : '';

  const cfg = {
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: `${pLabel}`,
          data,
          borderColor: color,
          backgroundColor: _fade(color, 0.18),
          borderWidth: 2,
          pointRadius: 2,
          fill: true,
          lineTension: 0.4,
        },
        {
          label: `Moy ${avgVal}${u}`,
          data: data.map(() => avgVal),
          borderColor: 'rgba(255,220,80,0.85)',
          borderWidth: 1,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          lineTension: 0,
        },
        {
          label: `Pic ${maxVal}${u} (${labels[mxIdx] ?? ''})`,
          data: data.map(() => maxVal),
          borderColor: 'rgba(255,130,60,0.8)',
          borderWidth: 1,
          borderDash: [3, 5],
          pointRadius: 0,
          fill: false,
          lineTension: 0,
        },
      ],
    },
    options: {
      legend: { display: true, labels: { fontColor: TICK, fontSize: 10, boxWidth: 10 } },
      title: { display: true, text: `Période : ${pLabel}`, fontColor: '#dcddde', fontSize: 11, padding: 4 },
      scales: {
        yAxes: [{ ticks: { beginAtZero: true, fontColor: TICK, maxTicksLimit: 6 }, gridLines: { color: GRID } }],
        xAxes: [{ ticks: { fontColor: TICK }, gridLines: { display: false } }],
      },
    },
  };

  return _postChart(cfg, 520, h);
}

// ─── Barres horizontales + ligne de moyenne ────────────────────────────────
// labels  : string[]   noms (membres, salons, jeux)
// data    : number[]   valeurs
// color   : string     couleur principale ex. 'rgba(87,242,135,0.85)'
// pLabel  : string     période
// unit    : string     ex. 'min' ou 'msg'
// h       : number     hauteur px
//
// 2 datasets :
//   0 - barres (la barre du 1er est plus lumineuse)
//   1 - ligne de moyenne (pointillée jaune, type line)
async function hBarURL(labels, data, color, pLabel, unit = '', h = 220) {
  if (!labels.length || !data.length) return null;

  const avgVal    = Math.round(_avg(data));
  const mxIdx     = _maxIdx(data);
  const colorFull = color.replace(/[\d.]+\)$/, '1)');
  const bgColors  = data.map((_, i) => (i === mxIdx ? colorFull : color));
  const u         = unit ? ` ${unit}` : '';

  const cfg = {
    type: 'horizontalBar',
    data: {
      labels,
      datasets: [
        {
          label: `${pLabel}`,
          data,
          backgroundColor: bgColors,
          borderWidth: 0,
        },
        {
          label: `Moy ${avgVal}${u}`,
          data: data.map(() => avgVal),
          type: 'line',
          borderColor: 'rgba(255,220,80,0.85)',
          borderWidth: 1,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
          lineTension: 0,
        },
      ],
    },
    options: {
      legend: { display: true, labels: { fontColor: TICK, fontSize: 10, boxWidth: 10 } },
      title: { display: true, text: `Période : ${pLabel}`, fontColor: '#dcddde', fontSize: 11, padding: 4 },
      scales: {
        xAxes: [{ ticks: { beginAtZero: true, fontColor: TICK }, gridLines: { color: GRID } }],
        yAxes: [{ ticks: { fontColor: TICK }, gridLines: { display: false } }],
      },
    },
  };

  return _postChart(cfg, 520, h);
}

module.exports = { lineURL, hBarURL };
