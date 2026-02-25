"""
============================================================
TECHFREELA — setup_db.py
Script de setup completo do banco MySQL
============================================================
Execute:
    python setup_db.py

Isso irá:
  1. Conectar ao MySQL Railway
  2. Criar todas as tabelas (DROP + CREATE)
  3. Inserir dados de exemplo
  4. Verificar a estrutura criada
============================================================
"""

import sys
import hashlib
import json
from datetime import datetime, timedelta

# Tentar importar SQLAlchemy
try:
    from sqlalchemy import (
        create_engine, text, Column, Integer, String, Text,
        DateTime, Enum, JSON, Boolean, ForeignKey, UniqueConstraint,
        Index, SmallInteger
    )
    from sqlalchemy.orm import declarative_base, relationship, sessionmaker
    from sqlalchemy.dialects.mysql import INTEGER as MYSQL_INT
    print("✓ SQLAlchemy disponível")
except ImportError:
    print("✗ SQLAlchemy não encontrado.")
    print("  Execute: pip install sqlalchemy pymysql")
    sys.exit(1)

try:
    import pymysql
    pymysql.install_as_MySQLdb()
    print("✓ PyMySQL disponível")
except ImportError:
    print("✗ PyMySQL não encontrado.")
    print("  Execute: pip install pymysql")
    sys.exit(1)

# ============================================================
# CONFIG
# ============================================================

DATABASE_URL = (
    "mysql+pymysql://root:UEgcKqkJhSyRgJHqiaoUwuaunXNWLTnH"
    "@shortline.proxy.rlwy.net:41195/railway"
    "?charset=utf8mb4"
)

Base = declarative_base()

# ============================================================
# MODELS
# ============================================================

class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(String(120), nullable=False)
    email      = Column(String(120), nullable=False, unique=True)
    password   = Column(String(255), nullable=False)
    type       = Column(Enum("dev", "company", name="user_type_enum"), nullable=False, default="dev")

    role       = Column(String(80),  nullable=True)
    bio        = Column(Text,        nullable=True)
    skills     = Column(JSON,        nullable=True)
    linkedin   = Column(String(200), nullable=True)
    github     = Column(String(200), nullable=True)
    avatar_url = Column(String(500), nullable=True)

    credits    = Column(Integer, nullable=False, default=10)
    is_active  = Column(Boolean, nullable=False, default=True)

    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    experiences   = relationship("Experience",   back_populates="user", cascade="all, delete-orphan")
    portfolio     = relationship("PortfolioItem", back_populates="user", cascade="all, delete-orphan")
    jobs_posted   = relationship("Job",          back_populates="owner")
    applications  = relationship("Application",  back_populates="candidate")
    credit_events = relationship("CreditEvent",  back_populates="user")

    __table_args__ = (
        Index("idx_users_type",   "type"),
        Index("idx_users_active", "is_active"),
    )


class Job(Base):
    __tablename__ = "jobs"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    owner_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    title       = Column(String(120), nullable=False)
    company     = Column(String(120), nullable=False)
    logo        = Column(String(8),   nullable=False, default="🏢")
    type        = Column(Enum("CLT","PJ","Freelance","Estágio","Temporário", name="job_type_enum"), nullable=False)
    mode        = Column(Enum("Remoto","Presencial","Híbrido", name="job_mode_enum"), nullable=False)
    salary      = Column(String(80),  nullable=True)
    location    = Column(String(80),  nullable=True)
    area        = Column(String(60),  nullable=True)
    level       = Column(String(60),  nullable=True)
    stack       = Column(JSON,        nullable=True)

    description  = Column(Text,  nullable=False)
    requirements = Column(JSON,  nullable=True)
    benefits     = Column(JSON,  nullable=True)

    active      = Column(Boolean,  nullable=False, default=True)
    created_at  = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at  = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at  = Column(DateTime, nullable=True)

    owner        = relationship("User",        back_populates="jobs_posted")
    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_jobs_owner",   "owner_id"),
        Index("idx_jobs_active",  "active"),
        Index("idx_jobs_type",    "type"),
        Index("idx_jobs_mode",    "mode"),
        Index("idx_jobs_area",    "area"),
        Index("idx_jobs_expires", "expires_at"),
    )


class Experience(Base):
    __tablename__ = "experiences"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    title       = Column(String(120), nullable=False)
    company     = Column(String(120), nullable=False)
    location    = Column(String(80),  nullable=True)
    start_date  = Column(String(20),  nullable=True)
    end_date    = Column(String(20),  nullable=True)
    description = Column(Text,        nullable=True)
    created_at  = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="experiences")

    __table_args__ = (Index("idx_exp_user", "user_id"),)


