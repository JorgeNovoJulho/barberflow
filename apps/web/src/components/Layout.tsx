import React from 'react';
import { Link, Outlet } from 'react-router-dom';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';

export const PublicLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-gray-200 sticky top-0 z-10 bg-white/95 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <Link to="/" className="text-2xl font-bold text-green-700">BarberFlow</Link>
            <nav className="flex items-center gap-8">
              <Link to="#features" className="text-gray-600 hover:text-gray-900">Funcionalidades</Link>
              <Link to="#pricing" className="text-gray-600 hover:text-gray-900">Preços</Link>
              <Link to="#faq" className="text-gray-600 hover:text-gray-900">FAQ</Link>
              <Link to="/login" className="text-gray-600 hover:text-gray-900">Entrar</Link>
              <Link to="/register" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition">
                Começar teste grátis
              </Link>
            </nav>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="bg-gray-900 text-gray-400 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <span className="text-2xl font-bold text-white">BarberFlow</span>
              <p className="mt-4 text-sm">Gestão inteligente para barbearias.</p>
            </div>
            <div>
              <h4 className="font-medium text-white mb-4">Produto</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#features" className="hover:text-white transition">Funcionalidades</a></li>
                <li><a href="#pricing" className="hover:text-white transition">Preços</a></li>
                <li><a href="#" className="hover:text-white transition">Marketplace</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-4">Suporte</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Central de ajuda</a></li>
                <li><a href="#" className="hover:text-white transition">Contato</a></li>
                <li><a href="#" className="hover:text-white transition">Status</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-medium text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white transition">Termos de uso</a></li>
                <li><a href="#" className="hover:text-white transition">Privacidade</a></li>
              </ul>
            </div>
          </div>
          <div className="mt-12 pt-8 border-t border-gray-800 flex flex-col md:flex-row items-center justify-between gap-4">
            <p className="text-sm">Feito em São Paulo, SP</p>
            <p className="text-sm">© 2026 BarberFlow. Todos os direitos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

export const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const { user, barbershop, logout } = useAuthStore();
  const { currentTheme } = useThemeStore();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Agenda', href: '/dashboard/agenda' },
    { name: 'Profissionais', href: '/dashboard/profissionais' },
    { name: 'Serviços', href: '/dashboard/servicos' },
    { name: 'Clientes', href: '/dashboard/clientes' },
    { name: 'Relatórios', href: '/dashboard/relatorios' },
    { name: 'Configurações', href: '/dashboard/configuracoes' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-8">
              <Link to="/dashboard" className="text-2xl font-bold text-green-700">BarberFlow</Link>
              <nav className="hidden md:flex gap-6">
                {navigation.map((item) => (
                  <Link
                    key={item.name}
                    to={item.href}
                    className="text-gray-700 hover:text-green-600 font-medium transition"
                  >
                    {item.name}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600 hidden sm:block">
                {barbershop?.name}
              </span>
              <button
                onClick={logout}
                className="text-gray-500 hover:text-gray-700 text-sm"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </div>
  );
};