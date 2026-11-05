import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, Button, Input, Select, Badge } from '@barberflow/ui';
import { useThemeStore } from '@/stores/theme';
import { themes, type ThemeName, themeList } from '@/lib/themes';
import { Save, Palette, Instagram, Facebook, Tiktok, Youtube, Globe, MessageSquare, Clock, MapPin, Mail, Phone, Bell, Shield, CreditCard, Download, Trash2 } from 'lucide-react';

const Settings: React.FC = () => {
  const { currentTheme, setTheme } = useThemeStore();
  const [activeTab, setActiveTab] = useState<'geral' | 'tema' | 'redes' | 'horarios' | 'notificacoes' | 'assinatura' | 'backup'>('geral');
  const [formData, setFormData] = useState({
    name: 'Barbearia Exemplo',
    slug: 'barbearia-exemplo',
    cnpj: '12.345.678/0001-90',
    address: 'Rua das Flores, 123 - Centro, São Paulo - SP',
    phone: '(11) 3333-4444',
    email: 'contato@barbearia.com',
    description: 'A melhor barbearia da região',
    instagram: '@barbeariaexemplo',
    facebook: 'facebook.com/barbeariaexemplo',
    tiktok: '@barbeariaexemplo',
    youtube: 'youtube.com/@barbeariaexemplo',
    website: 'https://barbeariaexemplo.com',
    whatsapp: '5511999999999',
  });
  const [workingHours, setWorkingHours] = useState({
    monday: { open: '09:00', close: '19:00', closed: false },
    tuesday: { open: '09:00', close: '19:00', closed: false },
    wednesday: { open: '09:00', close: '19:00', closed: false },
    thursday: { open: '09:00', close: '19:00', closed: false },
    friday: { open: '09:00', close: '20:00', closed: false },
    saturday: { open: '09:00', close: '17:00', closed: false },
    sunday: { open: '09:00', close: '13:00', closed: true },
  });
  const [notifications, setNotifications] = useState({
    email: { newAppointment: true, reminder: true, payment: true, marketing: false },
    whatsapp: { newAppointment: true, reminder: true, payment: true, marketing: false },
    push: { newAppointment: true, reminder: true, payment: false, marketing: false },
  });

  const tabs = [
    { id: 'geral', label: 'Geral', icon: Shield },
    { id: 'tema', label: 'Tema', icon: Palette },
    { id: 'redes', label: 'Redes Sociais', icon: MessageSquare },
    { id: 'horarios', label: 'Horários', icon: Clock },
    { id: 'notificacoes', label: 'Notificações', icon: Bell },
    { id: 'assinatura', label: 'Assinatura', icon: CreditCard },
    { id: 'backup', label: 'Backup', icon: Download },
  ];

  const handleSave = () => {
    alert('Configurações salvas com sucesso!');
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Configurações</h1>
        <p className="mt-2 text-gray-600">Personalize sua barbearia</p>
      </div>

      <div className="flex gap-6">
        <aside className="w-48 flex-shrink-0">
          <nav className="space-y-1 bg-white rounded-2xl border border-gray-100 p-4">
            {tabs.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as typeof activeTab)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition ${
                  activeTab === tab.id
                    ? 'bg-green-50 text-green-700'
                    : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                }`}
              >
                <tab.icon className="h-5 w-5" />
                {tab.label}
              </button>
            ))}
          </nav>
        </aside>

        <div className="flex-1">
          <Card>
            <CardContent className="p-6">
              {activeTab === 'geral' && <GeneralSettings formData={formData} setFormData={setFormData} onSave={handleSave} />}
              {activeTab === 'tema' && <ThemeSettings currentTheme={currentTheme} setTheme={setTheme} />}
              {activeTab === 'redes' && <SocialSettings formData={formData} setFormData={setFormData} />}
              {activeTab === 'horarios' && <HoursSettings workingHours={workingHours} setWorkingHours={setWorkingHours} />}
              {activeTab === 'notificacoes' && <NotificationSettings notifications={notifications} setNotifications={setNotifications} />}
              {activeTab === 'assinatura' && <SubscriptionSettings />}
              {activeTab === 'backup' && <BackupSettings />}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

const GeneralSettings: React.FC<{formData: any, setFormData: any, onSave: () => void}> = ({formData, setFormData, onSave}) => (
  <form onSubmit={e => {e.preventDefault(); onSave()}} className="space-y-6 max-w-2xl">
    <div className="border-b pb-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Dados da Barbearia</h3>
      <Input label="Nome" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required />
      <Input label="Slug (subdomínio)" value={formData.slug} onChange={e => setFormData({...formData, slug: e.target.value})} helperText="barbearia.barberflow.com.br" />
      <Input label="CNPJ" value={formData.cnpj} onChange={e => setFormData({...formData, cnpj: e.target.value})} />
      <Input label="Endereço" value={formData.address} onChange={e => setFormData({...formData, address: e.target.value})} />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Telefone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
        <Input label="Email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
      </div>
      <Input label="Descrição" value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} />
    </div>
    <div className="flex justify-end">
      <Button type="submit"><Save className="h-4 w-4 mr-2" />Salvar Alterações</Button>
    </div>
  </form>
);

const ThemeSettings: React.FC<{currentTheme: ThemeName, setTheme: (name: ThemeName) => void}> = ({currentTheme, setTheme}) => (
  <div className="space-y-6">
    <div>
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Escolha seu tema</h3>
      <p className="text-gray-600 mb-6">O tema é aplicado instantaneamente na sua página pública de agendamento</p>
    </div>
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
      {themeList.map(theme => (
        <button
          key={theme.name}
          onClick={() => setTheme(theme.name)}
          className={`relative p-4 rounded-2xl border-2 transition-all ${
            currentTheme === theme.name
              ? 'border-green-500 bg-green-50 ring-2 ring-green-500/20'
              : 'border-gray-200 hover:border-green-300'
          }`}
        >
          <div className="h-20 rounded-lg mb-3 flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${theme.primary}, ${theme.secondary})` }}>
            <span className="text-white font-bold text-lg" style={{ textShadow: '0 1px 2px rgba(0,0,0,0.3)' }}>
              {theme.displayName.split(' ')[0].charAt(0)}
            </span>
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="w-4 h-4 rounded" style={{ backgroundColor: theme.primary }} />
            <span className="w-4 h-4 rounded" style={{ backgroundColor: theme.secondary }} />
            <span className="w-4 h-4 rounded" style={{ backgroundColor: theme.accent }} />
          </div>
          <p className="font-medium text-gray-900">{theme.displayName}</p>
          <p className="text-xs text-gray-500">Clique para aplicar</p>
          {currentTheme === theme.name && (
            <div className="absolute top-2 right-2 bg-green-500 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs">✓</div>
          )}
        </button>
      ))}
    </div>
    <div className="border-t pt-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Personalização Avançada (CSS)</h3>
      <textarea className="w-full h-32 p-4 border border-gray-300 rounded-lg font-mono text-sm" placeholder="/* CSS customizado para sua barbearia */