class PortfolioItem(Base):
    __tablename__ = "portfolio_items"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    user_id     = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    emoji       = Column(String(8),   nullable=False, default="💡")
    name        = Column(String(120), nullable=False)
    stack       = Column(String(200), nullable=True)
    description = Column(Text,        nullable=True)
    link        = Column(String(500), nullable=True)
    created_at  = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="portfolio")

    __table_args__ = (Index("idx_portfolio_user", "user_id"),)


class Application(Base):
    __tablename__ = "applications"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    job_id     = Column(Integer, ForeignKey("jobs.id",  ondelete="CASCADE"), nullable=False)

    cover_note = Column(Text, nullable=True)
    status     = Column(
        Enum("pending","viewed","accepted","rejected", name="app_status_enum"),
        nullable=False, default="pending"
    )
    applied_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    candidate = relationship("User", back_populates="applications")
    job       = relationship("Job",  back_populates="applications")

    __table_args__ = (
        UniqueConstraint("user_id", "job_id", name="uq_app_user_job"),
        Index("idx_app_user",   "user_id"),
        Index("idx_app_job",    "job_id"),
        Index("idx_app_status", "status"),
    )


class CreditEvent(Base):
    __tablename__ = "credit_events"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)

    type       = Column(
        Enum("welcome","purchase","spent","refund","bonus", name="credit_type_enum"),
        nullable=False
    )
    amount     = Column(Integer,     nullable=False)
    reason     = Column(String(200), nullable=True)
    balance    = Column(Integer,     nullable=False)
    reference  = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    user = relationship("User", back_populates="credit_events")

    __table_args__ = (
        Index("idx_credit_user", "user_id"),
        Index("idx_credit_type", "type"),
        Index("idx_credit_date", "created_at"),
    )


# ============================================================
# SEED DATA
# ============================================================

def hash_password(password: str) -> str:
    # Use bcrypt in production: bcrypt.hashpw(password.encode(), bcrypt.gensalt())
    return hashlib.sha256(password.encode()).hexdigest()


SEED_USERS = [
    {
        "name": "João Dev",
        "email": "joao@techfreela.com",
        "password": hash_password("demo123"),
        "type": "dev",
        "role": "Fullstack Developer",
        "bio": "Desenvolvedor fullstack com 5 anos de experiência em React, Node.js e AWS.",
        "skills": ["React", "Node.js", "TypeScript", "AWS", "PostgreSQL"],
        "linkedin": "linkedin.com/in/joaodev",
        "github": "github.com/joaodev",
        "credits": 50,
    },
    {
        "name": "Maria UX",
        "email": "maria@techfreela.com",
        "password": hash_password("demo123"),
        "type": "dev",
        "role": "UX/UI Designer",
        "bio": "Designer de produto com foco em pesquisa e sistemas de design para produtos digitais.",
        "skills": ["Figma", "UX Research", "Design System", "Prototyping"],
        "linkedin": "linkedin.com/in/mariauxui",
        "github": "",
        "credits": 30,
    },
    {
        "name": "Tech Corp",
        "email": "rh@techcorp.com",
        "password": hash_password("demo123"),
        "type": "company",
        "role": "Empresa de Tecnologia",
        "bio": "Empresa de tecnologia focada em soluções financeiras.",
        "skills": [],
        "credits": 150,
    },
    {
        "name": "StartupXYZ",
        "email": "jobs@startupxyz.com",
        "password": hash_password("demo123"),
        "type": "company",
        "role": "Startup de Saúde Digital",
        "bio": "Startup de saúde digital buscando talentos para transformar a medicina.",
        "skills": [],
        "credits": 80,
    },
]

