import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Modal, Input, Select, Badge } from '@barberflow/ui';
import { Plus, Edit, Trash2, Clock, User, DollarSign } from 'lucide-react';

interface Professional {
  id: string;
  barbershopId: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  avatarUrl?: string;
  commissionType: 'PERCENTAGE' | 'FIXED';
  commissionValue: number;
  canViewAllAgenda: boolean;
  workingHours?: any;
  services: string[];
  createdAt: Date;
  updatedAt: Date;
}

const Professionals: React.FC = () => {
  const [professionals, setProfessionals] = useState<Professional[]>(mockProfessionals);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Professional | null>(null);
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', commissionType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
    commissionValue: 0, canViewAllAgenda: false, services: [] as string[],
  });

  const openModal = (p?: Professional) => {
    if (p) {
      setEditing(p);
      setFormData({ name: p.name, email: p.email || '', phone: p.phone || '', commissionType: p.commissionType, commissionValue: p.commissionValue, canViewAllAgenda: p.canViewAllAgenda, services: p.services });
    } else {
      setEditing(null);
      setFormData({ name: '', email: '', phone: '', commissionType: 'PERCENTAGE', commissionValue: 0, canViewAllAgenda: false, services: [] });
    }
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      setProfessionals(professionals.map(p => p.id === editing.id ? { ...p, ...formData, updatedAt: new Date() } : p));
    } else {
      const newProf: Professional = { id: crypto.randomUUID(), barbershopId: '1', ...formData, createdAt: new Date(), updatedAt: new Date() };
      setProfessionals([...professionals, newProf]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Excluir este profissional?')) {
      setProfessionals(professionals.filter(p => p.id !== id));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Profissionais</h1>
          <p className="mt-2 text-gray-600">Gerencie sua equipe de barbeiros</p>
        </div>
        <Button onClick={() => openModal()}><Plus className="h-4 w-4 mr-2" />Novo Profissional</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-4 font-medium text-gray-500">Profissional</th>
                  <th className="p-4 font-medium text-gray-500">Contato</th>
                  <th className="p-4 font-medium text-gray-500">Comissão</th>
                  <th className="p-4 font-medium text-gray-500">Permissões</th>
                  <th className="p-4 font-medium text-gray-500">Serviços</th>
                  <th className="p-4 font-medium text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {professionals.map(p => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-medium">
                          {p.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{p.name}</p>
                          <p className="text-sm text-gray-500">{p.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-gray-900">{p.email || '-'}</p>
                      <p className="text-sm text-gray-500">{p.phone || '-'}</p>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <DollarSign className="h-4 w-4 text-gray-400" />
                        <span className="font-medium">
                          {p.commissionType === 'PERCENTAGE' ? `${p.commissionValue}%` : `R$ ${p.commissionValue.toFixed(2)}`}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">
                      <Badge variant={p.canViewAllAgenda ? 'success' : 'default'}>
                        {p.canViewAllAgenda ? 'Ver toda agenda' : 'Apenas sua agenda'}
                      </Badge>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {p.services.map(sId => {
                          const s = mockServices.find(s => s.id === sId);
                          return s ? <Badge key={sId} variant="info" size="sm">{s.name}</Badge> : null;
                        })}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openModal(p)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" variant="danger" onClick={() => handleDelete(p.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar Profissional' : 'Novo Profissional'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Nome" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
            <Input label="Email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
          </div>
          <Input label="Telefone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />

          <div className="grid grid-cols-2 gap-4">
            <Select label="Tipo de Comissão" options={[{value: 'PERCENTAGE', label: 'Porcentagem (%)'}, {value: 'FIXED', label: 'Valor Fixo (R$)'}]} value={formData.commissionType} onChange={e => setFormData({...formData, commissionType: e.target.value as 'PERCENTAGE' | 'FIXED'})} />
            <Input label="Valor" type="number" step="0.01" value={formData.commissionValue} onChange={e => setFormData({...formData, commissionValue: parseFloat(e.target.value)})} />
          </div>

          <Select label="Serviços" options={mockServices.map(s => ({ value: s.id, label: s.name }))} multiple value={formData.services.join(',')} onChange={e => setFormData({...formData, services: e.target.value.split(',').filter(Boolean)})} />

          <div className="flex items-center gap-2">
            <input type="checkbox" id="viewAll" checked={formData.canViewAllAgenda} onChange={e => setFormData({...formData, canViewAllAgenda: e.target.checked})} className="w-4 h-4 text-green-600 rounded" />
            <label htmlFor="viewAll" className="text-sm text-gray-700">Pode ver agenda de todos os profissionais</label>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button type="submit">{editing ? 'Salvar' : 'Criar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const mockServices = [
  { id: '1', barbershopId: '1', name: 'Corte', price: 35, category: 'CORTE' as const, duration: 30, professionals: ['1', '2'] },
  { id: '2', barbershopId: '1', name: 'Barba', price: 25, category: 'BARBA' as const, duration: 20, professionals: ['1'] },
  { id: '3', barbershopId: '1', name: 'Corte + Barba', price: 55, category: 'COMBO' as const, duration: 45, professionals: ['1', '2'] },
  { id: '4', barbershopId: '1', name: 'Combo Completo', price: 80, category: 'COMBO' as const, duration: 60, professionals: ['1', '2', '3'] },
];

const mockProfessionals: Professional[] = [
  { id: '1', barbershopId: '1', name: 'João Silva', email: 'joao@barbearia.com', phone: '(11) 99999-1111', commissionType: 'PERCENTAGE', commissionValue: 50, canViewAllAgenda: true, services: ['1', '3'], createdAt: new Date(), updatedAt: new Date() },
  { id: '2', barbershopId: '1', name: 'Maria Santos', email: 'maria@barbearia.com', phone: '(11) 99999-2222', commissionType: 'FIXED', commissionValue: 15, canViewAllAgenda: false, services: ['1', '2'], createdAt: new Date(), updatedAt: new Date() },
  { id: '3', barbershopId: '1', name: 'Pedro Costa', email: 'pedro@barbearia.com', phone: '(11) 99999-3333', commissionType: 'PERCENTAGE', commissionValue: 40, canViewAllAgenda: false, services: ['4'], createdAt: new Date(), updatedAt: new Date() },
];

export default Professionals;