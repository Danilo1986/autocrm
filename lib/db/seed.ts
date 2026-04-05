import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  console.log('Seeding database...')

  // 1. Lifecycle Stages
  const stages = [
    { id: 'LEAD', name: 'Lead', color: 'bg-blue-500', order: 0, isDefault: true },
    { id: 'MQL', name: 'MQL', color: 'bg-yellow-500', order: 1, isDefault: true },
    { id: 'PROSPECT', name: 'Oportunidade', color: 'bg-purple-500', order: 2, isDefault: true },
    { id: 'CUSTOMER', name: 'Cliente', color: 'bg-green-500', order: 3, isDefault: true },
    { id: 'OTHER', name: 'Outros / Perdidos', color: 'bg-slate-500', order: 4, isDefault: true },
  ]

  for (const stage of stages) {
    await prisma.lifecycleStage.upsert({
      where: { id: stage.id },
      update: {},
      create: stage,
    })
  }
  console.log(`  ✓ ${stages.length} lifecycle stages`)

  // 2. System Quick Scripts
  const scripts = [
    {
      title: 'Follow-up Amigavel',
      category: 'followup',
      template: 'Ola {nome}!\n\nTudo bem? Estou passando para ver como estao as coisas por ai.\n\nConseguiu avaliar nossa ultima conversa? Fico a disposicao para tirar qualquer duvida!\n\nAbraco!',
      icon: 'MessageCircle',
      isSystem: true,
    },
    {
      title: 'Resposta a Objecao de Preco',
      category: 'objection',
      template: 'Entendo sua preocupacao com o investimento, {nome}.\n\nO que muitos dos nossos clientes perceberam e que o retorno vem em [X meses].\n\nPosso te mostrar alguns cases de sucesso similares ao seu negocio?',
      icon: 'AlertCircle',
      isSystem: true,
    },
    {
      title: 'Fechamento Suave',
      category: 'closing',
      template: '{nome}, com base no que conversamos:\n\n- [Beneficio 1]\n- [Beneficio 2]\n- [Beneficio 3]\n\nPodemos dar o proximo passo? O que falta para fecharmos?',
      icon: 'Target',
      isSystem: true,
    },
    {
      title: 'Primeira Abordagem',
      category: 'intro',
      template: 'Ola {nome}!\n\nVi que voce [contexto de como chegou].\n\nSou especialista em [area] e ajudo empresas como a [empresa] a [resultado].\n\nPodemos bater um papo de 15 minutos essa semana?',
      icon: 'Sparkles',
      isSystem: true,
    },
    {
      title: 'Resgate de Deal Parado',
      category: 'rescue',
      template: 'Oi {nome}, quanto tempo!\n\nEstava revisando meus contatos e lembrei da nossa ultima conversa sobre [assunto].\n\nSei que as coisas mudam, mas queria saber se faz sentido retomar de onde paramos. O que acha?',
      icon: 'RefreshCw',
      isSystem: true,
    },
    {
      title: 'Follow-up de Reuniao',
      category: 'followup',
      template: 'Oi {nome}!\n\nFoi otimo falar com voce hoje sobre [assunto da reuniao].\n\nConforme combinamos, seguem os proximos passos:\n1. [Item 1]\n2. [Item 2]\n\nQualquer duvida, estou a disposicao!',
      icon: 'Calendar',
      isSystem: true,
    },
    {
      title: 'Confirmacao de Agendamento',
      category: 'followup',
      template: 'Ola {nome}!\n\nConfirmando nossa reuniao:\n\nData: [dia/mes]\nHorario: [horario]\nLocal: [link/endereco]\n\nPrecisa remarcar? Me avise com antecedencia!\n\nTe espero la!',
      icon: 'Clock',
      isSystem: true,
    },
    {
      title: 'Follow-up Pos-Proposta',
      category: 'followup',
      template: '{nome}, tudo certo?\n\nPassando para saber se teve a chance de analisar a proposta que enviei.\n\nFicou com alguma duvida ou quer ajustar algum ponto? Fico a disposicao para conversarmos!',
      icon: 'FileText',
      isSystem: true,
    },
    {
      title: 'Objecao: Preciso Pensar',
      category: 'objection',
      template: 'Entendo perfeitamente, {nome}.\n\nMe conta: qual e o principal ponto que voce gostaria de avaliar melhor?\n\nAssim posso te ajudar com mais informacoes para sua decisao.',
      icon: 'Brain',
      isSystem: true,
    },
    {
      title: 'Objecao: Nao e o Momento',
      category: 'objection',
      template: 'Compreendo, {nome}. O timing e importante mesmo.\n\nSo para eu entender melhor: o que mudaria para ser o momento ideal?\n\nAssim consigo te ajudar melhor quando fizer sentido.',
      icon: 'Clock',
      isSystem: true,
    },
    {
      title: 'Objecao: Ja Tenho Fornecedor',
      category: 'objection',
      template: 'Faz sentido, {nome}. Ter um fornecedor de confianca e importante.\n\nA maioria dos nossos clientes tambem tinha quando nos conheceram. O que eles descobriram foi [diferencial].\n\nPosso te mostrar como complementamos o que voce ja tem?',
      icon: 'Users',
      isSystem: true,
    },
    {
      title: 'Fechamento Urgente',
      category: 'closing',
      template: '{nome}, lembrete rapido:\n\nNossa condicao especial de [oferta] vai ate [data].\n\nDepois disso, o investimento volta ao valor normal de [valor].\n\nQuer garantir antes que acabe?',
      icon: 'Zap',
      isSystem: true,
    },
    {
      title: 'Pedido de Indicacao',
      category: 'intro',
      template: 'Oi {nome}!\n\nEstava pensando: voce conhece alguem que tambem poderia se beneficiar de [solucao]?\n\nAdoraria ajudar outros profissionais como voce. Se tiver alguem em mente, me avisa!',
      icon: 'UserPlus',
      isSystem: true,
    },
    {
      title: 'Reativacao de Cliente Antigo',
      category: 'rescue',
      template: 'Oi {nome}! Saudades!\n\nFaz um tempo que nao conversamos e queria saber como estao as coisas por ai.\n\nTemos algumas novidades que podem te interessar: [novidade].\n\nBora colocar o papo em dia?',
      icon: 'Heart',
      isSystem: true,
    },
    {
      title: 'Tentativa Final',
      category: 'rescue',
      template: '{nome},\n\nTentei te contatar algumas vezes sem sucesso.\n\nEntendo que as coisas podem ter mudado. Se nao fizer mais sentido, tudo bem!\n\nSo me avisa se devo parar ou se prefere retomar mais pra frente.',
      icon: 'Flag',
      isSystem: true,
    },
  ]

  for (const script of scripts) {
    const existing = await prisma.quickScript.findFirst({
      where: { title: script.title, isSystem: true },
    })
    if (!existing) {
      await prisma.quickScript.create({ data: script })
    }
  }
  console.log(`  ✓ ${scripts.length} system quick scripts`)

  console.log('Seed completed!')
}

main()
  .catch((e) => {
    console.error('Seed failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