SEED_JOBS = [
    {
        "owner_idx": 2,  # Tech Corp (index 2, 0-based)
        "title": "Senior React Developer",
        "company": "Tech Corp",
        "logo": "💜",
        "type": "CLT",
        "mode": "Remoto",
        "salary": "R$ 15k – 22k",
        "location": "São Paulo, SP",
        "area": "Frontend",
        "level": "Sênior",
        "stack": ["React", "TypeScript", "GraphQL", "AWS"],
        "description": "Buscamos um desenvolvedor React sênior para trabalhar no time de produto, "
                       "desenvolvendo interfaces de alta performance para milhões de usuários.",
        "requirements": ["5+ anos com React", "Inglês avançado", "TypeScript sólido", "Experiência com GraphQL"],
        "benefits": ["VA R$ 800/mês", "Plano de saúde Amil", "Gympass", "Stock options"],
    },
    {
        "owner_idx": 2,
        "title": "Backend Engineer Node.js",
        "company": "Tech Corp",
        "logo": "🏦",
        "type": "PJ",
        "mode": "Híbrido",
        "salary": "R$ 12k – 18k",
        "location": "São Paulo, SP",
        "area": "Backend",
        "level": "Pleno/Sênior",
        "stack": ["Node.js", "PostgreSQL", "Kubernetes", "Docker"],
        "description": "Oportunidade para engenheiro backend em projeto de open banking, "
                       "trabalhando com microsserviços e alta disponibilidade.",
        "requirements": ["Node.js 4+ anos", "Microsserviços", "PostgreSQL", "Docker/Kubernetes"],
        "benefits": ["Contrato PJ flexível", "Auxílio home office", "Seguro de vida"],
    },
    {
        "owner_idx": 3,  # StartupXYZ
        "title": "Freelance: Desenvolvedor Flutter",
        "company": "StartupXYZ",
        "logo": "📱",
        "type": "Freelance",
        "mode": "Remoto",
        "salary": "R$ 80 – 120/h",
        "location": "",
        "area": "Mobile",
        "level": "Pleno/Sênior",
        "stack": ["Flutter", "Dart", "Firebase", "REST API"],
        "description": "Projeto de 3 meses para desenvolvimento de app mobile iOS/Android do zero.",
        "requirements": ["Flutter 2+ anos", "Firebase", "Apps publicados nas stores"],
        "benefits": ["Pagamento quinzenal", "Horário flexível"],
    },
    {
        "owner_idx": 2,
        "title": "DevOps / SRE Engineer",
        "company": "Tech Corp",
        "logo": "☁️",
        "type": "CLT",
        "mode": "Remoto",
        "salary": "R$ 18k – 26k",
        "location": "Remoto",
        "area": "DevOps",
        "level": "Sênior",
        "stack": ["AWS", "Terraform", "Kubernetes", "CI/CD"],
        "description": "Vaga para DevOps/SRE com foco em automação de infraestrutura e observabilidade.",
        "requirements": ["AWS Certified", "Terraform", "Kubernetes em produção", "Python/Go"],
        "benefits": ["VR R$ 900/mês", "Certificações pagas", "13º e férias"],
    },
]

SEED_EXPERIENCES = [
    {
        "user_idx": 0,  # João Dev
        "title": "Desenvolvedor Fullstack Sênior",
        "company": "Empresa XYZ",
        "location": "Remoto",
        "start_date": "Jan 2022",
        "end_date": "Atual",
        "description": "Desenvolvimento de aplicações React/Node.js para fintech.",
    },
    {
        "user_idx": 0,
        "title": "Desenvolvedor Frontend Pleno",
        "company": "Startup ABC",
        "location": "São Paulo, SP",
        "start_date": "Mar 2020",
        "end_date": "Dez 2021",
        "description": "Construção do produto principal usando React e Next.js.",
    },
    {
        "user_idx": 1,  # Maria UX
        "title": "Product Designer",
        "company": "Fintech Beta",
        "location": "Remoto",
        "start_date": "Jun 2021",
        "end_date": "Atual",
        "description": "Design de produto B2B com foco em acessibilidade e design systems.",
    },
]

SEED_PORTFOLIO = [
    {"user_idx": 0, "emoji": "🛒", "name": "E-commerce Platform",  "stack": "React + Node.js + MongoDB", "description": "Plataforma de e-commerce com painel admin.", "link": "https://github.com/demo"},
    {"user_idx": 0, "emoji": "📊", "name": "Analytics Dashboard",  "stack": "Vue.js + D3.js + Python",  "description": "Dashboard de analytics em tempo real.",     "link": ""},
    {"user_idx": 0, "emoji": "📱", "name": "Food Delivery App",    "stack": "React Native + Firebase",   "description": "App de delivery com rastreio em tempo real.", "link": ""},
    {"user_idx": 1, "emoji": "🎨", "name": "Design System UI Kit", "stack": "Figma + Storybook",         "description": "Design system para produto SaaS.",           "link": ""},
]


# ============================================================
# MAIN
# ============================================================

