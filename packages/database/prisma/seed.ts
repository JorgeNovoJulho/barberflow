import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create themes
  const themes = [
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

  for (const theme of themes) {
    await prisma.theme.upsert({
      where: { id: theme.id },
      update: theme,
      create: theme,
    });
  }

  // Create plans
  const plans = [
    { id: 'plan-monthly', name: 'Mensal', priceMonthly: 49.90, priceYearly: 549.90, features: ['Agenda ilimitada', 'Até 5 profissionais', 'Página personalizada', 'Marketplace', 'Fidelidade', 'Relatórios básicos', 'Suporte email'], maxProfessionals: 5, trialDays: 14, active: true },
    { id: 'plan-yearly', name: 'Anual', priceMonthly: 49.90, priceYearly: 549.90, features: ['Tudo do mensal', 'Profissionais ilimitados', 'Relatórios avançados', 'WhatsApp API', 'API desenvolvedores', 'Suporte prioritário', 'Domínio customizado'], maxProfessionals: null, trialDays: 14, active: true },
  ];

  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { id: plan.id },
      update: plan,
      create: plan,
    });
  }

  // Create super admin user
  const bcrypt = await import('bcryptjs');
  const superAdminPassword = await bcrypt.default.hash('jorge0609', 12);

  await prisma.user.upsert({
    where: { email: 'jorgericardosalgado@gmail.com' },
    update: { passwordHash: superAdminPassword, role: 'SUPER_ADMIN' },
    create: {
      email: 'jorgericardosalgado@gmail.com',
      name: 'Jorge Ricardo Salgado',
      passwordHash: superAdminPassword,
      role: 'SUPER_ADMIN',
    },
  });

  console.log('✅ Seed completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });