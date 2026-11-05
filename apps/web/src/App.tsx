import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { PublicLayout, AdminLayout } from '@/components/Layout';
import Landing from '@/pages/Landing';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import Dashboard from '@/pages/Dashboard';
import Agenda from '@/pages/Agenda';
import Professionals from '@/pages/Professionals';
import Services from '@/pages/Services';
import Clients from '@/pages/Clients';
import Reports from '@/pages/Reports';
import Settings from '@/pages/Settings';
import { useAuthStore } from '@/stores/auth';
import { useThemeStore } from '@/stores/theme';
import { useEffect } from 'react';

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { token } = useAuthStore();
  return token ? <>{children}</> : <Navigate to="/login" replace />;
}

function App() {
  const initializeTheme = useThemeStore((s) => s.initialize);

  useEffect(() => {
    initializeTheme();
  }, [initializeTheme]);

  return (
    <BrowserRouter>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route path="/" element={<Landing />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
        </Route>
        <Route element={<PrivateRoute><AdminLayout /></PrivateRoute>}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/dashboard/agenda" element={<Agenda />} />
          <Route path="/dashboard/profissionais" element={<Professionals />} />
          <Route path="/dashboard/servicos" element={<Services />} />
          <Route path="/dashboard/clientes" element={<Clients />} />
          <Route path="/dashboard/relatorios" element={<Reports />} />
          <Route path="/dashboard/configuracoes" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;