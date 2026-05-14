# 💹 Yapson Manager

Application web de gestion de comptes mobile money et de salariés.

## Fonctionnalités

- **Gestion des sites** : créer jusqu'à N sites, configurer le % de commission dépôt et retrait
- **Gestion des employés** : créer les employés, définir leur type (jour/nuit), leur % de rémunération, et les affecter aux sites
- **Saisie journalière** : renseigner les volumes dépôt/retrait par site chaque soir
- **Performances employés** : renseigner ce que chaque employé a confirmé en volume
- **Tableau de bord** : vue consolidée avec net patron (commissions − rémunérations équipe)
- **Historique** : consulter les performances sur n'importe quelle période

## Déploiement sur Railway

### 1. Créer un repo GitHub

```bash
cd yapson-manager
git init
git add .
git commit -m "Initial commit - Yapson Manager"
git remote add origin https://github.com/TON_USERNAME/yapson-manager.git
git push -u origin main
```

### 2. Déployer sur Railway

1. Aller sur [railway.app](https://railway.app)
2. **New Project** → **Deploy from GitHub repo**
3. Sélectionner le repo `yapson-manager`
4. Railway détecte automatiquement Node.js et déploie
5. Aller dans **Settings** → **Networking** → **Generate Domain** pour avoir une URL publique

### 3. Variables d'environnement (optionnel)

Dans Railway → Variables :
```
PORT=3000
DB_PATH=/app/data/manager.json
```

## Utilisation locale

```bash
npm install
npm start
# Ouvrir http://localhost:3000
```

## Stack technique

- **Backend** : Node.js + Express
- **Base de données** : JSON file (persistance simple, pas de dépendances natives)
- **Frontend** : HTML/CSS/JS vanilla (single page app)
- **Hébergement** : Railway
