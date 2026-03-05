"""
============================================================
TECHFREELA — backend/app.py
Flask API conectada ao MySQL Railway
============================================================
Setup:
    pip install flask flask-cors sqlalchemy pymysql cryptography python-dotenv
    python setup_db.py   # cria tabelas e seed
    python app.py        # inicia o servidor
============================================================
"""

import os, sys, hashlib, hmac, json, requests as http_requests
from datetime import datetime, timedelta
from functools import wraps
from flask import Flask, request, jsonify, session
import uuid
from werkzeug.utils import secure_filename


UPLOAD_FOLDER   = os.path.join(os.path.dirname(__file__), "uploads")
ALLOWED_EXTENSIONS = True  # aceita tudo
MAX_FILE_BYTES  = 100 * 1024 * 1024  # 100MB
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    from sqlalchemy import create_engine, text, or_
    from sqlalchemy.orm import sessionmaker, scoped_session
    from sqlalchemy.exc import IntegrityError, SQLAlchemyError
except ImportError:
    sys.exit("ERRO: pip install sqlalchemy pymysql")

try:
    import pymysql
    pymysql.install_as_MySQLdb()
except ImportError:
    sys.exit("ERRO: pip install pymysql")

try:
    from flask_cors import CORS
    HAS_CORS = True
except ImportError:
    HAS_CORS = False

from models.database import Base, User, Job, Experience, PortfolioItem, Application, CreditEvent, Payment, AdminConfig, Message

# ============================================================
# CONFIGURAÇÃO
# ============================================================

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+pymysql://mysql:d8f0525bbe9dea9e3097"
    "@easypanel.pontocomdesconto.com.br:3307/techfreela?charset=utf8mb4"
)

CREDIT_COSTS    = {"view_job": 2, "apply_job": 5, "post_job": 20, "view_resume": 3}
CREDIT_PACKAGES = [
    {"id": "starter",  "credits": 50,  "price": 9.90,  "label": "Iniciante"},
    {"id": "pro",      "credits": 150, "price": 24.90, "label": "Profissional"},
    {"id": "business", "credits": 400, "price": 59.90, "label": "Empresarial"},
]
WELCOME_CREDITS  = 10
JOB_DURATION_DAYS = 30

MP_API_BASE = "https://api.mercadopago.com"

# ============================================================
# FLASK
# ============================================================

app = Flask(__name__, static_folder="../", static_url_path="/")
app.secret_key = os.environ.get("SECRET_KEY", "techfreela-dev-secret-2025-xk9m")
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

if HAS_CORS:
    # Em produção, permitir qualquer origem (o proxy do Easypanel cuida da segurança)
    CORS(app, supports_credentials=True, origins="*")

# ============================================================
# DATABASE
# ============================================================

try:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300,
                           pool_size=5, max_overflow=10, echo=False)
    with engine.connect() as c:
        ver = c.execute(text("SELECT VERSION()")).fetchone()[0]
    print(f"✓ MySQL conectado! Versão: {ver}")
except Exception as e:
    sys.exit(f"✗ Falha na conexão MySQL: {e}")

Base.metadata.create_all(engine)
SessionLocal = scoped_session(sessionmaker(autocommit=False, autoflush=False, bind=engine))

def get_db():
    return SessionLocal()

@app.teardown_appcontext
def shutdown_session(exc=None):
    SessionLocal.remove()

# ============================================================
# HELPERS
# ============================================================

def hash_pw(pw):
    return hashlib.sha256(pw.encode()).hexdigest()

def check_pw(plain, hashed):
    return hash_pw(plain) == hashed

def spend_credits(db, user, amount, reason):
    if user.credits < amount:
        return False
    user.credits -= amount
    db.add(CreditEvent(user_id=user.id, type="spent",
                       amount=-amount, reason=reason, balance=user.credits))
    return True

def add_credits(db, user, amount, reason, etype="purchase", ref=None):
    user.credits += amount
    db.add(CreditEvent(user_id=user.id, type=etype, amount=amount,
                       reason=reason, balance=user.credits, reference=ref))
    return user.credits