/* Exemplo: */
.btn-custom { background: var(--color-primary); }" />
      <p className="text-sm text-gray-500 mt-2">Suas customizações CSS serão aplicadas sobre o tema selecionado.</p>
    </div>
  </div>
);

const SocialSettings: React.FC<{formData: any, setFormData: any}> = ({formData, setFormData}) => (
  <div className="space-y-6 max-w-2xl">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">Redes Sociais</h3>
    <p className="text-gray-600 mb-6">Esses links aparecem na sua página pública e no marketplace</p>

    <div className="space-y-4">
      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
        <Instagram className="h-6 w-6 text-pink-600" />
        <Input label="Instagram" value={formData.instagram} onChange={e => setFormData({...formData, instagram: e.target.value})} placeholder="@seuusuario" style={{flex: 1}} />
      </div>
      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
        <Facebook className="h-6 w-6 text-blue-600" />
        <Input label="Facebook" value={formData.facebook} onChange={e => setFormData({...formData, facebook: e.target.value})} placeholder="facebook.com/suapagina" style={{flex: 1}} />
      </div>
      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
        <Tiktok className="h-6 w-6 text-black" />
        <Input label="TikTok" value={formData.tiktok} onChange={e => setFormData({...formData, tiktok: e.target.value})} placeholder="@seuusuario" style={{flex: 1}} />
      </div>
      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
        <Youtube className="h-6 w-6 text-red-600" />
        <Input label="YouTube" value={formData.youtube} onChange={e => setFormData({...formData, youtube: e.target.value})} placeholder="youtube.com/@seucanal" style={{flex: 1}} />
      </div>
      <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
        <Globe className="h-6 w-6 text-gray-600" />
        <Input label="Site Próprio" value={formData.website} onChange={e => setFormData({...formData, website: e.target.value})} placeholder="https://seusite.com" style={{flex: 1}} />
      </div>
      <div className="flex items-center gap-4 p-4 bg-green-50 rounded-xl border border-green-100">
        <MessageSquare className="h-6 w-6 text-green-600" />
        <Input label="WhatsApp Business" value={formData.whatsapp} onChange={e => setFormData({...formData, whatsapp: e.target.value})} placeholder="5511999999999 (com código do país)" style={{flex: 1}} />
      </div>
    </div>
    <Button onClick={() => alert('Redes sociais salvas!')}>Salvar Redes Sociais</Button>
  </div>
);