def run():
    print("\n" + "="*55)
    print("  TechFreela — Setup do Banco MySQL Railway")
    print("="*55)

    # 1. Conectar
    print("\n▶ Conectando ao MySQL Railway...")
    try:
        engine = create_engine(
            DATABASE_URL,
            pool_pre_ping=True,
            pool_recycle=300,
            echo=False,
        )
        with engine.connect() as conn:
            result = conn.execute(text("SELECT VERSION()"))
            version = result.fetchone()[0]
            print(f"  ✓ Conectado! MySQL versão: {version}")
    except Exception as e:
        print(f"  ✗ Falha na conexão: {e}")
        sys.exit(1)

    # 2. Criar tabelas
    print("\n▶ Criando tabelas...")
    try:
        Base.metadata.drop_all(engine)
        print("  ✓ Tabelas anteriores removidas")
        Base.metadata.create_all(engine)
        print("  ✓ Todas as tabelas criadas com sucesso!")
    except Exception as e:
        print(f"  ✗ Erro ao criar tabelas: {e}")
        sys.exit(1)

    # 3. Inserir seed data
    Session = sessionmaker(bind=engine)
    session = Session()

    print("\n▶ Inserindo dados de exemplo...")
    try:
        # Users
        user_objects = []
        for u in SEED_USERS:
            user = User(
                name=u["name"], email=u["email"], password=u["password"],
                type=u["type"], role=u.get("role"), bio=u.get("bio"),
                skills=u.get("skills", []), linkedin=u.get("linkedin", ""),
                github=u.get("github", ""), credits=u["credits"],
            )
            session.add(user)
            user_objects.append(user)
        session.flush()
        print(f"  ✓ {len(user_objects)} usuários inseridos")

        # Welcome credit events
        for user in user_objects:
            session.add(CreditEvent(
                user_id=user.id, type="welcome", amount=10,
                reason="Bônus de boas-vindas", balance=user.credits,
            ))

        # Jobs
        job_objects = []
        for j in SEED_JOBS:
            owner = user_objects[j["owner_idx"]]
            job = Job(
                owner_id=owner.id, title=j["title"], company=j["company"],
                logo=j["logo"], type=j["type"], mode=j["mode"],
                salary=j.get("salary"), location=j.get("location"), area=j.get("area"),
                level=j.get("level"), stack=j.get("stack", []),
                description=j["description"], requirements=j.get("requirements", []),
                benefits=j.get("benefits", []),
                expires_at=datetime.utcnow() + timedelta(days=30),
            )
            session.add(job)
            job_objects.append(job)
            # Spend credits for posting
            session.add(CreditEvent(
                user_id=owner.id, type="spent", amount=-20,
                reason=f"Publicar vaga: {j['title']}",
                balance=owner.credits - 20,
            ))
            owner.credits -= 20
        session.flush()
        print(f"  ✓ {len(job_objects)} vagas inseridas")

        # Experiences
        for e in SEED_EXPERIENCES:
            session.add(Experience(
                user_id=user_objects[e["user_idx"]].id,
                title=e["title"], company=e["company"],
                location=e.get("location"), start_date=e.get("start_date"),
                end_date=e.get("end_date"), description=e.get("description"),
            ))
        print(f"  ✓ {len(SEED_EXPERIENCES)} experiências inseridas")

        # Portfolio
        for p in SEED_PORTFOLIO:
            session.add(PortfolioItem(
                user_id=user_objects[p["user_idx"]].id,
                emoji=p["emoji"], name=p["name"], stack=p.get("stack"),
                description=p.get("description"), link=p.get("link"),
            ))
        print(f"  ✓ {len(SEED_PORTFOLIO)} projetos de portfólio inseridos")

        session.commit()
        print("  ✓ Todos os dados commitados!")

    except Exception as e:
        session.rollback()
        print(f"  ✗ Erro no seed: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        session.close()

    # 4. Verificar resultado
    print("\n▶ Verificação final:")
    with engine.connect() as conn:
        tables = ["users","jobs","experiences","portfolio_items","applications","credit_events"]
        for table in tables:
            try:
                count = conn.execute(text(f"SELECT COUNT(*) FROM {table}")).fetchone()[0]
                print(f"  ✓  {table:<20} → {count} registro(s)")
            except Exception as e:
                print(f"  ✗  {table:<20} → ERRO: {e}")

    print("\n" + "="*55)
    print("  ✅  Setup concluído com sucesso!")
    print("  🚀  Execute: python app.py")
    print("="*55 + "\n")


if __name__ == "__main__":
    run()
