/* ============================================================
   TECHFREELA — state.js
   Estado global da aplicação (simulated frontend state)
   ============================================================ */

const State = (() => {

  let _state = {
    loggedIn: false,
    user: null,          // { id, name, email, role, type: 'dev'|'company', bio, skills, linkedin, github }
    credits: 0,
    appliedJobs: [],     // array of job IDs
    postedJobs: [],      // array of job IDs posted by this user
    portfolio: [],       // array of portfolio objects
    experiences: [],     // array of experience objects
  };

  // Default profile data (used when user logs in for demo)
  const DEFAULT_PROFILE = {
    name: 'João Dev',
    role: 'Fullstack Developer',
    bio: 'Desenvolvedor fullstack com 5 anos de experiência em React, Node.js e AWS. Apaixonado por performance e arquiteturas escaláveis.',
    skills: ['React', 'Node.js', 'TypeScript', 'AWS', 'PostgreSQL'],
    linkedin: 'linkedin.com/in/joaodev',
    github: 'github.com/joaodev',
  };

  const DEFAULT_EXPERIENCES = [
    {
      id: 1,
      title: 'Desenvolvedor Fullstack Sênior',
      company: 'Empresa XYZ',
      location: 'Remoto',
      start: 'Jan 2022',
      end: 'Atual',
      desc: 'Desenvolvimento de aplicações React/Node.js para fintech, com foco em performance e segurança. Liderança técnica de 3 devs.',
    },
    {
      id: 2,
      title: 'Desenvolvedor Frontend Pleno',
      company: 'Startup ABC',
      location: 'São Paulo, SP',
      start: 'Mar 2020',
      end: 'Dez 2021',
      desc: 'Construção do produto principal usando React e Next.js. Integração com APIs REST e GraphQL. Redução de 40% no tempo de carregamento.',
    },
  ];

  const DEFAULT_PORTFOLIO = [
    { id: 1, emoji: '🛒', name: 'E-commerce Platform', stack: 'React + Node.js + MongoDB',  desc: 'Plataforma completa de e-commerce com painel admin.', link: '' },
    { id: 2, emoji: '📊', name: 'Analytics Dashboard',  stack: 'Vue.js + D3.js + Python',    desc: 'Dashboard de analytics em tempo real com gráficos.', link: '' },
    { id: 3, emoji: '📱', name: 'Food Delivery App',    stack: 'React Native + Firebase',     desc: 'App mobile de delivery com rastreio em tempo real.', link: '' },
  ];

  /* ---- GETTERS ---- */
  const get = () => ({ ..._state });

  const isLoggedIn  = () => _state.loggedIn;
  const getUser     = () => _state.user;
  const getCredits  = () => _state.credits;
  const getApplied  = () => [..._state.appliedJobs];
  const getPosted   = () => [..._state.postedJobs];
  const getPortfolio   = () => [..._state.portfolio];
  const getExperiences = () => [..._state.experiences];

  const hasApplied  = (jobId) => _state.appliedJobs.includes(jobId);

  /* ---- AUTH ---- */
  const login = (userData) => {
    _state.loggedIn   = true;
    _state.user       = { ...DEFAULT_PROFILE, ...userData, type: userData.type || 'dev' };
    _state.credits    = userData.credits ?? 10;
    _state.experiences = [...DEFAULT_EXPERIENCES];
    _state.portfolio   = [...DEFAULT_PORTFOLIO];
    Events.emit('auth:change', _state.user);
    Events.emit('credits:change', _state.credits);
  };

  const logout = () => {
    _state = { loggedIn: false, user: null, credits: 0, appliedJobs: [], postedJobs: [], portfolio: [], experiences: [] };
    Events.emit('auth:change', null);
    Events.emit('credits:change', 0);
  };

  /* ---- CREDITS ---- */
  const addCredits = (amount) => {
    _state.credits += amount;
    Events.emit('credits:change', _state.credits);
    return _state.credits;
  };

  const spendCredits = (amount, reason) => {
    if (_state.credits < amount) return false;
    _state.credits -= amount;
    Events.emit('credits:change', _state.credits);
    Events.emit('credits:spent', { amount, reason, balance: _state.credits });
    return true;
  };

  const canAfford = (amount) => _state.credits >= amount;

  const setCredits = (amount) => {
    _state.credits = amount;
    Events.emit('credits:change', _state.credits);
  };

  const isAdmin = () => _state.user && _state.user.is_admin === true;

  /* ---- JOBS ---- */
  const applyJob = (jobId) => {
    if (hasApplied(jobId)) return false;
    _state.appliedJobs.push(jobId);
    Events.emit('job:applied', jobId);
    return true;
  };

  const postJob = (jobId) => {
    _state.postedJobs.push(jobId);
    Events.emit('job:posted', jobId);
  };

  /* ---- PROFILE ---- */
  const updateUser = (data) => {
    _state.user = { ..._state.user, ...data };
    Events.emit('profile:updated', _state.user);
  };

  const addExperience = (exp) => {
    const item = { id: Date.now(), ...exp };
    _state.experiences.unshift(item);
    Events.emit('profile:exp-added', item);
    return item;
  };

  const addPortfolio = (proj) => {
    const item = { id: Date.now(), ...proj };
    _state.portfolio.unshift(item);
    Events.emit('profile:portfolio-added', item);
    return item;
  };

  return {
    get, isLoggedIn, getUser, getCredits,
    getApplied, getPosted, getPortfolio, getExperiences,
    hasApplied, canAfford, isAdmin,
    login, logout,
    addCredits, spendCredits, setCredits,
    applyJob, postJob,
    updateUser, addExperience, addPortfolio,
  };

})();

/* ---- SIMPLE EVENT BUS ---- */
const Events = (() => {
  const listeners = {};

  const on = (event, cb) => {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(cb);
  };

  const off = (event, cb) => {
    if (!listeners[event]) return;
    listeners[event] = listeners[event].filter(fn => fn !== cb);
  };

  const emit = (event, data) => {
    (listeners[event] || []).forEach(cb => cb(data));
  };

  return { on, off, emit };
})();