const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const DB_FILE = path.join(dataDir, 'manager.json');

function loadDb() {
  if (fs.existsSync(DB_FILE)) {
    try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch(e) {}
  }
  return {
    sites: [], employes: [], employe_sites: [],
    sessions: [], performances: [], avs: [],
    nextId: { sites: 1, employes: 1, sessions: 1, performances: 1, avs: 1 }
  };
}

function saveDb(data) {
  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

let DB = loadDb();
if (!DB.avs) { DB.avs = []; DB.nextId.avs = 1; saveDb(DB); }

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// ─── SITES ────────────────────────────────────────────────
app.get('/api/sites', (req, res) => res.json(DB.sites.filter(s => s.actif)));

app.post('/api/sites', (req, res) => {
  const { nom, depot_pct, retrait_pct } = req.body;
  if (!nom) return res.status(400).json({ error: 'Nom requis' });
  const site = { id: DB.nextId.sites++, nom, depot_pct: +depot_pct || 4, retrait_pct: +retrait_pct || 2, actif: true };
  DB.sites.push(site);
  saveDb(DB);
  res.json(site);
});

app.put('/api/sites/:id', (req, res) => {
  const site = DB.sites.find(s => s.id === +req.params.id);
  if (!site) return res.status(404).json({ error: 'Site non trouvé' });
  Object.assign(site, req.body);
  saveDb(DB);
  res.json(site);
});

app.delete('/api/sites/:id', (req, res) => {
  const site = DB.sites.find(s => s.id === +req.params.id);
  if (!site) return res.status(404).json({ error: 'Site non trouvé' });
  site.actif = false;
  saveDb(DB);
  res.json({ ok: true });
});

// ─── EMPLOYES ─────────────────────────────────────────────
app.get('/api/employes', (req, res) => {
  const employes = DB.employes.filter(e => e.actif).map(e => ({
    ...e,
    sites: DB.employe_sites.filter(es => es.employe_id === e.id).map(es => es.site_id),
    // admin_labels: { site_id: "Admin_Xxx", ... }
    admin_labels: DB.employe_sites
      .filter(es => es.employe_id === e.id)
      .reduce((acc, es) => { acc[es.site_id] = es.admin_label || ''; return acc; }, {})
  }));
  res.json(employes);
});

app.post('/api/employes', (req, res) => {
  const { nom, prenom, type_shift, pct_depot, sites, admin_labels } = req.body;
  // admin_labels = { site_id: "Admin_Xxx" }
  if (!nom || !prenom) return res.status(400).json({ error: 'Nom et prénom requis' });
  const pct = type_shift === 'nuit' ? 1.5 : 1.2;
  const emp = { id: DB.nextId.employes++, nom, prenom, type_shift: type_shift || 'jour', pct_depot: +pct_depot || pct, actif: true };
  DB.employes.push(emp);
  if (sites && sites.length) {
    sites.forEach(sid => {
      const label = (admin_labels && admin_labels[sid]) ? admin_labels[sid] : '';
      DB.employe_sites.push({ employe_id: emp.id, site_id: +sid, admin_label: label });
    });
  }
  saveDb(DB);
  res.json({ ...emp, sites: sites || [], admin_labels: admin_labels || {} });
});

app.put('/api/employes/:id', (req, res) => {
  const emp = DB.employes.find(e => e.id === +req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employé non trouvé' });
  const { sites, admin_labels, ...data } = req.body;
  Object.assign(emp, data);
  if (sites !== undefined) {
    DB.employe_sites = DB.employe_sites.filter(es => es.employe_id !== emp.id);
    sites.forEach(sid => {
      const label = (admin_labels && admin_labels[sid]) ? admin_labels[sid] : '';
      DB.employe_sites.push({ employe_id: emp.id, site_id: +sid, admin_label: label });
    });
  }
  saveDb(DB);
  const empSites = DB.employe_sites.filter(es => es.employe_id === emp.id);
  res.json({
    ...emp,
    sites: empSites.map(es => es.site_id),
    admin_labels: empSites.reduce((acc, es) => { acc[es.site_id] = es.admin_label || ''; return acc; }, {})
  });
});

app.delete('/api/employes/:id', (req, res) => {
  const emp = DB.employes.find(e => e.id === +req.params.id);
  if (!emp) return res.status(404).json({ error: 'Employé non trouvé' });
  emp.actif = false;
  saveDb(DB);
  res.json({ ok: true });
});

// ─── SESSIONS ─────────────────────────────────────────────
app.get('/api/sessions', (req, res) => {
  const { date, site_id } = req.query;
  let sessions = DB.sessions;
  if (date) sessions = sessions.filter(s => s.date === date);
  if (site_id) sessions = sessions.filter(s => s.site_id === +site_id);
  res.json(sessions);
});

app.post('/api/sessions', (req, res) => {
  const { date, site_id, volume_depot, volume_retrait } = req.body;
  const site = DB.sites.find(s => s.id === +site_id);
  if (!site) return res.status(400).json({ error: 'Site invalide' });
  const commission_depot = (+volume_depot * site.depot_pct) / 100;
  const commission_retrait = (+volume_retrait * site.retrait_pct) / 100;
  DB.sessions = DB.sessions.filter(s => !(s.date === date && s.site_id === +site_id));
  const session = {
    id: DB.nextId.sessions++, date, site_id: +site_id,
    volume_depot: +volume_depot, volume_retrait: +volume_retrait,
    commission_depot, commission_retrait, total_commission: commission_depot + commission_retrait
  };
  DB.sessions.push(session);
  saveDb(DB);
  res.json(session);
});

// ─── PERFORMANCES ─────────────────────────────────────────
app.get('/api/performances', (req, res) => {
  const { date, employe_id, mois } = req.query;
  let perfs = DB.performances;
  if (date) perfs = perfs.filter(p => p.date === date);
  if (employe_id) perfs = perfs.filter(p => p.employe_id === +employe_id);
  if (mois) perfs = perfs.filter(p => p.date.startsWith(mois));
  res.json(perfs);
});

app.post('/api/performances', (req, res) => {
  const { date, employe_id, site_id, volume_depot } = req.body;
  const emp = DB.employes.find(e => e.id === +employe_id);
  if (!emp) return res.status(400).json({ error: 'Employé invalide' });
  const remuneration = (+volume_depot * emp.pct_depot) / 100;
  DB.performances = DB.performances.filter(p => !(p.date === date && p.employe_id === +employe_id && p.site_id === +site_id));
  const perf = { id: DB.nextId.performances++, date, employe_id: +employe_id, site_id: +site_id, volume_depot: +volume_depot, remuneration };
  DB.performances.push(perf);
  saveDb(DB);
  res.json(perf);
});

app.delete('/api/performances/:id', (req, res) => {
  DB.performances = DB.performances.filter(p => p.id !== +req.params.id);
  saveDb(DB);
  res.json({ ok: true });
});

// ─── AVS ──────────────────────────────────────────────────
app.get('/api/avs', (req, res) => {
  const { employe_id, mois } = req.query;
  let avs = DB.avs;
  if (employe_id) avs = avs.filter(a => a.employe_id === +employe_id);
  if (mois) avs = avs.filter(a => a.mois === mois);
  res.json(avs);
});

app.post('/api/avs', (req, res) => {
  const { employe_id, mois, montant, note } = req.body;
  if (!employe_id || !mois || !montant) return res.status(400).json({ error: 'Données manquantes' });
  const avs = { id: DB.nextId.avs++, employe_id: +employe_id, mois, montant: +montant, note: note || '', created_at: new Date().toISOString() };
  DB.avs.push(avs);
  saveDb(DB);
  res.json(avs);
});

app.delete('/api/avs/:id', (req, res) => {
  DB.avs = DB.avs.filter(a => a.id !== +req.params.id);
  saveDb(DB);
  res.json({ ok: true });
});

// ─── RECAP EMPLOYE ────────────────────────────────────────
app.get('/api/recap/:employe_id', (req, res) => {
  const { date, site_id } = req.query;
  // site_id optionnel : si fourni, génère le récap pour CE site uniquement
  const empId = +req.params.employe_id;
  const emp = DB.employes.find(e => e.id === empId);
  if (!emp) return res.status(404).json({ error: 'Employé non trouvé' });

  const mois = date.slice(0, 7);

  // Récupérer les affectations avec admin_label
  const empAffectations = DB.employe_sites.filter(es => es.employe_id === empId);
  const targetSiteIds = site_id
    ? empAffectations.filter(es => es.site_id === +site_id).map(es => es.site_id)
    : empAffectations.map(es => es.site_id);

  const sites = DB.sites.filter(s => targetSiteIds.includes(s.id));

  // Admin label par site
  const adminLabels = {};
  empAffectations.forEach(es => { adminLabels[es.site_id] = es.admin_label || `Admin_${emp.nom}`; });

  // Perfs du mois (tous sites ou site ciblé)
  const perfsMonth = DB.performances.filter(p =>
    p.employe_id === empId &&
    p.date.startsWith(mois) &&
    targetSiteIds.includes(p.site_id)
  );
  const perfsDay = perfsMonth.filter(p => p.date === date);

  // Totaux jour
  const totalVolDay = perfsDay.reduce((a, p) => a + p.volume_depot, 0);
  const totalComDay = perfsDay.reduce((a, p) => a + p.remuneration, 0);

  // Détail par site pour le jour
  const parSite = sites.map(site => {
    const perf = perfsDay.find(p => p.site_id === site.id);
    return {
      site_id: site.id,
      site_nom: site.nom,
      admin_label: adminLabels[site.id] || `Admin_${emp.nom}`,
      volume: perf ? perf.volume_depot : 0,
      commission: perf ? perf.remuneration : 0
    };
  }).filter(s => s.volume > 0);

  // Total mois
  const totalComMonth = perfsMonth.reduce((a, p) => a + p.remuneration, 0);

  // AVS du mois
  const avsMonth = DB.avs.filter(a => a.employe_id === empId && a.mois === mois);
  const totalAvs = avsMonth.reduce((a, av) => a + av.montant, 0);

  // Historique jour par jour du mois
  const [yr, mo] = mois.split('-').map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  const joursNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const joursMap = {};
  perfsMonth.forEach(p => {
    if (!joursMap[p.date]) joursMap[p.date] = { volume: 0, commission: 0 };
    joursMap[p.date].volume += p.volume_depot;
    joursMap[p.date].commission += p.remuneration;
  });

  const jours = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dd = String(d).padStart(2, '0');
    const dateStr = `${mois}-${dd}`;
    const jsDate = new Date(yr, mo - 1, d);
    const data = joursMap[dateStr] || { volume: 0, commission: 0 };
    jours.push({
      date: dateStr,
      jour: joursNoms[jsDate.getDay()],
      volume: data.volume,
      commission: Math.round(data.commission)
    });
  }

  // Sobriquet principal : si multi-sites, on prend le 1er site actif du jour, sinon le 1er site
  const adminLabelPrincipal = parSite.length > 0
    ? parSite[0].admin_label
    : (sites.length > 0 ? (adminLabels[sites[0].id] || `Admin_${emp.nom}`) : `Admin_${emp.nom}`);

  res.json({
    employe: { ...emp, sites: targetSiteIds, admin_labels: adminLabels },
    date, mois,
    admin_label: adminLabelPrincipal,
    jour: {
      total_volume: totalVolDay,
      total_commission: Math.round(totalComDay),
      par_site: parSite
    },
    mensuel: {
      grand_total: Math.round(totalComMonth),
      avs: Math.round(totalAvs),
      avs_details: avsMonth,
      net: Math.round(totalComMonth - totalAvs),
      jours
    }
  });
});

// ─── DASHBOARD ────────────────────────────────────────────
app.get('/api/dashboard', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'Date requise' });
  const sessions = DB.sessions.filter(s => s.date === date);
  const performances = DB.performances.filter(p => p.date === date);
  const sites = DB.sites.filter(s => s.actif);
  const employes = DB.employes.filter(e => e.actif);
  let total_commission = 0, total_volume_depot = 0, total_volume_retrait = 0;
  const sitesData = sites.map(site => {
    const session = sessions.find(s => s.site_id === site.id) || {};
    const sitePerfs = performances.filter(p => p.site_id === site.id);
    const total_remuneration_employes = sitePerfs.reduce((acc, p) => acc + p.remuneration, 0);
    const net = (session.total_commission || 0) - total_remuneration_employes;
    total_commission += (session.total_commission || 0);
    total_volume_depot += (session.volume_depot || 0);
    total_volume_retrait += (session.volume_retrait || 0);
    return { site, session, employes_perf: sitePerfs.map(p => ({ ...p, employe: employes.find(e => e.id === p.employe_id) })), total_remuneration_employes, net_patron: net };
  });
  res.json({ date, sites: sitesData, totaux: { volume_depot: total_volume_depot, volume_retrait: total_volume_retrait, commission_brute: total_commission, remuneration_employes: performances.reduce((acc, p) => acc + p.remuneration, 0), net_patron: total_commission - performances.reduce((acc, p) => acc + p.remuneration, 0) } });
});

