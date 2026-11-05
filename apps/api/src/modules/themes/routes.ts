import { Router } from 'express';
import { z } from 'zod';

const router = Router();

const themes = new Map();

// 10 predefined themes
const defaultThemes = [
  { id: 'classic-grid', name: 'classic-grid', displayName: 'Classic Grid', primary: '#00A86B', secondary: '#0D1B16', accent: '#FFD700', cssVars: { '--color-primary': '#00A86B', '--color-secondary': '#0D1B16', '--color-accent': '#FFD700' } },
  { id: 'barber-noir', name: 'barber-noir', displayName: 'Barber Noir', primary: '#1A1A1A', secondary: '#2D2D2D', accent: '#C9A84C', cssVars: { '--color-primary': '#1A1A1A', '--color-secondary': '#2D2D2D', '--color-accent': '#C9A84C' } },
  { id: 'urban-steel', name: 'urban-steel', displayName: 'Urban Steel', primary: '#2C3E50', secondary: '#34495E', accent: '#E74C3C', cssVars: { '--color-primary': '#2C3E50', '--color-secondary': '#34495E', '--color-accent': '#E74C3C' } },
  { id: 'vintage-cut', name: 'vintage-cut', displayName: 'Vintage Cut', primary: '#8B4513', secondary: '#A0522D', accent: '#D4A573', cssVars: { '--color-primary': '#8B4513', '--color-secondary': '#A0522D', '--color-accent': '#D4A573' } },
  { id: 'fresh-mint', name: 'fresh-mint', displayName: 'Fresh Mint', primary: '#00BFA6', secondary: '#008F7A', accent: '#FF6B6B', cssVars: { '--color-primary': '#00BFA6', '--color-secondary': '#008F7A', '--color-accent': '#FF6B6B' } },
  { id: 'midnight-blue', name: 'midnight-blue', displayName: 'Midnight Blue', primary: '#1E3A5F', secondary: '#2C5F8A', accent: '#F39C12', cssVars: { '--color-primary': '#1E3A5F', '--color-secondary': '#2C5F8A', '--color-accent': '#F39C12' } },
  { id: 'rose-gold', name: 'rose-gold', displayName: 'Rose Gold', primary: '#B76E79', secondary: '#D4A5A5', accent: '#F7E7CE', cssVars: { '--color-primary': '#B76E79', '--color-secondary': '#D4A5A5', '--color-accent': '#F7E7CE' } },
  { id: 'carbon-fiber', name: 'carbon-fiber', displayName: 'Carbon Fiber', primary: '#0F0F0F', secondary: '#1A1A1A', accent: '#00FFFF', cssVars: { '--color-primary': '#0F0F0F', '--color-secondary': '#1A1A1A', '--color-accent': '#00FFFF' } },
  { id: 'sunset-barber', name: 'sunset-barber', displayName: 'Sunset Barber', primary: '#E85D04', secondary: '#FF8C42', accent: '#FFD166', cssVars: { '--color-primary': '#E85D04', '--color-secondary': '#FF8C42', '--color-accent': '#FFD166' } },
  { id: 'forest-green', name: 'forest-green', displayName: 'Forest Green', primary: '#2D5016', secondary: '#3D6B21', accent: '#A8D08D', cssVars: { '--color-primary': '#2D5016', '--color-secondary': '#3D6B21', '--color-accent': '#A8D08D' } },
];

defaultThemes.forEach(t => themes.set(t.id, { ...t, createdAt: new Date() }));

router.get('/', (req, res) => {
  res.json(Array.from(themes.values()));
});

router.get('/:id', (req, res) => {
  const theme = themes.get(req.params.id);
  if (!theme) return res.status(404).json({ error: 'Tema não encontrado' });
  res.json(theme);
});

export default router;