-- ============================================================
-- TECHFREELA — create_tables.sql
-- Script completo de criação do banco de dados MySQL
-- Banco: railway (MySQL)
-- ============================================================
-- Execute com:
--   mysql -h shortline.proxy.rlwy.net -P 41195 -u root -p railway < create_tables.sql
-- Ou via Python:
--   python setup_db.py
-- ============================================================

-- Garantir que estamos usando o banco correto
USE railway;

-- Desabilitar verificação de FK durante setup
SET FOREIGN_KEY_CHECKS = 0;

-- ============================================================
-- DROP TABLES (ordem inversa das dependências)
-- ============================================================
DROP TABLE IF EXISTS payments;
DROP TABLE IF EXISTS admin_config;
DROP TABLE IF EXISTS credit_events;
DROP TABLE IF EXISTS applications;
DROP TABLE IF EXISTS portfolio_items;
DROP TABLE IF EXISTS experiences;
DROP TABLE IF EXISTS jobs;
DROP TABLE IF EXISTS users;

-- Reabilitar FK
SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- TABELA: users
-- ============================================================
CREATE TABLE users (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    name        VARCHAR(120)    NOT NULL,
    email       VARCHAR(120)    NOT NULL,
    password    VARCHAR(255)    NOT NULL COMMENT 'Hash bcrypt da senha',
    type        ENUM('dev','company') NOT NULL DEFAULT 'dev' COMMENT 'dev = profissional, company = empresa',

    -- Dados de perfil
    role        VARCHAR(80)     NULL     COMMENT 'Cargo ou área ex: Fullstack Developer',
    bio         TEXT            NULL     COMMENT 'Resumo profissional',
    skills      JSON            NULL     COMMENT 'Array de tecnologias ex: ["React","Node.js"]',
    linkedin    VARCHAR(200)    NULL,
    github      VARCHAR(200)    NULL,
    avatar_url  VARCHAR(500)    NULL,

    -- Créditos
    credits     INT UNSIGNED    NOT NULL DEFAULT 10 COMMENT 'Saldo de créditos do usuário',

    -- Controle
    is_active   TINYINT(1)      NOT NULL DEFAULT 1,
    is_admin    TINYINT(1)      NOT NULL DEFAULT 0 COMMENT 'Flag de administrador da plataforma',
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    -- Chaves e índices
    PRIMARY KEY (id),
    UNIQUE  KEY uq_users_email   (email),
    INDEX        idx_users_type   (type),
    INDEX        idx_users_active (is_active)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Usuários da plataforma (profissionais e empresas)';


-- ============================================================
-- TABELA: jobs
-- ============================================================
CREATE TABLE jobs (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    owner_id    INT UNSIGNED    NOT NULL COMMENT 'FK para users.id (quem publicou)',

    -- Dados da vaga
    title       VARCHAR(120)    NOT NULL COMMENT 'Título do cargo',
    company     VARCHAR(120)    NOT NULL COMMENT 'Nome da empresa',
    logo        VARCHAR(8)      NOT NULL DEFAULT '🏢' COMMENT 'Emoji representando a empresa',
    type        ENUM('CLT','PJ','Freelance','Estágio','Temporário') NOT NULL,
    mode        ENUM('Remoto','Presencial','Híbrido') NOT NULL,
    salary      VARCHAR(80)     NULL     COMMENT 'Faixa salarial ex: R$ 8k-12k',
    location    VARCHAR(80)     NULL     COMMENT 'Cidade/Estado',
    area        VARCHAR(60)     NULL     COMMENT 'Área de atuação ex: Frontend, Backend',
    level       VARCHAR(60)     NULL     COMMENT 'Nível ex: Sênior, Pleno, Tech Lead',
    stack       JSON            NULL     COMMENT 'Array de tecnologias ex: ["React","TypeScript"]',

    -- Conteúdo
    description TEXT            NOT NULL COMMENT 'Descrição completa da vaga',
    requirements JSON           NULL     COMMENT 'Array de requisitos',
    benefits     JSON           NULL     COMMENT 'Array de benefícios',

    -- Controle
    active      TINYINT(1)      NOT NULL DEFAULT 1,
    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    expires_at  DATETIME        NULL     COMMENT 'Data de expiração (30 dias após publicação)',

    -- Chaves e índices
    PRIMARY KEY (id),
    CONSTRAINT fk_jobs_owner
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_jobs_owner   (owner_id),
    INDEX idx_jobs_active  (active),
    INDEX idx_jobs_type    (type),
    INDEX idx_jobs_mode    (mode),
    INDEX idx_jobs_area    (area),
    INDEX idx_jobs_expires (expires_at),
    FULLTEXT INDEX ft_jobs_search (title, company, description)
        COMMENT 'Índice fulltext para busca de vagas'
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Vagas publicadas na plataforma';


-- ============================================================
-- TABELA: experiences
-- ============================================================
CREATE TABLE experiences (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED    NOT NULL COMMENT 'FK para users.id',

    title       VARCHAR(120)    NOT NULL COMMENT 'Cargo ex: Desenvolvedor Sênior',
    company     VARCHAR(120)    NOT NULL COMMENT 'Nome da empresa',
    location    VARCHAR(80)     NULL     COMMENT 'Local ex: Remoto, São Paulo SP',
    start_date  VARCHAR(20)     NULL     COMMENT 'Data início ex: Jan 2022',
    end_date    VARCHAR(20)     NULL     COMMENT 'Data fim ex: Atual, Dez 2024',
    description TEXT            NULL     COMMENT 'Descrição das atividades e conquistas',

    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_exp_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_exp_user (user_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Experiências profissionais dos candidatos';


-- ============================================================
-- TABELA: portfolio_items
-- ============================================================
CREATE TABLE portfolio_items (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED    NOT NULL COMMENT 'FK para users.id',

    emoji       VARCHAR(8)      NOT NULL DEFAULT '💡' COMMENT 'Emoji do projeto',
    name        VARCHAR(120)    NOT NULL COMMENT 'Nome do projeto',
    stack       VARCHAR(200)    NULL     COMMENT 'Tecnologias usadas ex: React + Node.js',
    description TEXT            NULL     COMMENT 'Descrição do projeto e resultados',
    link        VARCHAR(500)    NULL     COMMENT 'URL do projeto (GitHub, demo...)',

    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_portfolio_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_portfolio_user (user_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Projetos do portfólio dos candidatos';


-- ============================================================
-- TABELA: applications
-- ============================================================
CREATE TABLE applications (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED    NOT NULL COMMENT 'FK para users.id (candidato)',
    job_id      INT UNSIGNED    NOT NULL COMMENT 'FK para jobs.id',

    cover_note  TEXT            NULL     COMMENT 'Mensagem opcional do candidato',
    status      ENUM('pending','viewed','accepted','rejected')
                                NOT NULL DEFAULT 'pending',

    applied_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_app_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT fk_app_job
        FOREIGN KEY (job_id)  REFERENCES jobs(id)  ON DELETE CASCADE ON UPDATE CASCADE,
    UNIQUE KEY uq_app_user_job (user_id, job_id) COMMENT 'Evita candidatura dupla',
    INDEX idx_app_user   (user_id),
    INDEX idx_app_job    (job_id),
    INDEX idx_app_status (status)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Candidaturas dos profissionais às vagas';


-- ============================================================
-- TABELA: credit_events
-- ============================================================
CREATE TABLE credit_events (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    user_id     INT UNSIGNED    NOT NULL COMMENT 'FK para users.id',

    type        ENUM('welcome','purchase','spent','refund','bonus')
                                NOT NULL COMMENT 'Tipo do evento de crédito',
    amount      INT             NOT NULL COMMENT 'Positivo = adicionado, Negativo = gasto',
    reason      VARCHAR(200)    NULL     COMMENT 'Descrição do motivo',
    balance     INT UNSIGNED    NOT NULL COMMENT 'Saldo do usuário após o evento',
    reference   VARCHAR(100)    NULL     COMMENT 'ID externo ex: Stripe payment_intent',

    created_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    CONSTRAINT fk_credit_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_credit_user (user_id),
    INDEX idx_credit_type (type),
    INDEX idx_credit_date (created_at)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Histórico de todos os eventos de crédito';


-- ============================================================
-- DADOS DE EXEMPLO (seed)
-- ============================================================

-- Usuário demo: profissional
INSERT INTO users (name, email, password, type, role, bio, skills, linkedin, github, credits)
VALUES (
    'João Dev',
    'joao@techfreela.com',
    '$2b$12$demo_hash_placeholder',
    'dev',
    'Fullstack Developer',
    'Desenvolvedor fullstack com 5 anos de experiência em React, Node.js e AWS.',
    '["React","Node.js","TypeScript","AWS","PostgreSQL"]',
    'linkedin.com/in/joaodev',
    'github.com/joaodev',
    50
);

-- Usuário demo: empresa
INSERT INTO users (name, email, password, type, role, credits)
VALUES (
    'Tech Corp',
    'empresa@techcorp.com',
    '$2b$12$demo_hash_placeholder',
    'company',
    'Empresa de Tecnologia',
    100
);

-- Vaga de exemplo
INSERT INTO jobs (
    owner_id, title, company, logo, type, mode, salary,
    location, area, level, stack, description, requirements, benefits, expires_at
) VALUES (
    2,
    'Senior React Developer',
    'Tech Corp',
    '💜',
    'CLT',
    'Remoto',
    'R$ 15k – 22k',
    'São Paulo, SP',
    'Frontend',
    'Sênior',
    '["React","TypeScript","GraphQL","AWS"]',
    'Buscamos um desenvolvedor React sênior para trabalhar no time de produto, desenvolvendo interfaces de alta performance.',
    '["5+ anos com React","Inglês avançado","TypeScript sólido","Experiência com GraphQL"]',
    '["Vale alimentação R$ 800/mês","Plano de saúde","Gympass","Stock options"]',
    DATE_ADD(NOW(), INTERVAL 30 DAY)
);

-- Experiência do João
INSERT INTO experiences (user_id, title, company, location, start_date, end_date, description)
VALUES (
    1,
    'Desenvolvedor Fullstack Sênior',
    'Empresa XYZ',
    'Remoto',
    'Jan 2022',
    'Atual',
    'Desenvolvimento de aplicações React/Node.js para fintech, com foco em performance e segurança.'
);

-- Portfólio do João
INSERT INTO portfolio_items (user_id, emoji, name, stack, description, link)
VALUES
    (1, '🛒', 'E-commerce Platform', 'React + Node.js + MongoDB', 'Plataforma completa de e-commerce com painel admin.', 'https://github.com/joaodev/ecommerce'),
    (1, '📊', 'Analytics Dashboard',  'Vue.js + D3.js + Python',  'Dashboard de analytics em tempo real.',              'https://github.com/joaodev/dashboard');

-- Evento de crédito de boas-vindas
INSERT INTO credit_events (user_id, type, amount, reason, balance)
VALUES
    (1, 'welcome',  10, 'Bônus de boas-vindas',          10),
    (1, 'purchase', 40, 'Compra pacote Iniciante (50cr)', 50),
    (2, 'welcome',  10, 'Bônus de boas-vindas',          10),
    (2, 'purchase', 90, 'Compra pacote Pro (150cr)',     100);

-- ============================================================
-- TABELA: payments
-- ============================================================
CREATE TABLE payments (
    id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    user_id             INT UNSIGNED    NOT NULL COMMENT 'FK para users.id',

    package_id          VARCHAR(50)     NOT NULL COMMENT 'ID do pacote (starter/pro/business)',
    credits             INT UNSIGNED    NOT NULL COMMENT 'Créditos que serão concedidos',
    amount_brl          VARCHAR(20)     NOT NULL COMMENT 'Valor em BRL cobrado',
    payment_method      ENUM('pix','credit_card','debit_card','crypto')
                                        NOT NULL DEFAULT 'pix',

    -- NOWPayments
    status              ENUM('pending','waiting','confirming','confirmed','finished','failed','expired','refunded')
                                        NOT NULL DEFAULT 'pending',
    nowpayments_id      VARCHAR(100)    NULL UNIQUE COMMENT 'payment_id da NOWPayments',
    invoice_id          VARCHAR(100)    NULL       COMMENT 'invoice_id da NOWPayments',
    invoice_url         VARCHAR(500)    NULL       COMMENT 'URL do checkout da NOWPayments',
    ipn_callback_secret VARCHAR(100)    NULL       COMMENT 'Segredo para validar IPN',

    created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    paid_at             DATETIME        NULL COMMENT 'Timestamp do pagamento confirmado',

    PRIMARY KEY (id),
    CONSTRAINT fk_payment_user
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
    INDEX idx_payment_user   (user_id),
    INDEX idx_payment_status (status),
    INDEX idx_payment_date   (created_at),
    UNIQUE KEY uq_payment_nowpayments (nowpayments_id)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Pagamentos via NOWPayments';


-- ============================================================
-- TABELA: admin_config
-- ============================================================
CREATE TABLE admin_config (
    id          INT UNSIGNED    NOT NULL AUTO_INCREMENT,
    `key`       VARCHAR(100)    NOT NULL UNIQUE COMMENT 'Chave de configuração',
    value       TEXT            NULL              COMMENT 'Valor da configuração',
    updated_at  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

    PRIMARY KEY (id),
    UNIQUE KEY uq_config_key (`key`)
) ENGINE=InnoDB
  DEFAULT CHARSET=utf8mb4
  COLLATE=utf8mb4_unicode_ci
  COMMENT='Configurações administrativas da plataforma';

-- Configurações padrão
INSERT INTO admin_config (`key`, value) VALUES
    ('nowpayments_api_key',    ''),
    ('nowpayments_ipn_secret', ''),
    ('nowpayments_sandbox',    'true'),
    ('receiving_wallet',       ''),
    ('receiving_currency',     'usdttrc20');

-- ============================================================
-- VIEWS ÚTEIS
-- ============================================================

-- View: vagas ativas com contagem de candidaturas
CREATE OR REPLACE VIEW vw_active_jobs AS
SELECT
    j.id,
    j.title,
    j.company,
    j.logo,
    j.type,
    j.mode,
    j.salary,
    j.area,
    j.level,
    j.stack,
    j.active,
    j.created_at,
    j.expires_at,
    u.name      AS owner_name,
    u.email     AS owner_email,
    COUNT(a.id) AS applications_count
FROM jobs j
INNER JOIN users u ON u.id = j.owner_id
LEFT  JOIN applications a ON a.job_id = j.id
WHERE j.active = 1
  AND (j.expires_at IS NULL OR j.expires_at > NOW())
GROUP BY j.id;

-- View: resumo de créditos por usuário
CREATE OR REPLACE VIEW vw_user_credits_summary AS
SELECT
    u.id,
    u.name,
    u.email,
    u.type,
    u.credits AS current_balance,
    COALESCE(SUM(CASE WHEN ce.amount > 0 THEN ce.amount ELSE 0 END), 0) AS total_earned,
    COALESCE(SUM(CASE WHEN ce.amount < 0 THEN ABS(ce.amount) ELSE 0 END), 0) AS total_spent,
    COUNT(CASE WHEN ce.type = 'purchase' THEN 1 END) AS purchases_count
FROM users u
LEFT JOIN credit_events ce ON ce.user_id = u.id
GROUP BY u.id;

-- View: candidaturas com detalhes
CREATE OR REPLACE VIEW vw_applications_detail AS
SELECT
    a.id            AS application_id,
    a.status,
    a.applied_at,
    a.cover_note,
    u.id            AS candidate_id,
    u.name          AS candidate_name,
    u.email         AS candidate_email,
    u.role          AS candidate_role,
    u.skills        AS candidate_skills,
    j.id            AS job_id,
    j.title         AS job_title,
    j.company,
    j.type          AS job_type,
    j.mode          AS job_mode
FROM applications a
INNER JOIN users u ON u.id = a.user_id
INNER JOIN jobs  j ON j.id = a.job_id;

-- ============================================================
-- VERIFICAÇÃO FINAL
-- ============================================================
SELECT 'Tabelas criadas:' AS status;
SHOW TABLES;

SELECT 'Contagem de registros:' AS status;
SELECT 'users'         AS tabela, COUNT(*) AS registros FROM users
UNION ALL
SELECT 'jobs',                    COUNT(*)               FROM jobs
UNION ALL
SELECT 'experiences',             COUNT(*)               FROM experiences
UNION ALL
SELECT 'portfolio_items',         COUNT(*)               FROM portfolio_items
UNION ALL
SELECT 'applications',            COUNT(*)               FROM applications
UNION ALL
SELECT 'credit_events',           COUNT(*)               FROM credit_events;