def require_auth(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Não autenticado."}), 401
        db = get_db()
        if not db.query(User).filter_by(id=session["user_id"], is_active=True).first():
            session.clear()
            return jsonify({"error": "Usuário não encontrado."}), 401
        return f(*args, **kwargs)
    return wrapped

def require_admin(f):
    @wraps(f)
    def wrapped(*args, **kwargs):
        if not session.get("user_id"):
            return jsonify({"error": "Não autenticado."}), 401
        db = get_db()
        user = db.query(User).filter_by(id=session["user_id"], is_active=True, is_admin=True).first()
        if not user:
            return jsonify({"error": "Acesso negado."}), 403
        return f(*args, **kwargs)
    return wrapped

def get_admin_config(db):
    """Returns dict of all admin config key→value."""
    rows = db.query(AdminConfig).all()
    return {r.key: r.value for r in rows}

def set_admin_config(db, key, value):
    row = db.query(AdminConfig).filter_by(key=key).first()
    if row:
        row.value = value
    else:
        db.add(AdminConfig(key=key, value=value))

def mp_headers(access_token):
    return {
        "Authorization":    f"Bearer {access_token}",
        "Content-Type":     "application/json",
        "X-Idempotency-Key": str(uuid.uuid4()),
    }

def get_mp_access_token(db):
    cfg = get_admin_config(db)
    return cfg.get("mp_access_token", "")

def is_mp_sandbox(db):
    cfg = get_admin_config(db)
    return cfg.get("mp_sandbox", "true").lower() == "true"

def current_user(db=None):
    uid = session.get("user_id")
    if not uid:
        return None
    db = db or get_db()
    return db.query(User).filter_by(id=uid, is_active=True).first()

# ============================================================
# STATIC
# ============================================================

@app.route("/")
def index():
    return app.send_static_file("index.html")

# ============================================================
# AUTH
# ============================================================

@app.route("/api/auth/register", methods=["POST"])
def register():
    d = request.get_json() or {}
    name  = (d.get("name")  or "").strip()
    email = (d.get("email") or "").strip().lower()
    pw    = (d.get("password") or "")
    role  = (d.get("role") or "").strip()
    utype = d.get("type", "dev")
    if utype not in ("dev","company"): utype = "dev"

    if not name or not email or not pw:
        return jsonify({"error": "Nome, e-mail e senha obrigatórios."}), 400
    if len(pw) < 6:
        return jsonify({"error": "Senha mínima de 6 caracteres."}), 400
    if "@" not in email:
        return jsonify({"error": "E-mail inválido."}), 400

    db = get_db()
    try:
        if db.query(User).filter_by(email=email).first():
            return jsonify({"error": "E-mail já cadastrado."}), 409

        user = User(name=name, email=email, password=hash_pw(pw),
                    type=utype, role=role, credits=WELCOME_CREDITS)
        db.add(user)
        db.flush()
        db.add(CreditEvent(user_id=user.id, type="welcome", amount=WELCOME_CREDITS,
                           reason="Bônus de boas-vindas", balance=WELCOME_CREDITS))
        db.commit()
        db.refresh(user)
        session["user_id"] = user.id
        return jsonify({"message": "Conta criada! 10 créditos de bônus 🎁", "user": user.to_public()}), 201

    except IntegrityError:
        db.rollback()
        return jsonify({"error": "E-mail já cadastrado."}), 409
    except SQLAlchemyError as e:
        db.rollback()
        return jsonify({"error": str(e)}), 500


@app.route("/api/auth/login", methods=["POST"])
def login():
    d  = request.get_json() or {}
    em = (d.get("email") or "").strip().lower()
    pw = (d.get("password") or "")
    if not em or not pw:
        return jsonify({"error": "E-mail e senha obrigatórios."}), 400
    db   = get_db()
    user = db.query(User).filter_by(email=em, is_active=True).first()
    if not user or not check_pw(pw, user.password):
        return jsonify({"error": "E-mail ou senha inválidos."}), 401
    session["user_id"] = user.id
    return jsonify({"message": f"Bem-vindo, {user.name}! 👋", "user": user.to_public()})


@app.route("/api/auth/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logout realizado."})


@app.route("/api/auth/me")
@require_auth
def me():
    return jsonify(current_user().to_public())

# ============================================================
# JOBS
# ============================================================