const HoursSettings: React.FC<{workingHours: any, setWorkingHours: any}> = ({workingHours, setWorkingHours}) => (
  <div className="max-w-xl">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">Horário de Funcionamento</h3>
    <p className="text-gray-600 mb-6">Defina os horários de atendimento para cada dia da semana</p>

    <div className="space-y-4">
      {Object.entries(workingHours).map(([day, hours]: [string, any]) => (
        <div key={day} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl">
          <div className="w-28 font-medium text-gray-700 capitalize">{day}</div>
          <input
            type="checkbox"
            checked={!hours.closed}
            onChange={e => setWorkingHours({...workingHours, [day]: {...hours, closed: !e.target.checked}})}
            className="w-5 h-5 text-green-600 rounded"
            id={`closed-${day}`}
          />
          <label htmlFor={`closed-${day}`} className="text-sm text-gray-600">Fechado</label>
          <div className="flex-1 flex items-center gap-2" style={{opacity: hours.closed ? 0.5 : 1}}>
            <Input label="Abertura" type="time" value={hours.open} onChange={e => setWorkingHours({...workingHours, [day]: {...hours, open: e.target.value}})} style={{width: '120px'}} />
            <span className="text-gray-400">às</span>
            <Input label="Fechamento" type="time" value={hours.close} onChange={e => setWorkingHours({...workingHours, [day]: {...hours, close: e.target.value}})} style={{width: '120px'}} />
          </div>
        </div>
      ))}
    </div>
    <Button onClick={() => alert('Horários salvos!')}>Salvar Horários</Button>
  </div>
);

