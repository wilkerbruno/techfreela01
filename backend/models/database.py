"""
============================================================
TECHFREELA — models/database.py
Models SQLAlchemy para MySQL Railway
============================================================
"""

from datetime import datetime, timedelta
from sqlalchemy import (
    Column, Integer, String, Text, DateTime, Enum,
    JSON, Boolean, ForeignKey, UniqueConstraint, Index
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    name       = Column(String(120), nullable=False)
    email      = Column(String(120), nullable=False, unique=True)
    password   = Column(String(255), nullable=False)
    type       = Column(Enum("dev","company"), nullable=False, default="dev")

    role       = Column(String(80),  nullable=True)
    bio        = Column(Text,        nullable=True)
    skills     = Column(JSON,        nullable=True)
    linkedin   = Column(String(200), nullable=True)
    github     = Column(String(200), nullable=True)
    avatar_url = Column(String(500), nullable=True)

    credits    = Column(Integer, nullable=False, default=10)
    is_active  = Column(Boolean, nullable=False, default=True)
    is_admin   = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    experiences   = relationship("Experience",    back_populates="user", cascade="all, delete-orphan")
    portfolio     = relationship("PortfolioItem", back_populates="user", cascade="all, delete-orphan")
    jobs_posted   = relationship("Job",           back_populates="owner")
    applications  = relationship("Application",   back_populates="candidate")
    credit_events = relationship("CreditEvent",   back_populates="user")

    def to_public(self):
        return {
            "id": self.id, "name": self.name, "email": self.email,
            "type": self.type, "role": self.role or "", "bio": self.bio or "",
            "skills": self.skills or [], "linkedin": self.linkedin or "",
            "github": self.github or "", "credits": self.credits,
            "is_admin": self.is_admin,
            "created_at": self.created_at.isoformat()+"Z" if self.created_at else None,
        }


class Job(Base):
    __tablename__ = "jobs"

    id          = Column(Integer, primary_key=True, autoincrement=True)
    owner_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title       = Column(String(120), nullable=False)
    company     = Column(String(120), nullable=False)
    logo        = Column(String(8),   nullable=False, default="🏢")
    type        = Column(Enum("CLT","PJ","Freelance","Estágio","Temporário"), nullable=False)
    mode        = Column(Enum("Remoto","Presencial","Híbrido"), nullable=False)
    salary      = Column(String(80),  nullable=True)
    location    = Column(String(80),  nullable=True)
    area        = Column(String(60),  nullable=True)
    level       = Column(String(60),  nullable=True)
    stack       = Column(JSON,        nullable=True)
    description  = Column(Text, nullable=False)
    requirements = Column(JSON, nullable=True)
    benefits     = Column(JSON, nullable=True)
    active      = Column(Boolean,  nullable=False, default=True)
    created_at  = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at  = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    expires_at  = Column(DateTime, nullable=True)

    owner        = relationship("User",        back_populates="jobs_posted")
    applications = relationship("Application", back_populates="job", cascade="all, delete-orphan")

    @property
    def posted_label(self):
        if not self.created_at:
            return "Recentemente"
        delta = datetime.utcnow() - self.created_at
        if delta.days == 0:
            h = delta.seconds // 3600
            return "Hoje" if h == 0 else f"{h}h atrás"
        return "1 dia atrás" if delta.days == 1 else (f"{delta.days} dias atrás" if delta.days < 7 else f"{delta.days//7} semana(s) atrás")

    def to_public(self, include_contact=False):
        d = {"id": self.id, "title": self.title, "company": self.company, "logo": self.logo,
             "type": self.type, "mode": self.mode, "salary": self.salary or "A combinar",
             "stack": self.stack or [], "area": self.area or "", "level": self.level or "A combinar",
             "active": self.active, "posted": self.posted_label,
             "posted_at": self.created_at.isoformat()+"Z" if self.created_at else None}
        if include_contact:
            d.update({"desc": self.description, "reqs": self.requirements or [],
                      "benefits": self.benefits or [], "location": self.location or ""})
        return d


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
    def to_dict(self):
        return {"id": self.id, "title": self.title, "company": self.company,
                "location": self.location or "", "start": self.start_date or "",
                "end": self.end_date or "Atual", "desc": self.description or ""}


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
    def to_dict(self):
        return {"id": self.id, "emoji": self.emoji, "name": self.name,
                "stack": self.stack or "", "desc": self.description or "", "link": self.link or ""}


class Application(Base):
    __tablename__ = "applications"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    job_id     = Column(Integer, ForeignKey("jobs.id",  ondelete="CASCADE"), nullable=False)
    cover_note = Column(Text, nullable=True)
    status     = Column(Enum("pending","viewed","accepted","rejected"), nullable=False, default="pending")
    applied_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    candidate = relationship("User", back_populates="applications")
    job       = relationship("Job",  back_populates="applications")
    __table_args__ = (UniqueConstraint("user_id", "job_id", name="uq_app_user_job"),)
    def to_dict(self):
        return {"id": self.id, "job_id": self.job_id, "status": self.status,
                "applied_at": self.applied_at.isoformat()+"Z" if self.applied_at else None}


class CreditEvent(Base):
    __tablename__ = "credit_events"
    id         = Column(Integer, primary_key=True, autoincrement=True)
    user_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    type       = Column(Enum("welcome","purchase","spent","refund","bonus"), nullable=False)
    amount     = Column(Integer,     nullable=False)
    reason     = Column(String(200), nullable=True)
    balance    = Column(Integer,     nullable=False)
    reference  = Column(String(100), nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    user = relationship("User", back_populates="credit_events")
    def to_dict(self):
        return {"id": self.id, "type": self.type, "amount": self.amount, "reason": self.reason,
                "balance": self.balance, "created_at": self.created_at.isoformat()+"Z" if self.created_at else None}


class Payment(Base):
    __tablename__ = "payments"

    id                = Column(Integer, primary_key=True, autoincrement=True)
    user_id           = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    package_id        = Column(String(50),  nullable=False)
    credits           = Column(Integer,     nullable=False)
    amount_brl        = Column(String(20),  nullable=False)
    payment_method    = Column(Enum("pix","credit_card","debit_card","crypto"), nullable=False, default="pix")
    status            = Column(Enum("pending","waiting","confirming","confirmed","finished","failed","expired","refunded"),
                               nullable=False, default="pending")
    nowpayments_id    = Column(String(100), nullable=True, unique=True)
    invoice_id        = Column(String(100), nullable=True)
    invoice_url       = Column(String(500), nullable=True)
    ipn_callback_secret = Column(String(100), nullable=True)
    created_at        = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at        = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
    paid_at           = Column(DateTime, nullable=True)

    user = relationship("User")

    def to_dict(self):
        return {
            "id": self.id, "package_id": self.package_id, "credits": self.credits,
            "amount_brl": self.amount_brl, "payment_method": self.payment_method,
            "status": self.status, "nowpayments_id": self.nowpayments_id,
            "invoice_url": self.invoice_url,
            "created_at": self.created_at.isoformat()+"Z" if self.created_at else None,
            "paid_at": self.paid_at.isoformat()+"Z" if self.paid_at else None,
        }


class AdminConfig(Base):
    __tablename__ = "admin_config"

    id         = Column(Integer, primary_key=True, autoincrement=True)
    key        = Column(String(100), nullable=False, unique=True)
    value      = Column(Text, nullable=True)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    def to_dict(self):
        return {"key": self.key, "value": self.value}


class Message(Base):
    __tablename__ = "messages"

    id             = Column(Integer, primary_key=True, autoincrement=True)
    sender_id      = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    receiver_id    = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    application_id = Column(Integer, ForeignKey("applications.id", ondelete="CASCADE"), nullable=False)
    content        = Column(Text, nullable=False)
    read_at        = Column(DateTime, nullable=True)
    created_at     = Column(DateTime, nullable=False, default=datetime.utcnow)

    sender      = relationship("User", foreign_keys=[sender_id])
    receiver    = relationship("User", foreign_keys=[receiver_id])
    application = relationship("Application")

    def to_dict(self):
        return {
            "id": self.id,
            "sender_id": self.sender_id,
            "receiver_id": self.receiver_id,
            "application_id": self.application_id,
            "content": self.content,
            "read_at": self.read_at.isoformat()+"Z" if self.read_at else None,
            "created_at": self.created_at.isoformat()+"Z" if self.created_at else None,
        }