// ─── HISTORIQUE ───────────────────────────────────────────
app.get('/api/historique', (req, res) => {
  const { debut, fin } = req.query;
  let sessions = DB.sessions;
  if (debut) sessions = sessions.filter(s => s.date >= debut);
  if (fin) sessions = sessions.filter(s => s.date <= fin);
  const byDate = {};
  sessions.forEach(s => {
    if (!byDate[s.date]) byDate[s.date] = { date: s.date, commission: 0, volume_depot: 0, volume_retrait: 0 };
    byDate[s.date].commission += s.total_commission;
    byDate[s.date].volume_depot += s.volume_depot;
    byDate[s.date].volume_retrait += s.volume_retrait;
  });
  const perfs = DB.performances.filter(p => (!debut || p.date >= debut) && (!fin || p.date <= fin));
  perfs.forEach(p => { if (byDate[p.date]) byDate[p.date].remuneration = (byDate[p.date].remuneration || 0) + p.remuneration; });
  res.json(Object.values(byDate).sort((a, b) => b.date.localeCompare(a.date)).map(d => ({ ...d, net: d.commission - (d.remuneration || 0) })));
});

// ─── BACKUP / RESTORE ────────────────────────────────────
app.get('/api/backup', (req, res) => {
  res.setHeader('Content-Disposition', 'attachment; filename="yapson-backup-' + new Date().toISOString().slice(0,10) + '.json"');
  res.setHeader('Content-Type', 'application/json');
  res.json(DB);
});

app.post('/api/restore', (req, res) => {
  const data = req.body;
  if (!data || !data.sites || !data.employes) return res.status(400).json({ error: 'Données invalides' });
  DB = data;
  if (!DB.avs) { DB.avs = []; DB.nextId.avs = 1; }
  saveDb(DB);
  res.json({ ok: true, msg: 'Données restaurées avec succès' });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`✅ Yapson Manager démarré sur port ${PORT}`));
