import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Modal, Input, Badge } from '@barberflow/ui';
import { Plus, Edit, Trash2, Search, User, Calendar, Award, Tag } from 'lucide-react';

interface Client {
  id: string;
  barbershopId: string;
  userId?: string;
  name: string;
  email?: string;
  phone?: string;
  birthday?: Date;
  notes?: string;
  tags: string[];
  loyaltyStamps: number;
  lastVisit?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const Clients: React.FC = () => {
  const [clients, setClients] = useState<Client[]>(mockClients);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [formData, setFormData] = useState({
    name: '', email: '', phone: '', birthday: '', notes: '', tags: '' as string,
  });

  const filteredClients = clients.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    c.email?.toLowerCase().includes(search.toLowerCase()) ||
    c.phone?.includes(search)
  );

  const openModal = (c?: Client) => {
    if (c) {
      setEditing(c);
      setFormData({ name: c.name, email: c.email || '', phone: c.phone || '', birthday: c.birthday ? new Date(c.birthday).toISOString().split('T')[0] : '', notes: c.notes || '', tags: c.tags.join(', ') });
    } else {
      setEditing(null);
      setFormData({ name: '', email: '', phone: '', birthday: '', notes: '', tags: '' });
    }
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const tags = formData.tags.split(',').map(t => t.trim()).filter(Boolean);
    if (editing) {
      setClients(clients.map(c => c.id === editing.id ? { ...c, ...formData, tags, birthday: formData.birthday ? new Date(formData.birthday) : undefined, updatedAt: new Date() } : c));
    } else {
      const newC: Client = { id: crypto.randomUUID(), barbershopId: '1', ...formData, tags, birthday: formData.birthday ? new Date(formData.birthday) : undefined, loyaltyStamps: 0, createdAt: new Date(), updatedAt: new Date() };
      setClients([...clients, newC]);
    }
    setShowModal(false);
  };

  const handleDelete = (id: string) => {
    if (confirm('Excluir este cliente?')) {
      setClients(clients.filter(c => c.id !== id));
    }
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Clientes</h1>
          <p className="mt-2 text-gray-600">Gerencie sua base de clientes</p>
        </div>
        <Button onClick={() => openModal()}><Plus className="h-4 w-4 mr-2" />Novo Cliente</Button>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="relative max-w-md mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 h-5 w-5" />
            <input
              type="text"
              placeholder="Buscar por nome, email ou telefone..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 outline-none"
            />
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="p-4 font-medium text-gray-500">Cliente</th>
                  <th className="p-4 font-medium text-gray-500">Contato</th>
                  <th className="p-4 font-medium text-gray-500">Aniversário</th>
                  <th className="p-4 font-medium text-gray-500">Fidelidade</th>
                  <th className="p-4 font-medium text-gray-500">Tags</th>
                  <th className="p-4 font-medium text-gray-500">Última visita</th>
                  <th className="p-4 font-medium text-gray-500">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredClients.map(c => (
                  <tr key={c.id} className="hover:bg-gray-50">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-600 font-medium">
                          {c.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{c.name}</p>
                          <p className="text-sm text-gray-500">{c.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4">
                      <p className="text-gray-900">{c.email || '-'}</p>
                      <p className="text-sm text-gray-500">{c.phone || '-'}</p>
                    </td>
                    <td className="p-4">
                      {c.birthday ? (
                        <>
                          <Calendar className="h-4 w-4 text-gray-400 inline mr-1" />
                          {new Date(c.birthday).toLocaleDateString('pt-BR')}
                        </>
                      ) : '-'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-yellow-500" />
                        <span className="font-medium">{c.loyaltyStamps} carimbos</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {c.tags.map(tag => <Badge key={tag} variant="default" size="sm">{tag}</Badge>)}
                      </div>
                    </td>
                    <td className="p-4 text-gray-500">
                      {c.lastVisit ? new Date(c.lastVisit).toLocaleDateString('pt-BR') : 'Nunca'}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <Button variant="ghost" size="sm" onClick={() => openModal(c)}><Edit className="h-4 w-4" /></Button>
                        <Button variant="danger" size="sm" onClick={() => handleDelete(c.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title={editing ? 'Editar Cliente' : 'Novo Cliente'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Nome" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
            <Input label="Telefone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Aniversário" type="date" value={formData.birthday} onChange={e => setFormData({...formData, birthday: e.target.value})} />
            <Input label="Tags (separadas por vírgula)" value={formData.tags} onChange={e => setFormData({...formData, tags: e.target.value})} placeholder="VIP, frequente, indicação" />
          </div>
          <Input label="Observações" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={() => setShowModal(false)}>Cancelar</Button>
            <Button type="submit">{editing ? 'Salvar' : 'Criar'}</Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};

const mockClients: Client[] = [
  { id: '1', barbershopId: '1', name: 'Carlos Silva', email: 'carlos@email.com', phone: '(11) 99999-1111', birthday: new Date('1990-05-15'), notes: 'Prefere corte degradê', tags: ['VIP', 'Frequente'], loyaltyStamps: 8, lastVisit: new Date('2026-11-01'), createdAt: new Date(), updatedAt: new Date() },
  { id: '2', barbershopId: '1', name: 'Pedro Santos', email: 'pedro@email.com', phone: '(11) 99999-2222', birthday: new Date('1985-12-20'), notes: '', tags: ['Indicação'], loyaltyStamps: 3, lastVisit: new Date('2026-10-28'), createdAt: new Date(), updatedAt: new Date() },
  { id: '3', barbershopId: '1', name: 'Lucas Lima', email: 'lucas@email.com', phone: '(11) 99999-3333', birthday: new Date('1995-03-10'), notes: 'Barba cheia', tags: [], loyaltyStamps: 1, lastVisit: new Date('2026-11-03'), createdAt: new Date(), updatedAt: new Date() },
  { id: '4', barbershopId: '1', name: 'Rafael Costa', email: 'rafael@email.com', phone: '(11) 99999-4444', birthday: new Date('1988-08-25'), notes: '', tags: ['VIP'], loyaltyStamps: 10, lastVisit: new Date('2026-10-30'), createdAt: new Date(), updatedAt: new Date() },
];

export default Clients;