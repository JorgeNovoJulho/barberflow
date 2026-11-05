import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Modal, Input, Select, Badge } from '@barberflow/ui';
import { Plus, Edit, Trash2, Scissors, Droplet, Package } from 'lucide-react';

interface Service {
  id: string;
  barbershopId: string;
  name: string;
  description?: string;
  category: 'CORTE' | 'BARBA' | 'HIDRATACAO' | 'COMBO' | 'OUTRO';
  duration: number;
  price: number;
  imageUrl?: string;
  professionals: string[];
  createdAt: Date;
  updatedAt: Date;
}

const Services: React.FC = () => {
  const [services, setServices] = useState<Service[]>(mockServices);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Service | null>(null);
  const [formData, setFormData] = useState({
    name: '', description: '', category: 'CORTE' as Service['category'], duration: 30, price: 0, professionals: [] as string[],
  });

  const categories = [
    { value: 'CORTE', label: 'Corte', icon: Scissors },
    { value: 'BARBA', label: 'Barba', icon: Droplet },
    { value: 'HIDRATACAO', label: 'Hidratação', icon: Droplet },
    { value: 'COMBO', label: 'Combo', icon: Package },
    { value: 'OUTRO', label: 'Outro', icon: Package },
  ];

  const openModal = (s?: Service) => {
    if (s) {
      setEditing(s);
      setFormData({ name: s.name, description: s.description || '', category: s.category, duration: s.duration, price: s.price, professionals: s.professionals });
    } else {
      setEditing(null);
      setFormData({ name: '', description: '', category: 'CORTE', duration: 30, price: 0, professionals: [] });
    }
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editing) {
      setServices(services.map(s => s.id === editing.id ? { ...s, ...formData, updatedAt: new Date() } : s));
    } else {
      const newS: Service = { id: crypto.randomUUID(), barbershopId: '1', ...formData, createdAt: new Date(), updatedAt: new Date() };
      setServices([...services, newS]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Excluir este serviço?')) {
      setServices(services.filter(s => s.id !== id));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Serviços</h1>
          <p className="mt-2 text-gray-600">Cadastre e gerencie seus serviços</p>
        </div>
        <Button onClick={() => openModal()}><Plus className="h-4 w-4 mr-2" />Novo Serviço</Button>
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-4 font-medium text-gray-500">Serviço</th>
                  <th className="p-4 font-medium text-gray-500">Categoria</th>
                  <th className="p-4 font-medium text-gray-500">Duração</th>
                  <th className="p-4 font-medium text-gray-500">Preço</th>
                  <th className="p-4 font-medium text-gray-500">Profissionais</th>
                  <th className="p-4 font-medium text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {services.map(s => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      <p className="font-medium text-gray-900">{s.name}</p>
                      {s.description && <p className="text-sm text-gray-500">{s.description}</p>}
                    </td>
                    <td className="p-4">
                      <Badge variant="info">{categories.find(c => c.value === s.category)?.label || s.category}</Badge>
                    </td>
                    <td className="p-4 text-gray-900">{s.duration} min</td>
                    <td className="p-4 font-medium text-green-600">R$ {s.price.toFixed(2)}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {s.professionals.map(pId => {
                          const p = mockProfessionals.find(p => p.id === pId);
                          return p ? <Badge key={pId} variant="default" size="sm">{p.name}</Badge> : null;
                        })}
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openModal(s)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(s.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar Serviço' : 'Novo Serviço'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
          <Input label="Descrição" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
          <div className="grid grid-cols-2 gap-4">
            <Select label="Categoria" options={categories.map(c => ({ value: c.value, label: c.label }))} value={formData.category} onChange={e => setFormData({...formData, category: e.target.value as Service['category']})} />
            <Input label="Duração (min)" type="number" value={formData.duration} onChange={e => setFormData({...formData, duration: parseInt(e.target.value)})} required />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Preço (R$)" type="number" step="0.01" value={formData.price} onChange={e => setFormData({...formData, price: parseFloat(e.target.value)})} required />
            <Select label="Profissionais" options={mockProfessionals.map(p => ({ value: p.id, label: p.name }))} multiple value={formData.professionals.join(',')} onChange={e => setFormData({...formData, professionals: e.target.value.split(',').filter(Boolean)})} />
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

const mockProfessionals = [
  { id: '1', barbershopId: '1', name: 'João Silva' },
  { id: '2', barbershopId: '1', name: 'Maria Santos' },
  { id: '3', barbershopId: '1', name: 'Pedro Costa' },
];

const mockServices: Service[] = [
  { id: '1', barbershopId: '1', name: 'Corte', description: 'Corte de cabelo masculino', category: 'CORTE', duration: 30, price: 35, professionals: ['1', '2'], createdAt: new Date(), updatedAt: new Date() },
  { id: '2', barbershopId: '1', name: 'Barba', description: 'Aparar e modelar barba', category: 'BARBA', duration: 20, price: 25, professionals: ['1'], createdAt: new Date(), updatedAt: new Date() },
  { id: '3', barbershopId: '1', name: 'Corte + Barba', description: 'Combo corte e barba', category: 'COMBO', duration: 45, price: 55, professionals: ['1', '2'], createdAt: new Date(), updatedAt: new Date() },
  { id: '4', barbershopId: '1', name: 'Combo Completo', description: 'Corte, barba, hidratação e sobrancelha', category: 'COMBO', duration: 60, price: 80, professionals: ['1', '2', '3'], createdAt: new Date(), updatedAt: new Date() },
];

export default Services;