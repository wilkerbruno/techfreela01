/* ============================================================
   TECHFREELA — data.js
   Banco de dados mockado de vagas e dados estáticos
   (Em produção, este conteúdo vem da API Python/Flask)
   ============================================================ */

const DB = (() => {

  const TAG_COLORS = ['tag-blue', 'tag-green', 'tag-purple', 'tag-orange', 'tag-pink'];

  const getTagColor = (index) => TAG_COLORS[index % TAG_COLORS.length];

  /* ---- JOBS ---- */
  let jobs = [
    {
      id: 1,
      title: 'Senior React Developer',
      company: 'Nubank',
      logo: '💜',
      type: 'CLT',
      mode: 'Remoto',
      salary: 'R$ 15k – 22k',
      stack: ['React', 'TypeScript', 'GraphQL', 'AWS'],
      area: 'Frontend',
      posted: '2 dias atrás',
      postedDate: '2025-02-22',
      desc: 'Buscamos um desenvolvedor React sênior para trabalhar no time de produto, desenvolvendo interfaces de alta performance para milhões de usuários. Você terá autonomia técnica e participará ativamente de decisões de arquitetura.',
      reqs: [
        '5+ anos com React e ecossistema moderno',
        'Inglês avançado (leitura e reuniões)',
        'Experiência sólida com TypeScript',
        'Conhecimento em GraphQL e REST',
        'Familiaridade com testes (Jest, Cypress)',
      ],
      benefits: ['Vale alimentação R$ 800/mês', 'Plano de saúde Amil', 'Gympass', 'Stock options', 'Home office total'],
      level: 'Sênior',
    },
    {
      id: 2,
      title: 'Backend Engineer (Node.js)',
      company: 'Itaú Digital',
      logo: '🏦',
      type: 'PJ',
      mode: 'Híbrido',
      salary: 'R$ 12k – 18k',
      stack: ['Node.js', 'PostgreSQL', 'Kubernetes', 'Docker'],
      area: 'Backend',
      posted: '1 dia atrás',
      postedDate: '2025-02-23',
      desc: 'Oportunidade para engenheiro backend em projeto de open banking, trabalhando com microsserviços e alta disponibilidade. Stack moderna em ambiente de missão crítica com bilhões em transações.',
      reqs: [
        'Node.js avançado (4+ anos)',
        'Conhecimento em arquitetura de microsserviços',
        'SQL/PostgreSQL com foco em performance',
        'Docker e Kubernetes',
        'Experiência com filas (RabbitMQ ou Kafka)',
      ],
      benefits: ['Contrato PJ 12h/dia', 'Possibilidade CLT', 'Auxílio home office', 'Seguro de vida'],
      level: 'Pleno/Sênior',
    },
    {
      id: 3,
      title: 'Freelance: Desenvolvedor Flutter',
      company: 'StartupXYZ',
      logo: '📱',
      type: 'Freelance',
      mode: 'Remoto',
      salary: 'R$ 80 – 120/h',
      stack: ['Flutter', 'Dart', 'Firebase', 'REST API'],
      area: 'Mobile',
      posted: 'Hoje',
      postedDate: '2025-02-24',
      desc: 'Projeto de 3 meses para desenvolvimento de app mobile iOS/Android do zero, incluindo design system, autenticação, pagamentos e notificações push. Pagamento por hora ou fechamento de projeto.',
      reqs: [
        'Flutter 2+ anos com apps publicados',
        'Firebase (Auth, Firestore, FCM)',
        'Integrações com APIs REST',
        'Portfolio com apps nas stores',
        'Disponibilidade 30h/semana',
      ],
      benefits: ['Pagamento quinzenal', 'Possibilidade de renovação', 'Flexibilidade total de horário'],
      level: 'Pleno/Sênior',
    },
    {
      id: 4,
      title: 'DevOps / SRE Engineer',
      company: 'AWS Partner Brasil',
      logo: '☁️',
      type: 'CLT',
      mode: 'Remoto',
      salary: 'R$ 18k – 26k',
      stack: ['AWS', 'Terraform', 'Kubernetes', 'CI/CD'],
      area: 'DevOps',
      posted: '3 dias atrás',
      postedDate: '2025-02-21',
      desc: 'Vaga para DevOps/SRE em empresa parceira AWS, com foco em automação de infraestrutura, observabilidade e redução de toil. Cultura forte de blameless postmortem e melhoria contínua.',
      reqs: [
        'AWS Certified Solutions Architect (Associate+)',
        'Terraform / Ansible para IaC',
        'Kubernetes em produção',
        'Monitoramento: Datadog, Prometheus, Grafana',
        'Scripting: Python ou Go',
      ],
      benefits: ['VR R$ 900/mês', 'Plano de saúde Bradesco', 'Certificações pagas pela empresa', '13º e férias'],
      level: 'Sênior',
    },
    {
      id: 5,
      title: 'Data Scientist — ML/AI',
      company: 'iFood Tech',
      logo: '🍔',
      type: 'CLT',
      mode: 'Remoto',
      salary: 'R$ 16k – 24k',
      stack: ['Python', 'TensorFlow', 'PySpark', 'BigQuery'],
      area: 'Data',
      posted: '1 semana atrás',
      postedDate: '2025-02-17',
      desc: 'Cientista de dados para trabalhar com modelos de ML em recomendação e logística, impactando milhões de pedidos diários. Você usará dados em escala para resolver problemas reais de negócio.',
      reqs: [
        'Python avançado + ML Libraries (sklearn, TF, PyTorch)',
        'Deep Learning (modelos de recomendação/ranking)',
        'Experiência com Big Data (Spark, BigQuery)',
        'Estatística e probabilidade sólidas',
        'Publicações ou projetos open source em ML (diferencial)',
      ],
      benefits: ['Participação nos lucros', 'Stock options', 'Plano de saúde', 'Subsídio de educação R$ 500/mês'],
      level: 'Pleno/Sênior',
    },
    {
      id: 6,
      title: 'UX/UI Designer — Produto',
      company: 'Conta Simples',
      logo: '🎨',
      type: 'PJ',
      mode: 'Remoto',
      salary: 'R$ 8k – 13k',
      stack: ['Figma', 'Framer', 'Design System', 'UX Research'],
      area: 'UX',
      posted: '4 dias atrás',
      postedDate: '2025-02-20',
      desc: 'Designer de produto para criar experiências excepcionais em fintech B2B, desde pesquisa qualitativa até prototipagem de alta fidelidade. Você colaborará diretamente com engenharia e produto.',
      reqs: [
        'Figma avançado (components, variants, auto layout)',
        'UX Research (entrevistas, testes de usabilidade)',
        'Experiência com Design Systems',
        'Portfolio forte com projetos de produto digital',
        'Noção de front-end (HTML/CSS) como diferencial',
      ],
      benefits: ['Horário flexível', 'Auxílio home office', 'Budget de cursos', 'Ambiente descontraído'],
      level: 'Pleno',
    },
    {
      id: 7,
      title: 'Freelance: API REST + Integrações',
      company: 'Agência DevPlus',
      logo: '🔌',
      type: 'Freelance',
      mode: 'Remoto',
      salary: 'R$ 5.000 – 8.000 (projeto)',
      stack: ['Node.js', 'REST API', 'Webhooks', 'MongoDB'],
      area: 'Backend',
      posted: 'Hoje',
      postedDate: '2025-02-24',
      desc: 'Desenvolvimento de API REST para integração entre ERP legado e plataforma de e-commerce. Projeto com escopo definido, documentação exigida e prazo de 45 dias.',
      reqs: [
        'Node.js / Express ou Fastify',
        'APIs REST com documentação Swagger',
        'MongoDB / Mongoose',
        'Experiência com integrações de ERP (SAP, TOTVS)',
        'Git e entregas em sprints',
      ],
      benefits: ['50% upfront', '50% na entrega', 'Possibilidade de projetos futuros'],
      level: 'Pleno/Sênior',
    },
    {
      id: 8,
      title: 'Tech Lead Fullstack',
      company: 'VTEX',
      logo: '⚡',
      type: 'CLT',
      mode: 'Remoto',
      salary: 'R$ 25k – 35k',
      stack: ['React', 'Node.js', 'TypeScript', 'System Design'],
      area: 'Frontend',
      posted: '5 dias atrás',
      postedDate: '2025-02-19',
      desc: 'Tech Lead para liderar time de 6 engenheiros em produto de e-commerce enterprise, com responsabilidade técnica, mentoria e alinhamento estratégico com produto e design.',
      reqs: [
        '8+ anos de experiência em desenvolvimento',
        'Liderança técnica e mentoria de devs',
        'React + Node.js avançados',
        'Inglês fluente (time internacional)',
        'Experiência com System Design e arquitetura',
      ],
      benefits: ['Stock options', 'Plano saúde + odonto premium', 'Bônus anual', 'Equipamento top fornecido', 'CLT com salário em dólar'],
      level: 'Tech Lead',
    },
    {
      id: 9,
      title: 'QA Engineer — Automação',
      company: 'PicPay',
      logo: '💚',
      type: 'CLT',
      mode: 'Híbrido',
      salary: 'R$ 9k – 14k',
      stack: ['Cypress', 'Jest', 'Python', 'Selenium'],
      area: 'QA',
      posted: '6 dias atrás',
      postedDate: '2025-02-18',
      desc: 'Engenheiro de qualidade para construir e manter suíte de testes automatizados em produto fintech com 30M+ usuários. Você será referência de qualidade para o squad.',
      reqs: [
        'Automação com Cypress ou Playwright',
        'Testes de API (Postman, Jest, Supertest)',
        'Python para scripts e ferramentas',
        'Conhecimento de CI/CD',
        'Experiência em metodologias ágeis',
      ],
      benefits: ['VA + VR', 'Plano de saúde Amil', 'Day off aniversário', 'WFH full'],
      level: 'Pleno',
    },
    {
      id: 10,
      title: 'Engenheiro de Segurança (AppSec)',
      company: 'Mercado Livre',
      logo: '🟡',
      type: 'CLT',
      mode: 'Remoto',
      salary: 'R$ 22k – 32k',
      stack: ['OWASP', 'SAST/DAST', 'Python', 'Cloud Security'],
      area: 'Segurança',
      posted: '3 dias atrás',
      postedDate: '2025-02-21',
      desc: 'Engenheiro de segurança de aplicações para liderar iniciativas de AppSec, realizar threat modeling, code review de segurança e construir pipelines de análise estática/dinâmica.',
      reqs: [
        'Pentest / OWASP Top 10',
        'SAST (Semgrep, SonarQube) e DAST',
        'Threat Modeling (STRIDE)',
        'Segurança em nuvem (AWS/GCP)',
        'Certificação OSCP, CEH ou equivalente (diferencial)',
      ],
      benefits: ['Salário em USD', 'Stock options', 'Plano saúde família', 'Gympass elite', 'Educação corporativa'],
      level: 'Sênior',
    },
  ];

  /* ---- CREDIT PACKAGES ---- */
  const creditPackages = [
    {
      id: 'starter',
      credits: 50,
      price: 9.90,
      label: 'Iniciante',
      featured: false,
      features: [
        'Ver detalhes de 25 vagas',
        '10 candidaturas',
        '2 publicações de vaga',
        'Sem prazo de validade',
      ],
    },
    {
      id: 'pro',
      credits: 150,
      price: 24.90,
      label: 'Profissional',
      featured: true,
      features: [
        'Ver detalhes de 75 vagas',
        '30 candidaturas',
        '7 publicações de vaga',
        'Sem prazo de validade',
        'Economia de 16%',
      ],
    },
    {
      id: 'business',
      credits: 400,
      price: 59.90,
      label: 'Empresarial',
      featured: false,
      features: [
        'Ver detalhes de 200 vagas',
        '80 candidaturas',
        '20 publicações de vaga',
        'Sem prazo de validade',
        'Economia de 25%',
      ],
    },
  ];

  /* ---- CREDIT COSTS ---- */
  const COSTS = {
    VIEW_JOB:     2,
    APPLY_JOB:    5,
    POST_JOB:    20,
    VIEW_RESUME:  3,
  };

  /* ---- JOB METHODS ---- */
  const getAllJobs = () => [...jobs];

  const getJobById = (id) => jobs.find(j => j.id === id) || null;

  const filterJobs = ({ search = '', type = '', area = '' } = {}) => {
    return jobs.filter(j => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        j.title.toLowerCase().includes(q) ||
        j.company.toLowerCase().includes(q) ||
        j.stack.some(s => s.toLowerCase().includes(q));
      const matchType = !type || j.type === type || j.mode === type;
      const matchArea = !area || j.area === area;
      return matchSearch && matchType && matchArea;
    });
  };

  const addJob = (jobData) => {
    const newJob = {
      id: jobs.length + Date.now(),
      posted: 'Agora mesmo',
      postedDate: new Date().toISOString().split('T')[0],
      logo: '🏢',
      level: 'A combinar',
      benefits: [],
      ...jobData,
    };
    jobs.unshift(newJob);
    return newJob;
  };

  return {
    getAllJobs,
    getJobById,
    filterJobs,
    addJob,
    getTagColor,
    creditPackages,
    COSTS,
  };

})();