const NotificationSettings: React.FC<{notifications: any, setNotifications: any}> = ({notifications, setNotifications}) => (
  <div className="max-w-2xl">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">Preferências de Notificação</h3>
    <p className="text-gray-600 mb-6">Configure como e quando você e sua equipe recebem avisos</p>

    <div className="space-y-6">
      {(['email', 'whatsapp', 'push'] as const).map(channel => (
        <Card key={channel}>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {channel === 'email' && <Mail className="h-5 w-5" />}
              {channel === 'whatsapp' && <MessageSquare className="h-5 w-5" />}
              {channel === 'push' && <Bell className="h-5 w-5" />}
              {channel.charAt(0).toUpperCase() + channel.slice(1)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              {Object.entries(notifications[channel]).map(([type, enabled]) => (
                <label key={type} className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={enabled as boolean}
                    onChange={e => setNotifications({...notifications, [channel]: {...notifications[channel], [type]: e.target.checked}})}
                    className="w-4 h-4 text-green-600 rounded"
                  />
                  <span className="text-sm text-gray-700 capitalize">{type.replace(/([A-Z])/g, ' $1')}</span>
                </label>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
    <Button onClick={() => alert('Notificações salvas!')}>Salvar Preferências</Button>
  </div>
);

const SubscriptionSettings: React.FC = () => (
  <div className="max-w-xl">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">Assinatura e Pagamentos</h3>
    <p className="text-gray-600 mb-6">Gerencie seu plano e forma de pagamento</p>

    <Card>
      <CardHeader>
        <CardTitle>Plano Atual</CardTitle>
        <CardDescription>Plano Anual - R$ 549,90/ano (equivale a R$ 45,82/mês)</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-4 bg-green-50 rounded-xl">
          <div>
            <p className="font-medium text-green-700">Status: Ativo</p>
            <p className="text-sm text-green-600">Renova em: 15/11/2027</p>
          </div>
          <Badge variant="success">ATIVO</Badge>
        </div>
        <div className="border-t pt-4 space-y-2">
          <Button variant="outline" className="w-full justify-start">Alterar para Mensal (R$ 49,90/mês)</Button>
          <Button variant="outline" className="w-full justify-start">Ver histórico de pagamentos</Button>
          <Button variant="outline" className="w-full justify-start">Gerar Pix para renovação</Button>
          <Button variant="ghost" variant="danger" className="w-full justify-start">Cancelar assinatura</Button>
        </div>
      </CardContent>
    </Card>

    <Card className="mt-6">
      <CardHeader>
        <CardTitle>Método de Pagamento</CardTitle>
        <CardDescription>Configure sua chave Pix para pagamentos automáticos</CardDescription>
      </CardHeader>
      <CardContent>
        <Input label="Chave Pix" placeholder="ex: chave@email.com ou CPF/CNPJ" />
        <Input label="Nome do Favorecido" placeholder="Nome da barbearia" />
        <Input label="Cidade" placeholder="São Paulo" />
      </CardContent>
    </Card>
  </div>
);

const BackupSettings: React.FC = () => (
  <div className="max-w-xl">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">Backup e Exportação de Dados</h3>
    <p className="text-gray-600 mb-6">Baixe todos os dados da sua barbearia</p>

    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium text-gray-900">Backup Completo</p>
            <p className="text-sm text-gray-500">Clientes, agendamentos, profissionais, serviços, relatórios</p>
          </div>
          <Button><Download className="h-4 w-4 mr-2" />Baixar JSON</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium text-gray-900">Exportar Clientes (CSV)</p>
            <p className="text-sm text-gray-500">Planilha com todos os clientes e histórico</p>
          </div>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" />Baixar CSV</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium text-gray-900">Exportar Agendamentos (CSV)</p>
            <p className="text-sm text-gray-500">Histórico completo de agendamentos</p>
          </div>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" />Baixar CSV</Button>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex items-center justify-between p-4">
          <div>
            <p className="font-medium text-gray-900">Exportar Financeiro (CSV)</p>
            <p className="text-sm text-gray-500">Receitas, comissões, pagamentos</p>
          </div>
          <Button variant="outline"><Download className="h-4 w-4 mr-2" />Baixar CSV</Button>
        </CardContent>
      </Card>
    </div>

    <div className="mt-8 p-4 bg-red-50 border border-red-100 rounded-xl">
      <h4 className="font-medium text-red-700 mb-2 flex items-center gap-2"><Trash2 className="h-5 w-5" />Zona de Perigo</h4>
      <p className="text-sm text-red-600 mb-4">Ações irreversíveis</p>
      <Button variant="outline" className="bg-red-100 text-red-700 hover:bg-red-200">Solicitar exclusão de conta</Button>
    </div>
  </div>
);

export default Settings;