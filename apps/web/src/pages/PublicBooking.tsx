import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent, Button, Input, Select, Badge } from '@barberflow/ui';
import { Calendar, Clock, User, Phone, Mail, CheckCircle, AlertCircle, ChevronLeft, ChevronRight, ArrowRight, MessageSquare } from 'lucide-react';

interface PublicBookingData {
  barbershop: any;
  services: any[];
  professionals: any[];
  theme: any;
}

const PublicBooking: React.FC = () => {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [formData, setFormData] = useState({
    serviceId: '',
    professionalId: '',
    date: '',
    time: '',
    name: '',
    phone: '',
    email: '',
    notes: '',
  });
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [data, setData] = useState<PublicBookingData | null>(null);
  const [loading, setLoading] = useState(true);

  // Mock data - in real app this comes from API via slug
  useEffect(() => {
    setTimeout(() => {
      setData({
        barbershop: {
          name: 'Barbearia Exemplo',
          description: 'A melhor barbearia da região',
          logoUrl: null,
          bannerUrl: null,
          themeId: 'classic-grid',
          address: 'Rua das Flores, 123 - Centro, São Paulo - SP',
          phone: '(11) 3333-4444',
          email: 'contato@barbearia.com',
          instagram: '@barbeariaexemplo',
          whatsapp: '5511999999999',
        },
        services: [
          { id: '1', name: 'Corte', duration: 30, price: 35, category: 'CORTE', professionals: ['1', '2'] },
          { id: '2', name: 'Barba', duration: 20, price: 25, category: 'BARBA', professionals: ['1'] },
          { id: '3', name: 'Corte + Barba', duration: 45, price: 55, category: 'COMBO', professionals: ['1', '2'] },
          { id: '4', name: 'Combo Completo', duration: 60, price: 80, category: 'COMBO', professionals: ['1', '2', '3'] },
        ],
        professionals: [
          { id: '1', name: 'João Silva', avatarUrl: null },
          { id: '2', name: 'Maria Santos', avatarUrl: null },
          { id: '3', name: 'Pedro Costa', avatarUrl: null },
        ],
        theme: {
          primary: '#00A86B',
          secondary: '#0D1B16',
          accent: '#FFD700',
        },
      });
      setLoading(false);
    }, 500);
  }, []);

  useEffect(() => {
    if (formData.serviceId && formData.professionalId && formData.date) {
      generateSlots();
    }
  }, [formData.serviceId, formData.professionalId, formData.date]);

  const generateSlots = () => {
    const service = data?.services.find(s => s.id === formData.serviceId);
    if (!service) return;

    const slots = [];
    const startHour = 9;
    const endHour = 19;
    const interval = 30;

    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += interval) {
        const time = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
        // Randomly mark some as unavailable
        if (Math.random() > 0.3) slots.push(time);
      }
    }
    setAvailableSlots(slots);
  };

  const handleNext = () => {
    if (step === 1 && formData.serviceId) setStep(2);
    else if (step === 2 && formData.professionalId) setStep(3);
    else if (step === 3 && formData.date && formData.time) setStep(4);
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const selectedService = data?.services.find(s => s.id === formData.serviceId);
  const selectedProfessional = data?.professionals.find(p => p.id === formData.professionalId);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-4 border-green-500 border-t-transparent" /></div>;
  }

  const themeStyle = data?.theme ? {
    '--color-primary': data.theme.primary,
    '--color-secondary': data.theme.secondary,
    '--color-accent': data.theme.accent,
  } : {};

  return (
    <div style={themeStyle as React.CSSProperties} className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {data?.barbershop.logoUrl ? (
                <img src={data.barbershop.logoUrl} alt={data.barbershop.name} className="h-10 w-10 rounded-lg" />
              ) : (
                <div className="h-10 w-10 rounded-lg flex items-center justify-center text-white font-bold text-lg" style={{backgroundColor: data?.theme?.primary}}>
                  {data?.barbershop.name.charAt(0)}
                </div>
              )}
              <div>
                <h1 className="font-bold text-gray-900">{data?.barbershop.name}</h1>
                <p className="text-sm text-gray-500">{data?.barbershop.address}</p>
              </div>
            </div>
            <a href={`https://wa.me/${data?.barbershop.whatsapp}`} target="_blank" rel="noopener" className="flex items-center gap-2 bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 transition">
              <MessageSquare className="h-4 w-4" />
              Agendar no WhatsApp
            </a>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            {[1, 2, 3, 4].map(s => (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  s < step ? 'bg-green-500 text-white' : s === step ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-400'
                }`}>
                  {s < step ? <CheckCircle className="h-5 w-5" /> : s}
                </div>
                {s < 4 && <div className={`w-16 h-1 ${s < step ? 'bg-green-500' : 'bg-gray-200'}`} />}
              </div>
            ))}
          </div>
          <div className="flex justify-center gap-4 text-sm">
            <span className={`px-3 py-1 rounded-full ${step >= 1 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>Serviço</span>
            <span className={`px-3 py-1 rounded-full ${step >= 2 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>Profissional</span>
            <span className={`px-3 py-1 rounded-full ${step >= 3 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>Horário</span>
            <span className={`px-3 py-1 rounded-full ${step >= 4 ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-400'}`}>Dados</span>
          </div>
        </div>

        <Card className="bg-white">
          <CardContent className="p-6">
            {step === 1 && <StepService services={data!.services} formData={formData} setFormData={setFormData} />}
            {step === 2 && <StepProfessional professionals={data!.professionals} serviceId={formData.serviceId} services={data!.services} formData={formData} setFormData={setFormData} />}
            {step === 3 && <StepSchedule selectedDate={selectedDate} setSelectedDate={setSelectedDate} availableSlots={availableSlots} formData={formData} setFormData={setFormData} />}
            {step === 4 && <StepConfirm formData={formData} setFormData={setFormData} service={selectedService} professional={selectedProfessional} barbershop={data!.barbershop} />}
          </CardContent>
        </Card>

        <div className="flex justify-between mt-6">
          <Button variant="outline" onClick={handleBack} disabled={step === 1}>Voltar</Button>
          <Button onClick={step === 4 ? handleSubmit : handleNext} disabled={isStepDisabled()}>
            {step === 4 ? 'Confirmar Agendamento' : 'Próximo'}
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </main>

      <footer className="bg-gray-900 text-gray-400 py-8 mt-12">
        <div className="max-w-2xl mx-auto px-4 text-center text-sm">
          <p>Powered by <span className="font-bold text-white">BarberFlow</span></p>
          <p className="mt-1">{data?.barbershop.name} • {data?.barbershop.address}</p>
        </div>
      </footer>
    </div>
  );

  function isStepDisabled() {
    if (step === 1) return !formData.serviceId;
    if (step === 2) return !formData.professionalId;
    if (step === 3) return !formData.date || !formData.time;
    if (step === 4) return !formData.name || !formData.phone;
    return false;
  }

  async function handleSubmit() {
    alert('Agendamento confirmado! Em produção, isso chamaria a API.');
    // Reset
    setStep(1);
    setFormData({ serviceId: '', professionalId: '', date: '', time: '', name: '', phone: '', email: '', notes: '' });
  }
};

const StepService: React.FC<{services: any[], formData: any, setFormData: any}> = ({services, formData, setFormData}) => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-2">Qual serviço deseja?</h2>
    <p className="text-gray-600 mb-6">Escolha o serviço que melhor atende sua necessidade</p>
    <div className="grid grid-cols-1 gap-4">
      {services.map(s => (
        <button
          key={s.id}
          onClick={() => setFormData({...formData, serviceId: s.id, professionalId: ''})}
          className={`p-4 rounded-xl border-2 text-left transition ${
            formData.serviceId === s.id
              ? 'border-green-500 bg-green-50'
              : 'border-gray-200 hover:border-green-300'
          }`}
        >
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900">{s.name}</p>
              <p className="text-sm text-gray-500">{s.category} • {s.duration} min</p>
            </div>
            <p className="text-xl font-bold text-green-600">R$ {s.price.toFixed(2)}</p>
          </div>
        </button>
      ))}
    </div>
  </div>
);

const StepProfessional: React.FC<{professionals: any[], serviceId: string, services: any[], formData: any, setFormData: any}> = ({professionals, serviceId, services, formData, setFormData}) => {
  const service = services.find(s => s.id === serviceId);
  const availablePros = professionals.filter(p => service?.professionals.includes(p.id));

  return (
    <div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">Com quem prefere?</h2>
      <p className="text-gray-600 mb-6">Escolha seu profissional ou deixe com 'Qualquer um'</p>
      <button
        onClick={() => setFormData({...formData, professionalId: 'any'})}
        className={`w-full p-4 rounded-xl border-2 text-left transition mb-4 ${
          formData.professionalId === 'any'
            ? 'border-green-500 bg-green-50'
            : 'border-gray-200 hover:border-green-300'
        }`}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
            <User className="h-5 w-5 text-gray-400" />
          </div>
          <div>
            <p className="font-medium text-gray-900">Qualquer profissional disponível</p>
            <p className="text-sm text-gray-500">Nós escolhemos quem tiver horário</p>
          </div>
        </div>
      </button>
      <div className="grid grid-cols-1 gap-4">
        {availablePros.map(p => (
          <button
            key={p.id}
            onClick={() => setFormData({...formData, professionalId: p.id})}
            className={`p-4 rounded-xl border-2 text-left transition ${
              formData.professionalId === p.id
                ? 'border-green-500 bg-green-50'
                : 'border-gray-200 hover:border-green-300'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center text-green-600 font-medium">
                {p.name.charAt(0)}
              </div>
              <div>
                <p className="font-medium text-gray-900">{p.name}</p>
                <p className="text-sm text-gray-500">Especialista em {service?.category.toLowerCase()}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
};

const StepSchedule: React.FC<{selectedDate: Date, setSelectedDate: any, availableSlots: string[], formData: any, setFormData: any}> = ({selectedDate, setSelectedDate, availableSlots, formData, setFormData}) => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-2">Quando deseja agendar?</h2>
    <p className="text-gray-600 mb-6">Selecione a data e o horário disponível</p>

    <div className="mb-6">
      <div className="flex items-center justify-between mb-4">
        <Button variant="outline" size="sm" onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() - 1); return nd; })}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="font-medium text-gray-900">{selectedDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })}</span>
        <Button variant="outline" size="sm" onClick={() => setSelectedDate(d => { const nd = new Date(d); nd.setMonth(nd.getMonth() + 1); return nd; })}><ChevronRight className="h-4 w-4" /></Button>
      </div>
      <div className="grid grid-cols-7 gap-1">
        {['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'].map(d => (
          <div key={d} className="text-center text-sm text-gray-500 py-1">{d}</div>
        ))}
        {Array.from({ length: 42 }, (_, i) => {
          const firstDay = new Date(selectedDate.getFullYear(), selectedDate.getMonth(), 1);
          const startDay = firstDay.getDay();
          const dayNum = i - startDay + 1;
          const isCurrentMonth = dayNum > 0 && dayNum <= new Date(selectedDate.getFullYear(), selectedDate.getMonth() + 1, 0).getDate();
          const date = isCurrentMonth ? new Date(selectedDate.getFullYear(), selectedDate.getMonth(), dayNum) : null;
          const isToday = date && date.toDateString() === new Date().toDateString();
          const isSelected = date && date.toDateString() === selectedDate.toDateString();
          const isPast = date && date < new Date(new Date().setHours(0,0,0,0));

          if (!date) return <div key={i} className="aspect-square" />;

          return (
            <button
              key={i}
              onClick={() => setSelectedDate(date)}
              disabled={isPast}
              className={`aspect-square rounded-lg text-sm font-medium transition ${
                isSelected ? 'bg-green-500 text-white' :
                isToday ? 'bg-green-100 text-green-700' :
                isPast ? 'text-gray-300' :
                'text-gray-900 hover:bg-green-50'
              }`}
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>

    {formData.date && (
      <div>
        <p className="font-medium text-gray-900 mb-3">Horários disponíveis para {new Date(formData.date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
        <div className="grid grid-cols-4 gap-2 max-h-60 overflow-y-auto">
          {availableSlots.map(slot => (
            <button
              key={slot}
              onClick={() => setFormData({...formData, time: slot})}
              className={`py-2 px-3 rounded-lg text-sm font-medium transition ${
                formData.time === slot
                  ? 'bg-green-500 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-green-50 hover:text-green-600'
              }`}
            >
              {slot}
            </button>
          ))}
        </div>
        {availableSlots.length === 0 && (
          <p className="text-center text-gray-500 py-4">Nenhum horário disponível para esta data</p>
        )}
      </div>
    )}
  </div>
);

const StepConfirm: React.FC<{formData: any, setFormData: any, service: any, professional: any, barbershop: any}> = ({formData, setFormData, service, professional, barbershop}) => (
  <div>
    <h2 className="text-2xl font-bold text-gray-900 mb-2">Confirme seus dados</h2>
    <p className="text-gray-600 mb-6">Revise as informações e finalize seu agendamento</p>

    <Card className="mb-6" padding="md">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Serviço</span>
          <span className="font-medium">{service?.name}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Profissional</span>
          <span className="font-medium">{professional?.name || 'Qualquer um disponível'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Data</span>
          <span className="font-medium">{formData.date ? new Date(formData.date).toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }) : '-'}</span>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-gray-600">Horário</span>
          <span className="font-medium">{formData.time}</span>
        </div>
        <div className="flex items-center justify-between border-t pt-3">
          <span className="font-medium">Total</span>
          <span className="text-xl font-bold text-green-600">R$ {service?.price.toFixed(2) || '0,00'}</span>
        </div>
      </div>
    </Card>

    <div className="space-y-4">
      <Input label="Nome completo" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} required autoComplete="name" />
      <div className="grid grid-cols-2 gap-4">
        <Input label="Telefone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} required autoComplete="tel" />
        <Input label="Email (opcional)" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} autoComplete="email" />
      </div>
      <Input label="Observações (opcional)" value={formData.notes} onChange={e => setFormData({...formData, notes: e.target.value})} placeholder="Ex: quero degradê baixo, barba cheia..." />
    </div>

    <div className="mt-6 p-4 bg-green-50 border border-green-100 rounded-xl">
      <div className="flex items-start gap-3">
        <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
        <div className="text-sm text-green-700">
          <p className="font-medium">Confirmação via WhatsApp</p>
          <p>Você receberá a confirmação e lembretes (24h e 1h antes) no WhatsApp: {barbershop.whatsapp}</p>
        </div>
      </div>
    </div>
  </div>
);

export default PublicBooking;