@app.route("/api/jobs")
def list_jobs():
    search   = request.args.get("search","").strip()
    jtype    = request.args.get("type","").strip()
    area     = request.args.get("area","").strip()
    page     = max(1, int(request.args.get("page",1)))
    per_page = min(50, max(1, int(request.args.get("per_page",20))))

    db = get_db()
    q  = db.query(Job).filter(Job.active == True)
    q  = q.filter((Job.expires_at == None) | (Job.expires_at > datetime.utcnow()))

    if search:
        q = q.filter(or_(Job.title.ilike(f"%{search}%"),
                         Job.company.ilike(f"%{search}%"),
                         Job.description.ilike(f"%{search}%")))
    if jtype:
        q = q.filter(or_(Job.type == jtype, Job.mode == jtype))
    if area:
        q = q.filter(Job.area == area)

    total = q.count()
    jobs  = q.order_by(Job.created_at.desc()).offset((page-1)*per_page).limit(per_page).all()

    return jsonify({"jobs": [j.to_public() for j in jobs], "total": total,
                    "page": page, "per_page": per_page,
                    "pages": (total + per_page - 1) // per_page})


@app.route("/api/jobs/mine", methods=["GET"])
@require_auth
def my_jobs():
    """Vagas publicadas pelo usuário logado (empresas)."""
    db   = get_db()
    user = current_user(db)
    jobs = db.query(Job).filter_by(owner_id=user.id).order_by(Job.created_at.desc()).all()
    result = []
    for j in jobs:
        d = j.to_public(include_contact=True)
        d["applicants_count"] = db.query(Application).filter_by(job_id=j.id).count()
        result.append(d)
    return jsonify({"jobs": result})


@app.route("/api/jobs/<int:job_id>")
@require_auth
def get_job(job_id):
    db   = get_db()
    user = current_user(db)
    job  = db.query(Job).filter_by(id=job_id, active=True).first()
    if not job:
        return jsonify({"error": "Vaga não encontrada."}), 404

    cost = CREDIT_COSTS["view_job"]
    if not spend_credits(db, user, cost, f"Ver detalhes: {job.title}"):
        return jsonify({"error": f"Créditos insuficientes ({cost} necessários).",
                        "required": cost, "balance": user.credits}), 402
    db.commit()
    return jsonify({"job": job.to_public(include_contact=True),
                    "credits_spent": cost, "balance": user.credits})


@app.route("/api/jobs", methods=["POST"])
@require_auth
def create_job():
    db   = get_db()
    user = current_user(db)
    d    = request.get_json() or {}

    missing = [f for f in ["title","company","type","mode","desc"] if not str(d.get(f,"")).strip()]
    if missing:
        return jsonify({"error": f"Campos obrigatórios: {', '.join(missing)}"}), 400
    if d["type"] not in {"CLT","PJ","Freelance","Estágio","Temporário"}:
        return jsonify({"error": "Tipo de contrato inválido."}), 400
    if d["mode"] not in {"Remoto","Presencial","Híbrido"}:
        return jsonify({"error": "Modalidade inválida."}), 400

    cost = CREDIT_COSTS["post_job"]
    if not spend_credits(db, user, cost, f"Publicar: {d['title']}"):
        return jsonify({"error": f"Créditos insuficientes ({cost} necessários).",
                        "required": cost, "balance": user.credits}), 402

    stack = d.get("stack", [])
    if isinstance(stack, str):
        stack = [s.strip() for s in stack.split(",") if s.strip()]
    reqs = d.get("reqs", [])
    if isinstance(reqs, str):
        reqs = [r.strip() for r in reqs.split("\n") if r.strip()]

    job = Job(owner_id=user.id, title=d["title"].strip(), company=d["company"].strip(),
              logo=d.get("logo","🏢"), type=d["type"], mode=d["mode"],
              salary=d.get("salary","A combinar"), location=d.get("location",""),
              area=d.get("area",""), level=d.get("level","A combinar"),
              stack=stack, description=d["desc"].strip(),
              requirements=reqs, benefits=d.get("benefits",[]),
              expires_at=datetime.utcnow() + timedelta(days=JOB_DURATION_DAYS))
    db.add(job)
    db.commit()
    db.refresh(job)

    return jsonify({"message": "Vaga publicada! Ativa por 30 dias 🎉",
                    "job": job.to_public(include_contact=True),
                    "credits_spent": cost, "balance": user.credits}), 201


@app.route("/api/jobs/<int:job_id>", methods=["PUT"])
@require_auth
def update_job(job_id):
    """Dono da vaga edita os dados da vaga."""
    db   = get_db()
    user = current_user(db)
    job  = db.query(Job).filter_by(id=job_id, owner_id=user.id).first()
    if not job:
        return jsonify({"error": "Vaga não encontrada ou sem permissão."}), 404

    d = request.get_json() or {}
    for field in ["title","company","salary","location","area","level","description"]:
        if field in d and str(d[field]).strip():
            col = "description" if field == "description" else field
            setattr(job, col, str(d[field]).strip())

    if "desc" in d and str(d["desc"]).strip():
        job.description = str(d["desc"]).strip()
    if "type" in d and d["type"] in {"CLT","PJ","Freelance","Estágio","Temporário"}:
        job.type = d["type"]
    if "mode" in d and d["mode"] in {"Remoto","Presencial","Híbrido"}:
        job.mode = d["mode"]
    if "stack" in d:
        stack = d["stack"]
        if isinstance(stack, str):
            stack = [s.strip() for s in stack.split(",") if s.strip()]
        job.stack = stack
    if "requirements" in d:
        reqs = d["requirements"]
        if isinstance(reqs, str):
            reqs = [r.strip() for r in reqs.split("\n") if r.strip()]
        job.requirements = reqs
    if "benefits" in d:
        job.benefits = d["benefits"]

    db.commit()
    db.refresh(job)
    return jsonify({"message": "Vaga atualizada!", "job": job.to_public(include_contact=True)})


@app.route("/api/jobs/<int:job_id>/toggle", methods=["POST"])
@require_auth
def toggle_job(job_id):
    """Ativa ou pausa uma vaga."""
    db   = get_db()
    user = current_user(db)
    job  = db.query(Job).filter_by(id=job_id, owner_id=user.id).first()
    if not job:
        return jsonify({"error": "Vaga não encontrada ou sem permissão."}), 404
    job.active = not job.active
    db.commit()
    status = "ativada" if job.active else "pausada"
    return jsonify({"message": f"Vaga {status}!", "active": job.active})


@app.route("/api/jobs/<int:job_id>/apply", methods=["POST"])
@require_auth
def apply_job(job_id):
    db   = get_db()
    user = current_user(db)

    if user.type == "company":
        return jsonify({"error": "Empresas não podem se candidatar."}), 403

    job = db.query(Job).filter_by(id=job_id, active=True).first()
    if not job:
        return jsonify({"error": "Vaga não encontrada."}), 404

    if db.query(Application).filter_by(user_id=user.id, job_id=job_id).first():
        return jsonify({"error": "Você já se candidatou a esta vaga."}), 409

    cost = CREDIT_COSTS["apply_job"]
    if not spend_credits(db, user, cost, f"Candidatura: {job.title}"):
        return jsonify({"error": f"Créditos insuficientes ({cost} necessários).",
                        "required": cost, "balance": user.credits}), 402

    cover = (request.get_json() or {}).get("cover_note","")
    app_r = Application(user_id=user.id, job_id=job_id, cover_note=cover)
    db.add(app_r)
    db.commit()
    db.refresh(app_r)

    return jsonify({"message": "Candidatura enviada! Boa sorte! 🎯",
                    "application": app_r.to_dict(),
                    "credits_spent": cost, "balance": user.credits}), 201

# ============================================================
# PROFILE
# ============================================================

@app.route("/api/profile")
@require_auth
def get_profile():
    db   = get_db()
    user = current_user(db)
    apps = []
    for a in user.applications:
        j = db.query(Job).filter_by(id=a.job_id).first()
        e = a.to_dict()
        if j:
            e.update({"job_title": j.title, "job_company": j.company, "job_type": j.type})
        apps.append(e)
    return jsonify({**user.to_public(),
                    "experiences": [e.to_dict() for e in user.experiences],
                    "portfolio":   [p.to_dict() for p in user.portfolio],
                    "applications": apps})


@app.route("/api/profile", methods=["PUT"])
@require_auth
def update_profile():
    db   = get_db()
    user = current_user(db)
    d    = request.get_json() or {}
    for f in ["name","role","bio","linkedin","github"]:
        if f in d: setattr(user, f, str(d[f]).strip())
    if "skills" in d:
        sk = d["skills"]
        if isinstance(sk, str): sk = [s.strip() for s in sk.split(",") if s.strip()]
        user.skills = sk[:10]
    db.commit()
    return jsonify({"message": "Perfil atualizado!", "user": user.to_public()})


@app.route("/api/profile/avatar", methods=["POST"])
@require_auth
def upload_avatar():
    """Upload de foto de perfil do usuário."""
    db   = get_db()
    user = current_user(db)

    if "avatar" not in request.files:
        return jsonify({"error": "Nenhuma imagem enviada."}), 400
    f = request.files["avatar"]
    if not f.filename:
        return jsonify({"error": "Nome de arquivo inválido."}), 400
    if not f.content_type.startswith("image/"):
        return jsonify({"error": "Envie apenas imagens."}), 400

    f.seek(0, 2); size = f.tell(); f.seek(0)
    if size > 5 * 1024 * 1024:
        return jsonify({"error": "Imagem muito grande (máx 5MB)."}), 400

    ext      = os.path.splitext(secure_filename(f.filename))[1].lower()
    uid_name = f"avatar_{user.id}_{uuid.uuid4().hex[:8]}{ext}"
    f.save(os.path.join(UPLOAD_FOLDER, uid_name))

    user.avatar_url = f"/api/messages/files/{uid_name}"
    db.commit()

    return jsonify({"avatar_url": user.avatar_url, "user": user.to_public()}), 200

@app.route("/api/profile/experience", methods=["POST"])
@require_auth
def add_experience():
    db   = get_db()
    user = current_user(db)
    d    = request.get_json() or {}
    title   = (d.get("title")   or "").strip()
    company = (d.get("company") or "").strip()
    if not title or not company:
        return jsonify({"error": "Cargo e empresa obrigatórios."}), 400
    exp = Experience(user_id=user.id, title=title, company=company,
                     location=d.get("location",""), start_date=d.get("start",""),
                     end_date=d.get("end","Atual"), description=d.get("desc",""))
    db.add(exp); db.commit(); db.refresh(exp)
    return jsonify({"message": "Experiência adicionada!", "experience": exp.to_dict()}), 201


@app.route("/api/profile/portfolio", methods=["POST"])
@require_auth
def add_portfolio():
    db   = get_db()
    user = current_user(db)
    d    = request.get_json() or {}
    name = (d.get("name") or "").strip()
    if not name: return jsonify({"error": "Nome do projeto obrigatório."}), 400
    item = PortfolioItem(user_id=user.id, emoji=d.get("emoji","💡"), name=name,
                         stack=d.get("stack",""), description=d.get("desc",""), link=d.get("link",""))
    db.add(item); db.commit(); db.refresh(item)
    return jsonify({"message": "Projeto adicionado!", "project": item.to_dict()}), 201

# ============================================================
# CREDITS
# ============================================================

@app.route("/api/credits")
@require_auth
def get_credits():
    db   = get_db()
    user = current_user(db)
    hist = (db.query(CreditEvent).filter_by(user_id=user.id)
            .order_by(CreditEvent.created_at.desc()).limit(20).all())
    return jsonify({"balance": user.credits, "packages": CREDIT_PACKAGES,
                    "costs": CREDIT_COSTS, "history": [e.to_dict() for e in hist]})


@app.route("/api/credits/purchase", methods=["POST"])
@require_auth
def purchase_credits():
    """Legacy endpoint kept for backward compat — real payments go via /api/payments/create."""
    db   = get_db()
    user = current_user(db)
    d    = request.get_json() or {}
    pkg  = next((p for p in CREDIT_PACKAGES if p["id"] == d.get("package_id")), None)
    if not pkg:
        return jsonify({"error": "Pacote inválido."}), 400

    ref = d.get("payment_reference", f"DEMO-{datetime.utcnow().timestamp():.0f}")
    bal = add_credits(db, user, pkg["credits"],
                      reason=f"Compra {pkg['label']} ({pkg['credits']} cr)", ref=ref)
    db.commit()
    return jsonify({"message": f"{pkg['credits']} créditos adicionados! 💎",
                    "credits_added": pkg["credits"], "balance": bal, "package": pkg})


# ============================================================
# PAYMENTS — Mercado Pago Integration
# ============================================================

@app.route("/api/payments/create", methods=["POST"])
@require_auth
def create_payment():
    """Cria pagamento PIX via Mercado Pago e retorna QR code para exibir no site."""
    db   = get_db()
    user = current_user(db)
    d    = request.get_json() or {}

    pkg = next((p for p in CREDIT_PACKAGES if p["id"] == d.get("package_id")), None)
    if not pkg:
        return jsonify({"error": "Pacote inválido."}), 400

    access_token = get_mp_access_token(db)
    if not access_token:
        return jsonify({"error": "Pagamentos não configurados. Contate o administrador."}), 503

    order_id = f"TF-{user.id}-{int(datetime.utcnow().timestamp())}"

    payload = {
        "transaction_amount": float(pkg["price"]),
        "description":        f"TechFreela — {pkg['credits']} creditos ({pkg['label']})",
        "payment_method_id":  "pix",
        "payer": {
            "email":      user.email,
            "first_name": user.name.split()[0] if user.name else "Usuario",
            "last_name":  " ".join(user.name.split()[1:]) if len(user.name.split()) > 1 else "TechFreela",
        },
        "external_reference":  order_id,
        "date_of_expiration":  (datetime.utcnow() + timedelta(minutes=30)).strftime("%Y-%m-%dT%H:%M:%S.000-03:00"),
    }

    # Só inclui notification_url se for uma URL pública válida (não localhost)
    site_url = request.host_url.rstrip("/")
    host = request.host.split(":")[0].lower()
    is_public = host not in ("localhost", "127.0.0.1", "0.0.0.0") and "." in host
    if is_public:
        payload["notification_url"] = f"{site_url}/api/payments/webhook"

    try:
        resp = http_requests.post(
            f"{MP_API_BASE}/v1/payments",
            json=payload,
            headers=mp_headers(access_token),
            timeout=15,
        )
        resp_data = resp.json()

        if not resp.ok:
            msg   = resp_data.get("message") or resp_data.get("error") or "Erro desconhecido"
            cause = resp_data.get("cause", [])
            cause_str = f" {cause}" if cause else ""
            return jsonify({"error": f"Erro Mercado Pago: {msg}{cause_str}"}), 502

    except Exception as e:
        return jsonify({"error": f"Falha de comunicação com gateway: {str(e)}"}), 502

    mp_id     = resp_data.get("id")
    pix_data  = resp_data.get("point_of_interaction", {}).get("transaction_data", {})
    qr_base64 = pix_data.get("qr_code_base64", "")
    qr_code   = pix_data.get("qr_code", "")

    pay = Payment(
        user_id=user.id,
        package_id=pkg["id"],
        credits=pkg["credits"],
        amount_brl=str(pkg["price"]),
        payment_method="pix",
        status="pending",
        invoice_id=str(mp_id),
        invoice_url=None,
    )
    pay.nowpayments_id = str(mp_id)
    db.add(pay)
    db.commit()
    db.refresh(pay)

    return jsonify({
        "payment_id": pay.id,
        "mp_id":      mp_id,
        "qr_code":    qr_code,
        "qr_base64":  qr_base64,
        "expires_in": 1800,
        "package":    pkg,
    }), 201

@app.route("/api/payments/<int:payment_id>/status", methods=["GET"])
@require_auth
def payment_status(payment_id):
    """Consulta status do pagamento PIX junto ao Mercado Pago."""
    db   = get_db()
    user = current_user(db)
    pay  = db.query(Payment).filter_by(id=payment_id, user_id=user.id).first()
    if not pay:
        return jsonify({"error": "Pagamento não encontrado."}), 404

    # Se já está finalizado, retorna direto
    if pay.status == "finished":
        return jsonify({"status": "finished", "balance": user.credits})

    mp_id = pay.nowpayments_id or pay.invoice_id
    if not mp_id:
        return jsonify({"status": pay.status, "balance": user.credits})

    access_token = get_mp_access_token(db)
    if not access_token:
        return jsonify({"status": pay.status, "balance": user.credits})

    try:
        resp = http_requests.get(
            f"{MP_API_BASE}/v1/payments/{mp_id}",
            headers=mp_headers(access_token),
            timeout=10,
        )
        if resp.ok:
            mp_data   = resp.json()
            mp_status = mp_data.get("status", "")

            STATUS_MAP = {
                "approved":   "finished",
                "pending":    "pending",
                "in_process": "confirming",
                "rejected":   "failed",
                "cancelled":  "expired",
                "refunded":   "refunded",
            }
            new_status = STATUS_MAP.get(mp_status, pay.status)
            pay.status = new_status

            if new_status == "finished" and not pay.paid_at:
                pay.paid_at = datetime.utcnow()
                pkg = next((p for p in CREDIT_PACKAGES if p["id"] == pay.package_id), None)
                label = pkg["label"] if pkg else pay.package_id
                add_credits(
                    db, user, pay.credits,
                    reason=f"Compra {label} ({pay.credits} cr) via PIX",
                    etype="purchase",
                    ref=str(mp_id),
                )
            db.commit()
    except Exception:
        pass

    return jsonify({"status": pay.status, "balance": user.credits})



@app.route("/api/payments/webhook", methods=["POST"])
def payment_webhook():
    """Webhook do Mercado Pago — credita o usuário após pagamento aprovado."""
    topic      = request.args.get("topic") or request.args.get("type")
    mp_pay_id  = request.args.get("id")

    data = request.get_json(silent=True) or {}
    if not mp_pay_id:
        mp_pay_id = str(data.get("data", {}).get("id", ""))
        topic = data.get("type", topic)

    if topic not in ("payment", "merchant_order", None):
        return jsonify({"ok": True}), 200

    if not mp_pay_id:
        return jsonify({"ok": False}), 400

    db = get_db()
    access_token = get_mp_access_token(db)
    if not access_token:
        return jsonify({"ok": False}), 503

    try:
        resp = http_requests.get(
            f"{MP_API_BASE}/v1/payments/{mp_pay_id}",
            headers=mp_headers(access_token),
            timeout=10
        )
        if not resp.ok:
            return jsonify({"ok": False}), 502
        mp_data = resp.json()
    except Exception:
        return jsonify({"ok": False}), 502

    mp_status    = mp_data.get("status", "")
    external_ref = mp_data.get("external_reference", "")

    pay = None
    if external_ref.startswith("TF-"):
        try:
            parts   = external_ref.split("-")
            user_id = int(parts[1])
            pay = (db.query(Payment)
                   .filter_by(user_id=user_id)
                   .filter(Payment.status.in_(["pending", "confirming", "waiting"]))
                   .order_by(Payment.created_at.desc()).first())
        except Exception:
            pass

    if not pay:
        pay = db.query(Payment).filter_by(nowpayments_id=str(mp_pay_id)).first()

    if not pay:
        return jsonify({"ok": False, "error": "Payment not found"}), 404

    status_map = {
        "approved":   "finished",
        "pending":    "pending",
        "in_process": "confirming",
        "rejected":   "failed",
        "cancelled":  "expired",
        "refunded":   "refunded",
    }
    new_status = status_map.get(mp_status, "pending")
    pay.status        = new_status
    pay.nowpayments_id = str(mp_pay_id)

    if new_status == "finished" and not pay.paid_at:
        pay.paid_at = datetime.utcnow()
        user = db.query(User).filter_by(id=pay.user_id, is_active=True).first()
        if user:
            pkg   = next((p for p in CREDIT_PACKAGES if p["id"] == pay.package_id), None)
            label = pkg["label"] if pkg else pay.package_id
            add_credits(db, user, pay.credits,
                        reason=f"Compra {label} ({pay.credits} cr) via Mercado Pago",
                        etype="purchase", ref=str(mp_pay_id))

    db.commit()
    return jsonify({"ok": True}), 200


@app.route("/api/payments/history", methods=["GET"])
@require_auth
def payment_history():
    db   = get_db()
    user = current_user(db)
    pays = (db.query(Payment).filter_by(user_id=user.id)
            .order_by(Payment.created_at.desc()).limit(20).all())
    return jsonify({"payments": [p.to_dict() for p in pays]})


# ============================================================
# ADMIN
# ============================================================

@app.route("/api/admin/config", methods=["GET"])
@require_admin
def admin_get_config():
    db  = get_db()
    cfg = get_admin_config(db)
    safe = dict(cfg)
    for secret_key in ("mp_access_token", "mp_public_key"):
        if safe.get(secret_key):
            k = safe[secret_key]
            safe[secret_key] = k[:6] + "****" + k[-4:] if len(k) > 10 else "****"
    return jsonify({"config": safe})


@app.route("/api/admin/config", methods=["POST"])
@require_admin
def admin_set_config():
    db = get_db()
    d  = request.get_json() or {}
    allowed_keys = {
        "mp_access_token", "mp_public_key", "mp_sandbox",
    }
    for key, val in d.items():
        if key in allowed_keys:
            set_admin_config(db, key, str(val).strip())
    db.commit()
    return jsonify({"message": "Configurações salvas com sucesso!"})


@app.route("/api/admin/config/raw", methods=["GET"])
@require_admin
def admin_get_config_raw():
    """Returns config with partial masking — para pré-preencher o formulário."""
    db  = get_db()
    cfg = get_admin_config(db)
    safe = dict(cfg)
    for secret_key in ("mp_access_token", "mp_public_key"):
        val = safe.get(secret_key, "")
        if val:
            safe[secret_key + "_preview"] = val[:6] + "****" + val[-4:] if len(val) > 10 else "****"
            safe[secret_key + "_len"]     = len(val)
    return jsonify({"config": safe})


@app.route("/api/admin/stats", methods=["GET"])
@require_admin
def admin_stats():
    db = get_db()
    return jsonify({
        "users":         db.query(User).count(),
        "devs":          db.query(User).filter_by(type="dev").count(),
        "companies":     db.query(User).filter_by(type="company").count(),
        "active_jobs":   db.query(Job).filter_by(active=True).count(),
        "applications":  db.query(Application).count(),
        "total_payments": db.query(Payment).count(),
        "finished_payments": db.query(Payment).filter_by(status="finished").count(),
    })


@app.route("/api/admin/payments", methods=["GET"])
@require_admin
def admin_payments():
    db   = get_db()
    pays = db.query(Payment).order_by(Payment.created_at.desc()).limit(50).all()
    result = []
    for p in pays:
        u = db.query(User).filter_by(id=p.user_id).first()
        d = p.to_dict()
        d["user_name"]  = u.name if u else "?"
        d["user_email"] = u.email if u else "?"
        result.append(d)
    return jsonify({"payments": result})


@app.route("/api/admin/test-mercadopago", methods=["POST"])
@require_admin
def admin_test_mercadopago():
    """Testa o Access Token do Mercado Pago."""
    db           = get_db()
    access_token = get_mp_access_token(db)
    sandbox      = is_mp_sandbox(db)
    env_label    = "Sandbox 🧪" if sandbox else "Produção 🚀"

    if not access_token:
        return jsonify({"ok": False, "error": "Access Token não configurado."}), 400

    try:
        resp = http_requests.get(
            f"{MP_API_BASE}/users/me",
            headers=mp_headers(access_token),
            timeout=10
        )
        data = resp.json()
        if not resp.ok:
            msg = data.get("message", data.get("error", "Token inválido"))
            return jsonify({"ok": False, "error": f"Token inválido para {env_label}: {msg}"})

        nickname = data.get("nickname") or data.get("email") or "OK"
        return jsonify({
            "ok": True,
            "message": f"✅ Token válido! Conta MP: {nickname} | Ambiente: {env_label}",
        })
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502

# ============================================================
# APPLICANTS — Dono da vaga vê candidatos e seus dados
# ============================================================

@app.route("/api/jobs/<int:job_id>/applicants")
@require_auth
def get_job_applicants(job_id):
    """Retorna todos os candidatos de uma vaga (apenas para o dono da vaga)."""
    db   = get_db()
    user = current_user(db)

    job = db.query(Job).filter_by(id=job_id, owner_id=user.id).first()
    if not job:
        return jsonify({"error": "Vaga não encontrada ou sem permissão."}), 404

    applications = db.query(Application).filter_by(job_id=job_id).order_by(Application.applied_at.desc()).all()
    result = []
    for appl in applications:
        candidate = db.query(User).filter_by(id=appl.user_id, is_active=True).first()
        if not candidate:
            continue
        unread = (db.query(Message)
                  .filter_by(application_id=appl.id, receiver_id=user.id)
                  .filter(Message.read_at == None).count())
        result.append({
            "application_id": appl.id,
            "status":         appl.status,
            "cover_note":     appl.cover_note or "",
            "applied_at":     appl.applied_at.isoformat()+"Z" if appl.applied_at else None,
            "unread_messages": unread,
            "candidate": {
                "id":          candidate.id,
                "name":        candidate.name,
                "email":       candidate.email,
                "role":        candidate.role or "",
                "bio":         candidate.bio or "",
                "skills":      candidate.skills or [],
                "linkedin":    candidate.linkedin or "",
                "github":      candidate.github or "",
                "avatar_url":  candidate.avatar_url or "",
                "experiences": [e.to_dict() for e in candidate.experiences],
                "portfolio":   [p.to_dict() for p in candidate.portfolio],
            }
        })

    return jsonify({"job": {"id": job.id, "title": job.title},
                    "applicants": result, "total": len(result)})


@app.route("/api/jobs/<int:job_id>/applicants/<int:application_id>/status", methods=["PUT"])
@require_auth
def update_application_status(job_id, application_id):
    """Dono da vaga atualiza status da candidatura."""
    db   = get_db()
    user = current_user(db)

    job = db.query(Job).filter_by(id=job_id, owner_id=user.id).first()
    if not job:
        return jsonify({"error": "Vaga não encontrada ou sem permissão."}), 404

    appl = db.query(Application).filter_by(id=application_id, job_id=job_id).first()
    if not appl:
        return jsonify({"error": "Candidatura não encontrada."}), 404

    d      = request.get_json() or {}
    status = d.get("status", "")
    valid  = {"pending", "viewed", "accepted", "rejected"}
    if status not in valid:
        return jsonify({"error": f"Status inválido. Use: {', '.join(valid)}"}), 400

    appl.status = status
    db.commit()
    return jsonify({"message": "Status atualizado!", "status": appl.status})


# ============================================================
# MESSAGES — Sistema de mensagens entre recrutador e candidato
# ============================================================

@app.route("/api/messages/conversations", methods=["GET"])
@require_auth
def list_conversations():
    """Lista todas as conversas do usuário logado."""
    db   = get_db()
    user = current_user(db)

    app_ids = set()

    if user.type == "company":
        owned_jobs = db.query(Job).filter_by(owner_id=user.id).all()
        for j in owned_jobs:
            for a in j.applications:
                app_ids.add(a.id)
    else:
        user_apps = db.query(Application).filter_by(user_id=user.id).all()
        for a in user_apps:
            app_ids.add(a.id)

    msgs_in = (db.query(Message.application_id)
               .filter(or_(Message.sender_id == user.id, Message.receiver_id == user.id))
               .distinct().all())
    for (aid,) in msgs_in:
        app_ids.add(aid)

    conversations = []
    for app_id in app_ids:
        appl = db.query(Application).filter_by(id=app_id).first()
        if not appl:
            continue
        job = db.query(Job).filter_by(id=appl.job_id).first()
        if not job:
            continue

        other_user_id = appl.user_id if user.id == job.owner_id else job.owner_id
        other_user    = db.query(User).filter_by(id=other_user_id, is_active=True).first()

        last_msg = (db.query(Message).filter_by(application_id=app_id)
                    .order_by(Message.created_at.desc()).first())
        unread   = (db.query(Message).filter_by(application_id=app_id, receiver_id=user.id)
                    .filter(Message.read_at == None).count())

        conversations.append({
            "application_id": app_id,
            "job_id":         job.id,
            "job_title":      job.title,
            "other_user": {"id": other_user.id, "name": other_user.name, "role": other_user.role or "", "avatar_url": other_user.avatar_url or ""} if other_user else None,
            "last_message":   last_msg.to_dict() if last_msg else None,
            "unread":         unread,
        })

    conversations.sort(
        key=lambda x: x["last_message"]["created_at"] if x["last_message"] else "",
        reverse=True
    )
    return jsonify({"conversations": conversations})


@app.route("/api/messages/<int:application_id>", methods=["GET"])
@require_auth
def get_messages(application_id):
    """Retorna mensagens de uma candidatura (conversa entre recrutador e candidato)."""
    db   = get_db()
    user = current_user(db)

    appl = db.query(Application).filter_by(id=application_id).first()
    if not appl:
        return jsonify({"error": "Candidatura não encontrada."}), 404

    job = db.query(Job).filter_by(id=appl.job_id).first()
    if user.id != appl.user_id and (not job or user.id != job.owner_id):
        return jsonify({"error": "Sem permissão."}), 403

    messages = (db.query(Message).filter_by(application_id=application_id)
                .order_by(Message.created_at.asc()).all())

    for msg in messages:
        if msg.receiver_id == user.id and not msg.read_at:
            msg.read_at = datetime.utcnow()
    db.commit()

    other_user_id = appl.user_id if user.id == job.owner_id else job.owner_id
    other_user    = db.query(User).filter_by(id=other_user_id, is_active=True).first()

    return jsonify({
        "application_id": application_id,
        "job_title":      job.title if job else "",
        "other_user":     {"id": other_user.id, "name": other_user.name, "role": other_user.role or ""} if other_user else None,
        "messages":       [m.to_dict() for m in messages],
    })


@app.route("/api/messages", methods=["POST"])
@require_auth
def send_message():
    """Envia mensagem em uma candidatura."""
    db   = get_db()
    user = current_user(db)
    d    = request.get_json() or {}

    application_id = d.get("application_id")
    content        = (d.get("content") or "").strip()
    file_url       = d.get("file_url") or None
    file_name      = d.get("file_name") or None
    file_type      = d.get("file_type") or None

    if not application_id or (not content and not file_url):
        return jsonify({"error": "application_id e content (ou arquivo) são obrigatórios."}), 400
    if content and len(content) > 2000:
        return jsonify({"error": "Mensagem muito longa (máx 2000 caracteres)."}), 400

    appl = db.query(Application).filter_by(id=application_id).first()
    if not appl:
        return jsonify({"error": "Candidatura não encontrada."}), 404

    job = db.query(Job).filter_by(id=appl.job_id).first()
    if user.id != appl.user_id and (not job or user.id != job.owner_id):
        return jsonify({"error": "Sem permissão."}), 403

    receiver_id = appl.user_id if user.id == job.owner_id else job.owner_id

    msg = Message(sender_id=user.id, receiver_id=receiver_id,
                  application_id=application_id, content=content or None,
                  file_url=file_url, file_name=file_name, file_type=file_type)
    db.add(msg)
    db.commit()
    db.refresh(msg)

    return jsonify({"message": msg.to_dict()}), 201


@app.route("/api/messages/upload", methods=["POST"])
@require_auth
def upload_message_file():
    """Faz upload de arquivo para uso em mensagem."""
    if "file" not in request.files:
        return jsonify({"error": "Nenhum arquivo enviado."}), 400
    f = request.files["file"]
    if not f.filename:
        return jsonify({"error": "Nome de arquivo inválido."}), 400

    f.seek(0, 2)
    size = f.tell()
    f.seek(0)
    if size > MAX_FILE_BYTES:
        return jsonify({"error": "Arquivo muito grande (máx 100MB)."}), 400

    ext      = os.path.splitext(secure_filename(f.filename))[1].lower()
    uid_name = f"{uuid.uuid4().hex}{ext}"
    save_path = os.path.join(UPLOAD_FOLDER, uid_name)
    f.save(save_path)

    file_url  = f"/api/messages/files/{uid_name}"
    file_type = f.content_type or "application/octet-stream"

    return jsonify({
        "file_url":  file_url,
        "file_name": f.filename,
        "file_type": file_type,
    }), 201


@app.route("/api/messages/files/<path:filename>", methods=["GET"])
@require_auth
def serve_message_file(filename):
    """Serve arquivos de mensagens (somente usuários autenticados)."""
    from flask import send_from_directory
    return send_from_directory(UPLOAD_FOLDER, filename)


@app.route("/api/messages/unread-count", methods=["GET"])
@require_auth
def unread_count():
    """Retorna número total de mensagens não lidas."""
    db    = get_db()
    user  = current_user(db)
    count = (db.query(Message).filter_by(receiver_id=user.id)
             .filter(Message.read_at == None).count())
    return jsonify({"unread": count})


# ============================================================
# RESUMES
# ============================================================

@app.route("/api/resumes/<int:candidate_id>")
@require_auth
def view_resume(candidate_id):
    db     = get_db()
    viewer = current_user(db)
    if viewer.type != "company":
        return jsonify({"error": "Apenas empresas podem ver currículos."}), 403

    candidate = db.query(User).filter_by(id=candidate_id, type="dev", is_active=True).first()
    if not candidate:
        return jsonify({"error": "Candidato não encontrado."}), 404

    cost = CREDIT_COSTS["view_resume"]
    if not spend_credits(db, viewer, cost, f"Ver currículo: {candidate.name}"):
        return jsonify({"error": f"Créditos insuficientes ({cost} necessários).",
                        "required": cost, "balance": viewer.credits}), 402
    db.commit()

    return jsonify({
        "resume": {
            "id": candidate.id, "name": candidate.name, "role": candidate.role or "",
            "bio": candidate.bio or "", "skills": candidate.skills or [],
            "linkedin": candidate.linkedin or "", "github": candidate.github or "",
            "experiences": [e.to_dict() for e in candidate.experiences],
            "portfolio":   [p.to_dict() for p in candidate.portfolio],
        },
        "credits_spent": cost, "balance": viewer.credits,
    })

# ============================================================
# HEALTH & STATS
# ============================================================

@app.route("/api/health")
def health():
    db = get_db()
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except:
        db_ok = False
    return jsonify({"status": "ok", "db": "connected" if db_ok else "error",
                    "timestamp": datetime.utcnow().isoformat()+"Z"})


@app.route("/api/stats")
def stats():
    db = get_db()
    return jsonify({
        "users":        db.query(User).count(),
        "devs":         db.query(User).filter_by(type="dev").count(),
        "companies":    db.query(User).filter_by(type="company").count(),
        "active_jobs":  db.query(Job).filter_by(active=True).count(),
        "applications": db.query(Application).count(),
    })

# ============================================================
# ERROR HANDLERS
# ============================================================

@app.errorhandler(404)
def not_found(e):
    return jsonify({"error": "Rota não encontrada."}), 404

@app.errorhandler(500)
def server_error(e):
    return jsonify({"error": "Erro interno.", "detail": str(e)}), 500

# ============================================================
# RUN
# ============================================================

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    print(f"\n{'='*50}")
    print(f"  TechFreela API — Flask + MySQL")
    print(f"  http://127.0.0.1:{port}")
    print(f"{'='*50}\n")
    app.run(debug=True, host="0.0.0.0", port=port)