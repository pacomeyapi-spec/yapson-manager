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

app.use(express.json({ limit: '50mb' }));
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
  const { employe_id, mois, date, montant, note } = req.body;
  if (!employe_id || !montant) return res.status(400).json({ error: 'Données manquantes' });
  // date = jour précis de l'AVS (YYYY-MM-DD). mois dérivé de la date si fournie.
  const avsDate = date || (mois ? mois + '-01' : null);
  if (!avsDate) return res.status(400).json({ error: 'Date requise' });
  const avsMois = avsDate.slice(0, 7);
  const avs = { id: DB.nextId.avs++, employe_id: +employe_id, date: avsDate, mois: avsMois, montant: +montant, note: note || '', created_at: new Date().toISOString() };
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
  const { date } = req.query;
  const empId = +req.params.employe_id;
  const emp = DB.employes.find(e => e.id === empId);
  if (!emp) return res.status(404).json({ error: 'Employé non trouvé' });

  const mois = date.slice(0, 7);
  const [yr, mo] = mois.split('-').map(Number);
  const daysInMonth = new Date(yr, mo, 0).getDate();
  const joursNoms = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];

  const empAffectations = DB.employe_sites.filter(es => es.employe_id === empId);
  const allSiteIds = empAffectations.map(es => es.site_id);
  const allSites = DB.sites.filter(s => allSiteIds.includes(s.id) && s.actif);

  // Admin label par site : NOM_SITE si pas configuré
  const adminLabels = {};
  empAffectations.forEach(es => {
    const site = DB.sites.find(s => s.id === es.site_id);
    const siteName = site ? site.nom : '';
    adminLabels[es.site_id] = es.admin_label || (emp.nom + '_' + siteName);
  });

  // Toutes les perfs du mois
  const perfsMonth = DB.performances.filter(p =>
    p.employe_id === empId && p.date.startsWith(mois) && allSiteIds.includes(p.site_id)
  );
  const perfsDay = perfsMonth.filter(p => p.date === date);

  // AVS du mois (toutes) — pour le cumul
  const avsMonth = DB.avs.filter(a => a.employe_id === empId && a.mois === mois);
  const totalAvsMois = avsMonth.reduce((a, av) => a + av.montant, 0);

  // AVS prises le jour sélectionné uniquement
  const avsJourList = avsMonth.filter(a => (a.date || (a.mois + '-01')) === date);
  const avsJour = avsJourList.reduce((a, av) => a + av.montant, 0);

  // Cumul AVS jusqu'à la date sélectionnée (incluse)
  const avsCumul = avsMonth
    .filter(a => (a.date || (a.mois + '-01')) <= date)
    .reduce((a, av) => a + av.montant, 0);

  // ── Stats PAR SITE ──────────────────────────────────────
  const parSite = allSites.map(site => {
    const adminLabel = adminLabels[site.id] || (emp.nom + '_' + site.nom);

    // Perf du jour pour ce site
    const perfDay = perfsDay.find(p => p.site_id === site.id);
    const volJour = perfDay ? perfDay.volume_depot : 0;
    const comJour = perfDay ? perfDay.remuneration : 0;

    // Perfs du mois pour ce site
    const perfsMoisSite = perfsMonth.filter(p => p.site_id === site.id);
    const totalMoisSite = perfsMoisSite.reduce((a, p) => a + p.remuneration, 0);

    // Historique jour par jour pour ce site
    const joursMapSite = {};
    perfsMoisSite.forEach(p => {
      if (!joursMapSite[p.date]) joursMapSite[p.date] = { volume: 0, commission: 0 };
      joursMapSite[p.date].volume += p.volume_depot;
      joursMapSite[p.date].commission += p.remuneration;
    });
    const joursSite = [];
    for (let d = 1; d <= daysInMonth; d++) {
      const dd = String(d).padStart(2, '0');
      const dateStr = mois + '-' + dd;
      const jsDate = new Date(yr, mo - 1, d);
      const data = joursMapSite[dateStr] || { volume: 0, commission: 0 };
      joursSite.push({
        date: dateStr,
        jour: joursNoms[jsDate.getDay()],
        volume: data.volume,
        commission: Math.round(data.commission)
      });
    }

    return {
      site_id: site.id,
      site_nom: site.nom,
      admin_label: adminLabel,
      jour: { volume: volJour, commission: Math.round(comJour) },
      mensuel: { total: Math.round(totalMoisSite), jours: joursSite }
    };
  });

  // ── Grand total ─────────────────────────────────────────
  const grandTotalMois = parSite.reduce((a, s) => a + s.mensuel.total, 0);
  const totalVolJour = parSite.reduce((a, s) => a + s.jour.volume, 0);
  const totalComJour = parSite.reduce((a, s) => a + s.jour.commission, 0);

  res.json({
    employe: { ...emp, sites: allSiteIds, admin_labels: adminLabels },
    date, mois,
    par_site: parSite,
    totaux: {
      vol_jour: totalVolJour,
      com_jour: totalComJour,
      grand_total_mois: grandTotalMois,
      avs_jour: Math.round(avsJour),           // AVS prise ce jour précis
      avs_mois: Math.round(totalAvsMois),      // Total AVS du mois entier
      avs_cumul: Math.round(avsCumul),         // Cumul AVS jusqu'à ce jour
      avs_jour_details: avsJourList,
      avs_details: avsMonth,
      net: Math.round(grandTotalMois - avsJour) // NET = grand total - AVS du jour seulement
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

// ─── HISTORIQUE PAR SITE ─────────────────────────────────
app.get('/api/historique-sites', (req, res) => {
  const { debut, fin } = req.query;
  const sites = DB.sites.filter(s => s.actif);

  const sitesData = sites.map(site => {
    let sessions = DB.sessions.filter(s => s.site_id === site.id);
    if (debut) sessions = sessions.filter(s => s.date >= debut);
    if (fin)   sessions = sessions.filter(s => s.date <= fin);

    const totalDepot    = sessions.reduce((a, s) => a + s.volume_depot, 0);
    const totalRetrait  = sessions.reduce((a, s) => a + s.volume_retrait, 0);
    const totalComDepot = sessions.reduce((a, s) => a + s.commission_depot, 0);
    const totalComRetrait = sessions.reduce((a, s) => a + s.commission_retrait, 0);
    const totalCom      = sessions.reduce((a, s) => a + s.total_commission, 0);

    // Rémunérations employés sur ce site sur la période
    let perfs = DB.performances.filter(p => p.site_id === site.id);
    if (debut) perfs = perfs.filter(p => p.date >= debut);
    if (fin)   perfs = perfs.filter(p => p.date <= fin);
    const totalRemuEq = perfs.reduce((a, p) => a + p.remuneration, 0);

    // Historique jour par jour
    const jours = sessions
      .sort((a, b) => a.date.localeCompare(b.date))
      .map(s => ({
        date: s.date,
        volume_depot: s.volume_depot,
        volume_retrait: s.volume_retrait,
        commission_depot: Math.round(s.commission_depot),
        commission_retrait: Math.round(s.commission_retrait),
        total_commission: Math.round(s.total_commission)
      }));

    return {
      site,
      totaux: {
        volume_depot: totalDepot,
        volume_retrait: totalRetrait,
        commission_depot: Math.round(totalComDepot),
        commission_retrait: Math.round(totalComRetrait),
        commission_brute: Math.round(totalCom),
        remuneration_equipe: Math.round(totalRemuEq),
        net_patron: Math.round(totalCom - totalRemuEq)
      },
      jours
    };
  });

  res.json(sitesData);
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
