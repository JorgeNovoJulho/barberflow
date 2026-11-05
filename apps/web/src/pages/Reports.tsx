import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Badge, Select } from '@barberflow/ui';
import { BarChart3, TrendingUp, DollarSign, Users, Calendar, Award } from 'lucide-react';

const Reports: React.FC = () => {
  const [period, setPeriod] = useState<'day' | 'week' | 'month' | 'year'>('month');

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Relatórios & Analytics</h1>
          <p className="mt-2 text-gray-600">Acompanhe o desempenho da sua barbearia</p>
        </div>
        <Select value={period} onChange={e => setPeriod(e.target.value)} options={[
          { value: 'day', label: 'Hoje' },
          { value: 'week', label: 'Esta semana' },
          { value: 'month', label: 'Este mês' },
          { value: 'year', label: 'Este ano' },
        ]} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Receita Total" value="R$ 12.450,00" change="+12.5%" icon={DollarSign} color="green" />
        <StatCard title="Agendamentos" value="248" change="+8.2%" icon={Calendar} color="blue" />
        <StatCard title="Clientes Ativos" value="156" change="+5.1%" icon={Users} color="purple" />
        <StatCard title="Ticket Médio" value="R$ 50,20" change="-2.3%" icon={TrendingUp} color="orange" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader><CardTitle>Receita por Profissional</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {professionalRevenue.map(p => (
                <div key={p.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-sm font-medium">
                      {p.name.charAt(0)}
                    </div>
                    <span className="font-medium">{p.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">R$ {p.revenue.toFixed(2)}</p>
                    <p className="text-sm text-gray-500">{p.appointments} agendamentos</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Receita por Serviço</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {serviceRevenue.map(s => (
                <div key={s.name} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Badge variant="info">{s.category}</Badge>
                    <span className="font-medium">{s.name}</span>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-gray-900">R$ {s.revenue.toFixed(2)}</p>
                    <p className="text-sm text-gray-500">{s.count} vendas</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Ocupação da Agenda</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-4">
              {occupancyData.map(d => (
                <div key={d.day}>
                  <div className="flex justify-between text-sm mb-1">
                    <span>{d.day}</span>
                    <span className="font-medium">{d.rate}%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${d.rate}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Métricas de Clientes</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <MetricBox label="Novos clientes" value="12" icon={User} color="blue" />
              <MetricBox label="Clientes recorrentes" value="87%" icon={Users} color="green" />
              <MetricBox label="Taxa de churn" value="3.2%" icon={TrendingUp} color="red" />
              <MetricBox label="LTV médio" value="R$ 480" icon={DollarSign} color="purple" />
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6">
        <CardHeader><CardTitle>Exportar Relatórios</CardTitle></CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-4">
            <button className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition">Exportar PDF</button>
            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">Exportar CSV</button>
            <button className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">Agendar envio por email</button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

const StatCard: React.FC<{title: string, value: string, change: string, icon: React.ComponentType<{className?: string}>, color: string}> = ({title, value, change, icon: Icon, color}) => {
  const colors = {
    green: 'bg-green-50 border-green-100 text-green-700',
    blue: 'bg-blue-50 border-blue-100 text-blue-700',
    purple: 'bg-purple-50 border-purple-100 text-purple-700',
    orange: 'bg-orange-50 border-orange-100 text-orange-700',
    red: 'bg-red-50 border-red-100 text-red-700',
  };
  const isPositive = change.startsWith('+');
  return (
    <Card className={`border ${colors[color as keyof typeof colors] || colors.green}`}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-gray-500">{title}</p>
            <p className="mt-1 text-2xl font-bold text-gray-900">{value}</p>
          </div>
          <Icon className={`h-8 w-8 ${colors[color as keyof typeof colors] || colors.green}`} />
        </div>
        <p className={`mt-3 text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>{change}</p>
      </CardContent>
    </Card>
  );
};

const MetricBox: React.FC<{label: string, value: string, icon: React.ComponentType<{className?: string}>, color: string}> = ({label, value, icon: Icon, color}) => {
  const colors = {
    green: 'bg-green-50 text-green-600',
    blue: 'bg-blue-50 text-blue-600',
    purple: 'bg-purple-50 text-purple-600',
    orange: 'bg-orange-50 text-orange-600',
    red: 'bg-red-50 text-red-600',
  };
  return (
    <div className={`p-4 rounded-xl ${colors[color as keyof typeof colors] || colors.blue}`}>
      <Icon className={`h-6 w-6 mb-2 ${colors[color as keyof typeof colors] || colors.blue}`} />
      <p className="text-2xl font-bold text-gray-900">{value}</p>
      <p className="text-sm text-gray-500">{label}</p>
    </div>
  );
};

const professionalRevenue = [
  { name: 'João Silva', revenue: 4520, appointments: 68 },
  { name: 'Maria Santos', revenue: 3890, appointments: 52 },
  { name: 'Pedro Costa', revenue: 2840, appointments: 41 },
];

const serviceRevenue = [
  { name: 'Corte + Barba', category: 'COMBO', revenue: 3850, count: 70 },
  { name: 'Corte', category: 'CORTE', revenue: 2800, count: 80 },
  { name: 'Combo Completo', category: 'COMBO', revenue: 2400, count: 30 },
  { name: 'Barba', category: 'BARBA', revenue: 1250, count: 50 },
];

const occupancyData = [
  { day: 'Segunda', rate: 85 },
  { day: 'Terça', rate: 72 },
  { day: 'Quarta', rate: 78 },
  { day: 'Quinta', rate: 80 },
  { day: 'Sexta', rate: 92 },
  { day: 'Sábado', rate: 95 },
  { day: 'Domingo', rate: 45 },
];

export default Reports;