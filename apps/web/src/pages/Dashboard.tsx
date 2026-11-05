import React from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@barberflow/ui';
import { useAuthStore } from '@/stores/auth';

const Dashboard: React.FC = () => {
  const { barbershop } = useAuthStore();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <p className="mt-2 text-gray-600">Visão geral da sua barbearia hoje</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Receita hoje" value="R$ 1.240,00" icon="💰" color="green" />
        <StatCard title="Agendamentos" value="14" icon="📅" color="blue" />
        <StatCard title="Clientes ativos" value="87" icon="👥" color="purple" />
        <StatCard title="Taxa ocupação" value="78%" icon="📊" color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Próximos agendamentos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {appointments.map((apt, i) => (
                <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-medium">
                      {apt.time.split(':')[0]}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{apt.service}</p>
                      <p className="text-sm text-gray-500">{apt.professional} • {apt.client}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-1 text-xs rounded-full ${
                    apt.status === 'Confirmado' ? 'bg-green-100 text-green-700' :
                    apt.status === 'Pendente' ? 'bg-yellow-100 text-yellow-700' :
                    'bg-gray-100 text-gray-700'
                  }`}>{apt.status}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Ações rápidas</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-3">
              <Link to="/dashboard/agenda/novo" className="p-4 bg-green-50 border border-green-100 rounded-xl hover:bg-green-100 transition text-center">
                <p className="text-2xl">➕</p>
                <p className="font-medium text-green-700 mt-1">Novo agendamento</p>
              </Link>
              <Link to="/dashboard/clientes/novo" className="p-4 bg-blue-50 border border-blue-100 rounded-xl hover:bg-blue-100 transition text-center">
                <p className="text-2xl">👤</p>
                <p className="font-medium text-blue-700 mt-1">Novo cliente</p>
              </Link>
              <Link to="/dashboard/profissionais/novo" className="p-4 bg-purple-50 border border-purple-100 rounded-xl hover:bg-purple-100 transition text-center">
                <p className="text-2xl">👨‍💼</p>
                <p className="font-medium text-purple-700 mt-1">Novo profissional</p>
              </Link>
              <Link to="/dashboard/servicos/novo" className="p-4 bg-orange-50 border border-orange-100 rounded-xl hover:bg-orange-100 transition text-center">
                <p className="text-2xl">✂️</p>
                <p className="font-medium text-orange-700 mt-1">Novo serviço</p>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

const StatCard: React.FC<{title: string, value: string, icon: string, color: string}> = ({title, value, icon, color}) => {
  const colors = {
    green: 'bg-green-50 border-green-100 text-green-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    purple: 'bg-purple-50 border-purple-100 text-purple-700',
    orange: 'bg-orange-50 border-orange-100 text-orange-700',
  };
  return (
    <Card className={`border ${colors[color as keyof typeof colors] || colors.green}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          </div>
          <span className="text-3xl">{icon}</span>
        </div>
      </CardContent>
    </Card>
  );
};

const appointments = [
  { time: '09:00', service: 'Corte + Barba', professional: 'João', client: 'Carlos Silva', status: 'Confirmado' },
  { time: '10:00', service: 'Corte', professional: 'Maria', client: 'Pedro Santos', status: 'Confirmado' },
  { time: '11:00', service: 'Barba', professional: 'João', client: 'Lucas Lima', status: 'Pendente' },
  { time: '14:00', service: 'Combo Completo', professional: 'Maria', client: 'Rafael Costa', status: 'Confirmado' },
  { time: '15:30', service: 'Corte', professional: 'João', client: 'André Oliveira', status: 'Confirmado' },
];

export default Dashboard;