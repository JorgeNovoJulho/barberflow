import React from 'react'

const Landing: React.FC = () => {
  return (
    <div className="min-h-screen">
      <header className="border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold text-green-700">BarberFlow</span>
            </div>
            <nav className="flex items-center space-x-8">
              <a href="#features" className="text-gray-600 hover:text-gray-900">Funcionalidades</a>
              <a href="#pricing" className="text-gray-600 hover:text-gray-900">Preços</a>
              <a href="#faq" className="text-gray-600 hover:text-gray-900">FAQ</a>
              <a href="/login" className="text-gray-600 hover:text-gray-900">Entrar</a>
              <a href="/register" className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition">
                Começar teste grátis
              </a>
            </nav>
          </div>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden bg-gradient-to-b from-green-50 to-white py-20 sm:py-32">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center">
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 tracking-tight">
                Gestão inteligente. Agenda organizada.
              </h1>
              <p className="mt-6 text-lg sm:text-xl text-gray-600 max-w-3xl mx-auto">
                Sua barbearia organizada. Seus clientes conectados.
              </p>
              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
                <a href="/register" className="w-full sm:w-auto bg-green-600 text-white px-8 py-3 rounded-lg text-lg font-medium hover:bg-green-700 transition shadow-lg">
                  Começar teste grátis de 14 dias
                </a>
                <a href="#pricing" className="w-full sm:w-auto border-2 border-gray-300 text-gray-700 px-8 py-3 rounded-lg text-lg font-medium hover:bg-gray-50 transition">
                  Ver planos
                </a>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
                <span className="flex items-center gap-1 px-3 py-1 bg-green-50 rounded-full">✓ 14 dias grátis</span>
                <span className="flex items-center gap-1 px-3 py-1 bg-gray-50 rounded-full">✓ Sem cartão</span>
                <span className="flex items-center gap-1 px-3 py-1 bg-gray-50 rounded-full">✓ Sem comissão</span>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Tudo que sua barbearia precisa</h2>
              <p className="mt-4 text-lg text-gray-600">Ferramentas completas para gerenciar, crescer e fidelizar</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
              {features.map((feature) => (
                <div key={feature.title} className="p-6 border border-gray-100 rounded-xl hover:border-green-200 hover:shadow-lg transition">
                  <div className="w-12 h-12 bg-green-50 rounded-lg flex items-center justify-center mb-4">
                    <span className="text-2xl">{feature.icon}</span>
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="py-20 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Como funciona</h2>
              <p className="mt-4 text-lg text-gray-600">Em 4 passos sua barbearia está pronta</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
              {steps.map((step) => (
                <div key={step.num} className="text-center relative">
                  <div className="w-16 h-16 bg-green-600 text-white rounded-full flex items-center justify-center text-2xl font-bold mx-auto mb-4">
                    {step.num}
                  </div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-2">{step.title}</h3>
                  <p className="text-gray-600 text-sm">{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="py-20 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Preços simples e transparentes</h2>
              <p className="mt-4 text-lg text-gray-600">Sem surpresas. Cancele quando quiser.</p>
            </div>
            <div className="flex flex-col md:flex-row items-center justify-center gap-8 max-w-4xl mx-auto">
              <div className="p-8 border border-gray-200 rounded-2xl w-full max-w-md">
                <h3 className="text-xl font-semibold text-gray-900">Mensal</h3>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-gray-900">R$ 49,90</span>
                  <span className="text-gray-500">/mês</span>
                </div>
                <ul className="mt-6 space-y-3">
                  {monthlyFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-gray-600">
                      <span className="text-green-600">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <button className="mt-8 w-full bg-gray-100 text-gray-700 py-3 rounded-lg font-medium hover:bg-gray-200 transition">
                  Escolher mensal
                </button>
              </div>
              <div className="p-8 border-2 border-green-500 rounded-2xl w-full max-w-md relative">
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-500 text-white text-sm font-medium px-3 py-1 rounded-full">
                  Mais popular
                </div>
                <h3 className="text-xl font-semibold text-gray-900">Anual</h3>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-gray-900">R$ 549,90</span>
                  <span className="text-gray-500">/ano</span>
                </div>
                <p className="mt-2 text-sm text-green-600 font-medium">Equivale a R$ 45,82/mês — 23% de desconto</p>
                <ul className="mt-6 space-y-3">
                  {annualFeatures.map((f) => (
                    <li key={f} className="flex items-center gap-2 text-gray-600">
                      <span className="text-green-600">✓</span> {f}
                    </li>
                  ))}
                </ul>
                <a href="/register" className="mt-8 w-full bg-green-600 text-white py-3 rounded-lg font-medium hover:bg-green-700 transition block text-center">
                  Começar teste grátis de 14 dias
                </a>
              </div>
            </div>
          </div>
        </section>

        <section id="faq" className="py-20 bg-gray-50">
          <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl sm:text-4xl font-bold text-gray-900">Perguntas frequentes</h2>
            </div>
            <div className="space-y-4">
              {faqs.map((faq, i) => (
                <details key={i} className="group bg-white border border-gray-200 rounded-lg">
                  <summary className="p-6 flex items-center justify-between cursor-pointer list-none">
                    <span className="font-medium text-gray-900">{faq.q}</span>
                    <span className="text-green-600 group-open:rotate-180 transition-transform">▼</span>
                  </summary>
                  <div className="px-6 pb-6 text-gray-600 border-t border-gray-100">
                    {faq.a}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      </main>

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
                <li><a href="#" className="hover:text-white transition">Funcionalidades</a></li>
                <li><a href="#" className="hover:text-white transition">Preços</a></li>
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
  )
}

const features = [
  { icon: '📅', title: 'Agenda inteligente', desc: 'Visualização dia/semana/mês com drag & drop' },
  { icon: '👥', title: 'Gestão de profissionais', desc: 'Horários, comissões e permissões por profissional' },
  { icon: '🎨', title: 'Página personalizada', desc: 'Subdomínio próprio com sua marca e cores' },
  { icon: '🏪', title: 'Marketplace BarberFlow', desc: 'Seja encontrado por novos clientes na sua cidade' },
  { icon: '📊', title: 'Controle de clientes', desc: 'Histórico, preferências, aniversários e tags' },
  { icon: '📈', title: 'Relatórios completos', desc: 'Receita, ocupação, ticket médio e LTV' },
  { icon: '🌐', title: 'Agendamento online', desc: 'Clientes agendam 24/7 pelo WhatsApp ou site' },
  { icon: '🎁', title: 'Programa de fidelidade', desc: 'Cartão digital: X cortes = 1 grátis com QR Code' },
]

const steps = [
  { num: 1, title: 'Crie sua conta', desc: 'Cadastre-se em 2 minutos. Sem cartão de crédito.' },
  { num: 2, title: 'Cadastre a barbearia', desc: 'Nome, endereço, horários e dados fiscais.' },
  { num: 3, title: 'Configure serviços e equipe', desc: 'Adicione cortes, barbas, combos e profissionais.' },
  { num: 4, title: 'Receba agendamentos', desc: 'Sua página pública já está no ar. Divulgue e pronto!' },
]

const monthlyFeatures = [
  'Agenda ilimitada',
  'Até 5 profissionais',
  'Página personalizada',
  'Marketplace BarberFlow',
  'Programa de fidelidade',
  'Relatórios básicos',
  'Suporte por email',
]

const annualFeatures = [
  'Tudo do plano mensal',
  'Profissionais ilimitados',
  'Relatórios avançados',
  'Integração WhatsApp API',
  'API para desenvolvedores',
  'Suporte prioritário',
  'Domínio customizado',
]

const faqs = [
  { q: 'Preciso de cartão de crédito para testar?', a: 'Não. O trial de 14 dias é totalmente gratuito sem pedir cartão. Você só paga se quiser continuar depois.' },
  { q: 'Posso cancelar a qualquer momento?', a: 'Sim. Sem multa, sem fidelidade. O cancelamento é imediato e você mantém acesso até o fim do período pago.' },
  { q: 'Quantos profissionais posso cadastrar?', a: 'No plano mensal: até 5. No anual: ilimitados. Cada profissional tem sua agenda, comissões e permissões próprias.' },
  { q: 'Como funciona o marketplace?', a: 'Sua barbearia aparece para clientes da sua cidade que buscam por serviços. É automático e gratuito — você só paga a assinatura.' },
  { q: 'O sistema funciona no celular?', a: 'Sim. É 100% responsivo. Você gerencia a agenda pelo celular e clientes agendam pelo WhatsApp ou navegador.' },
  { q: 'E se eu quiser mudar de plano?', a: 'Pode fazer upgrade/downgrade a qualquer momento. O valor é ajustado pro rata no próximo ciclo de cobrança.' },
  { q: 'Como recebo os agendamentos?', a: 'Notificações em tempo real no painel, email e WhatsApp. Também tem lembrete automático pro cliente (24h e 1h antes).' },
  { q: 'Meus dados ficam seguros?', a: 'Sim. Banco criptografado, backups automáticos, LGPD compliant. Você pode exportar tudo quando quiser.' },
]

export default Landing
