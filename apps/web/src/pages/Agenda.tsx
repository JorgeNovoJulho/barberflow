import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Modal, Input, Select, Badge } from '@barberflow/ui';
import { Plus, Calendar, ChevronLeft, ChevronRight, Trash2, Edit } from 'lucide-react';

const Agenda: React.FC = () => {
  const [viewMode, setViewMode] = useState<'day' | 'week' | 'month'>('week');
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showModal, setShowModal] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [professionals, setProfessionals] = useState<Professional[]>(mockProfessionals);
  const [services, setServices] = useState<Service[]>(mockServices);
  const [clients, setClients] = useState<Client[]>(mockClients);
  const [appointments, setAppointments] = useState<Appointment[]>(mockAppointments);

  const [formData, setFormData] = useState({
    professionalId: '',
    serviceId: '',
    clientId: '',
    date: '',
    time: '',
    duration: 30,
    notes: '',
  });

  const filteredAppointments = appointments.filter(apt => {
    const aptDate = new Date(apt.startTime);
    if (viewMode === 'day') {
      return aptDate.toDateString() === selectedDate.toDateString();
    } else if (viewMode === 'week') {
      const startOfWeek = new Date(selectedDate);
      startOfWeek.setDate(selectedDate.getDate() - selectedDate.getDay());
      const endOfWeek = new Date(startOfWeek);
      endOfWeek.setDate(startOfWeek.getDate() + 6);
      return aptDate >= startOfWeek && aptDate <= endOfWeek;
    }
    return aptDate.getMonth() === selectedDate.getMonth() && aptDate.getFullYear() === selectedDate.getFullYear();
  });

  const handleDateChange = (days: number) => {
    const newDate = new Date(selectedDate);
    if (viewMode === 'day') newDate.setDate(newDate.getDate() + days);
    else if (viewMode === 'week') newDate.setDate(newDate.getDate() + days * 7);
    else newDate.setMonth(newDate.getMonth() + days);
    setSelectedDate(newDate);
  };

  const openModal = (apt?: Appointment) => {
    if (apt) {
      setEditingAppointment(apt);
      setFormData({
        professionalId: apt.professionalId,
        serviceId: apt.serviceId,
        clientId: apt.clientId,
        date: new Date(apt.startTime).toISOString().split('T')[0],
        time: new Date(apt.startTime).toTimeString().slice(0, 5),
        duration: Math.round((new Date(apt.endTime).getTime() - new Date(apt.startTime).getTime()) / 60000),
        notes: apt.notes || '',
      });
    } else {
      setEditingAppointment(null);
      setFormData({ professionalId: '', serviceId: '', clientId: '', date: '', time: '', duration: 30, notes: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const startTime = new Date(`${formData.date}T${formData.time}`);
    const endTime = new Date(startTime.getTime() + formData.duration * 60000);

    const professional = professionals.find(p => p.id === formData.professionalId);
    const service = services.find(s => s.id === formData.serviceId);
    const client = clients.find(c => c.id === formData.clientId);

    if (editingAppointment) {
      setAppointments(appointments.map(a =>
        a.id === editingAppointment.id
          ? { ...a, professionalId: formData.professionalId, serviceId: formData.serviceId, clientId: formData.clientId, startTime, endTime, notes: formData.notes, professional: professional?.name, service: service?.name, client: client?.name }
          : a
      ));
    } else {
      const newAppointment: Appointment = {
        id: crypto.randomUUID(),
        barbershopId: '1',
        professionalId: formData.professionalId,
        serviceId: formData.serviceId,
        clientId: formData.clientId,
        startTime,
        endTime,
        status: 'CONFIRMED',
        notes: formData.notes,
        price: service?.price || 0,
        professional: professional?.name || '',
        service: service?.name || '',
        client: client?.name || '',
      };
      setAppointments([...appointments, newAppointment]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Excluir este agendamento?')) {
      setAppointments(appointments.filter(a => a.id !== id));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Agenda Inteligente</h1>
          <p className="mt-2 text-gray-600">Gerencie seus horários com drag & drop</p>
        </div>
        <Button onClick={() => openModal()}><Plus className="h-4 w-4 mr-2" />Novo Agendamento</Button>
      </div>

      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => handleDateChange(-1)}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="px-4 text-lg font-medium text-gray-900">
            {viewMode === 'day' && selectedDate.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
            {viewMode === 'week' && `Semana de ${new Date(selectedDate.setDate(selectedDate.getDate() - selectedDate.getDay())).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' })} - ${new Date(selectedDate.setDate(selectedDate.getDate() + 6)).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short', year: 'numeric' })}`}
            {viewMode === 'month' && selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}
          </span>
          <Button variant="outline" size="sm" onClick={() => handleDateChange(1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="flex gap-2">
          {(['day', 'week', 'month'] as const).map(mode => (
            <Button
              key={mode}
              variant={viewMode === mode ? 'primary' : 'outline'}
              size="sm"
              onClick={() => setViewMode(mode)}
            >
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-3">
          <Card>
            <CardHeader><CardTitle>Profissionais</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {professionals.map(p => (
                  <div key={p.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50">
                    <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center text-green-600 text-sm font-medium">
                      {p.name.charAt(0)}
                    </div>
                    <span className="text-sm font-medium">{p.name}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
        <div className="lg:col-span-9">
          <Card>
            <CardContent className="p-0">
              {viewMode === 'day' && <DayView appointments={filteredAppointments} professionals={professionals} onEdit={openModal} onDelete={handleDelete} />}
              {viewMode === 'week' && <WeekView appointments={filteredAppointments} professionals={professionals} selectedDate={selectedDate} onEdit={openModal} onDelete={handleDelete} />}
              {viewMode === 'month' && <MonthView appointments={filteredAppointments} selectedDate={selectedDate} onEdit={openModal} />}
            </CardContent>
          </Card>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editingAppointment ? 'Editar Agendamento' : 'Novo Agendamento'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Profissional" options={professionals.map(p => ({ value: p.id, label: p.name }))} value={formData.professionalId} onChange={(e) => setFormData({...formData, professionalId: e.target.value})} placeholder="Selecione" required />
            <Select label="Serviço" options={services.map(s => ({ value: s.id, label: `${s.name} - R$ ${s.price.toFixed(2)}` }))} value={formData.serviceId} onChange={(e) => setFormData({...formData, serviceId: e.target.value})} placeholder="Selecione" required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Cliente" options={clients.map(c => ({ value: c.id, label: c.name }))} value={formData.clientId} onChange={(e) => setFormData({...formData, clientId: e.target.value})} placeholder="Selecione" required />
            <Input label="Duração (min)" type="number" value={formData.duration} onChange={(e) => setFormData({...formData, duration: parseInt(e.target.value)})} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Data" type="date" value={formData.date} onChange={(e) => setFormData({...formData, date: e.target.value})} required />
            <Input label="Horário" type="time" value={formData.time} onChange={(e) => setFormData({...formData, time: e.target.value})} required />
          </div>
          <Input label="Observações" value={formData.notes} onChange={(e) => setFormData({...formData, notes: e.target.value})} />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button type="submit">{editingAppointment ? 'Salvar' : 'Criar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const DayView: React.FC<{ appointments: Appointment[]; professionals: Professional[]; onEdit: (apt: Appointment) => void; onDelete: (id: string) => void }> = ({ appointments, professionals, onEdit, onDelete }) => {
  const hours = Array.from({ length: 14 }, (_, i) => i + 8);

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-3 text-left text-sm font-medium text-gray-500 w-24">Horário</th>
            {professionals.map(p => (
              <th key={p.id} className="p-3 text-left text-sm font-medium text-gray-500">{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {hours.map(hour => (
            <tr key={hour} className="border-t border-gray-100">
              <td className="p-3 text-sm text-gray-500 w-24">{hour.toString().padStart(2, '0')}:00</td>
              {professionals.map(prof => {
                const apt = appointments.find(a =>
                  a.professionalId === prof.id &&
                  new Date(a.startTime).getHours() === hour
                );
                return (
                  <td key={prof.id} className="p-2 min-h-[80px] relative">
                    {apt && (
                      <div
                        className="absolute inset-0 bg-green-500 text-white p-2 rounded cursor-pointer hover:bg-green-600"
                        onClick={() => onEdit(apt)}
                        onContextMenu={(e) => { e.preventDefault(); onDelete(apt.id); }}
                      >
                        <p className="text-xs font-medium truncate">{apt.client}</p>
                        <p className="text-xs truncate">{apt.service}</p>
                      </div>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const WeekView: React.FC<{ appointments: Appointment[]; professionals: Professional[]; selectedDate: Date; onEdit: (apt: Appointment) => void; onDelete: (id: string) => void }> = ({ appointments, professionals, selectedDate, onEdit, onDelete }) => {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - d.getDay() + i);
    return d;
  });

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px]">
        <thead>
          <tr className="bg-gray-50">
            <th className="p-3 text-left text-sm font-medium text-gray-500 w-24">Horário</th>
            {days.map(day => (
              <th key={day.toISOString()} className="p-3 text-center text-sm font-medium text-gray-500">
                <div>{day.toLocaleDateString('pt-BR', { weekday: 'short' })}</div>
                <div className="font-medium">{day.getDate()}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 14 }, (_, i) => i + 8).map(hour => (
            <tr key={hour} className="border-t border-gray-100">
              <td className="p-3 text-sm text-gray-500 w-24">{hour.toString().padStart(2, '0')}:00</td>
              {days.map(day => (
                <td key={day.toISOString()} className="p-1 min-h-[60px] relative">
                  {appointments
                    .filter(a => new Date(a.startTime).getHours() === hour && new Date(a.startTime).toDateString() === day.toDateString())
                    .map(apt => (
                      <div
                        key={apt.id}
                        className="absolute w-full bg-green-500 text-white p-1 rounded text-xs cursor-pointer hover:bg-green-600"
                        onClick={() => onEdit(apt)}
                        onContextMenu={(e) => { e.preventDefault(); onDelete(apt.id); }}
                      >
                        <span className="font-medium">{apt.client}</span>
                        <span className="ml-1 opacity-80">{apt.service}</span>
                      </div>
                    ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

const MonthView: React.FC<{ appointments: Appointment[]; selectedDate: Date; onEdit: (apt: Appointment) => void }> = ({ appointments, selectedDate, onEdit }) => {
  const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
  const lastDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0);
  const startDay = firstDay.getDay();
  const daysInMonth = lastDay.getDate();

  const weeks = [];
  let day = 1;
  for (let i = 0; i < 6; i++) {
    const week = [];
    for (let j = 0; j < 7; j++) {
      if (i === 0 && j < startDay) {
        week.push(null);
      } else if (day > daysInMonth) {
        week.push(null);
      } else {
        const date = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), day);
        week.push(date);
        day++;
      }
    }
    weeks.push(week);
    if (day > daysInMonth) break;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="bg-gray-50">
            {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
              <th key={d} className="p-3 text-center text-sm font-medium text-gray-500">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {weeks.map((week, wi) => (
            <tr key={wi} className="border-t border-gray-100">
              {week.map((day, di) => (
                <td key={di} className="p-1 min-h-[100px] relative border-r border-gray-100">
                  {day && (
                    <>
                      <div className={`text-sm font-medium ${day.toDateString() === new Date().toDateString() ? 'text-green-600 bg-green-50 rounded' : 'text-gray-900'} p-1`}>
                        {day.getDate()}
                      </div>
                      <div className="mt-1 space-y-1">
                        {appointments
                          .filter(a => new Date(a.startTime).toDateString() === day.toDateString())
                          .slice(0, 3)
                          .map(apt => (
                            <div
                              key={apt.id}
                              className="bg-green-100 text-green-700 p-1 rounded text-xs cursor-pointer hover:bg-green-200 truncate"
                              onClick={() => onEdit(apt)}
                            >
                              {apt.client} - {apt.service}
                            </div>
                          ))}
                        {appointments.filter(a => new Date(a.startTime).toDateString() === day.toDateString()).length > 3 && (
                          <div className="text-xs text-gray-500 text-center">+{appointments.filter(a => new Date(a.startTime).toDateString() === day.toDateString()).length - 3} mais</div>
                        )}
                      </div>
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface Appointment {
  id: string;
  barbershopId: string;
  professionalId: string;
  serviceId: string;
  clientId: string;
  startTime: Date;
  endTime: Date;
  status: string;
  notes?: string;
  price: number;
  professional: string;
  service: string;
  client: string;
}

interface Professional {
  id: string;
  barbershopId: string;
  name: string;
}

interface Service {
  id: string;
  barbershopId: string;
  name: string;
  price: number;
}

interface Client {
  id: string;
  barbershopId: string;
  name: string;
}

const mockProfessionals: Professional[] = [
  { id: '1', barbershopId: '1', name: 'João Silva' },
  { id: '2', barbershopId: '1', name: 'Maria Santos' },
  { id: '3', barbershopId: '1', name: 'Pedro Costa' },
];

const mockServices: Service[] = [
  { id: '1', barbershopId: '1', name: 'Corte', price: 35 },
  { id: '2', barbershopId: '1', name: 'Barba', price: 25 },
  { id: '3', barbershopId: '1', name: 'Corte + Barba', price: 55 },
  { id: '4', barbershopId: '1', name: 'Combo Completo', price: 80 },
];

const mockClients: Client[] = [
  { id: '1', barbershopId: '1', name: 'Carlos Silva' },
  { id: '2', barbershopId: '1', name: 'Pedro Santos' },
  { id: '3', barbershopId: '1', name: 'Lucas Lima' },
  { id: '4', barbershopId: '1', name: 'Rafael Costa' },
];

const mockAppointments: Appointment[] = [
  { id: '1', barbershopId: '1', professionalId: '1', serviceId: '3', clientId: '1', startTime: new Date('2026-11-05T09:00:00'), endTime: new Date('2026-11-05T09:45:00'), status: 'CONFIRMED', notes: '', price: 55, professional: 'João Silva', service: 'Corte + Barba', client: 'Carlos Silva' },
  { id: '2', barbershopId: '1', professionalId: '2', serviceId: '1', clientId: '2', startTime: new Date('2026-11-05T10:00:00'), endTime: new Date('2026-11-05T10:30:00'), status: 'CONFIRMED', notes: '', price: 35, professional: 'Maria Santos', service: 'Corte', client: 'Pedro Santos' },
  { id: '3', barbershopId: '1', professionalId: '1', serviceId: '2', clientId: '3', startTime: new Date('2026-11-05T11:00:00'), endTime: new Date('2026-11-05T11:20:00'), status: 'PENDING', notes: '', price: 25, professional: 'João Silva', service: 'Barba', client: 'Lucas Lima' },
];

export default Agenda;