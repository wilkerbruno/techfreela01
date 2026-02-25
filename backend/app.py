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

from models.database import Base, User, Job, Experience, PortfolioItem, Application, CreditEvent, Payment, AdminConfig

# ============================================================
# CONFIGURAÇÃO
# ============================================================

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+pymysql://root:UEgcKqkJhSyRgJHqiaoUwuaunXNWLTnH"
    "@shortline.proxy.rlwy.net:41195/railway?charset=utf8mb4"
)

CREDIT_COSTS    = {"view_job": 2, "apply_job": 5, "post_job": 20, "view_resume": 3}
CREDIT_PACKAGES = [
    {"id": "starter",  "credits": 50,  "price": 9.90,  "label": "Iniciante"},
    {"id": "pro",      "credits": 150, "price": 24.90, "label": "Profissional"},
    {"id": "business", "credits": 400, "price": 59.90, "label": "Empresarial"},
]
WELCOME_CREDITS  = 10
JOB_DURATION_DAYS = 30

NOWPAYMENTS_API  = "https://api.nowpayments.io/v1"
NOWPAYMENTS_SANDBOX_API = "https://api-sandbox.nowpayments.io/v1"

# ============================================================
# FLASK
# ============================================================

app = Flask(__name__, static_folder="../", static_url_path="/")
app.secret_key = os.environ.get("SECRET_KEY", "techfreela-dev-secret-2025-xk9m")
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

if HAS_CORS:
    CORS(app, supports_credentials=True, origins=[
        "http://localhost:5000", "http://127.0.0.1:5000",
        "http://localhost:5500", "http://127.0.0.1:5500",
    ])

# ============================================================
# DATABASE
# ============================================================

try:
    engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300,
                           pool_size=5, max_overflow=10, echo=False)
    with engine.connect() as c:
        ver = c.execute(text("SELECT VERSION()")).fetchone()[0]
    print(f"✓ MySQL Railway conectado! Versão: {ver}")
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

def nowpayments_headers(api_key):
    return {"x-api-key": api_key, "Content-Type": "application/json"}

def get_nowpayments_base(db):
    cfg = get_admin_config(db)
    sandbox = cfg.get("nowpayments_sandbox", "true").lower() == "true"
    return NOWPAYMENTS_SANDBOX_API if sandbox else NOWPAYMENTS_API

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
# PAYMENTS — NOWPayments Integration
# ============================================================

@app.route("/api/payments/create", methods=["POST"])
@require_auth
def create_payment():
    """Create a NOWPayments invoice and return the checkout URL."""
    db   = get_db()
    user = current_user(db)
    d    = request.get_json() or {}

    pkg = next((p for p in CREDIT_PACKAGES if p["id"] == d.get("package_id")), None)
    if not pkg:
        return jsonify({"error": "Pacote inválido."}), 400

    cfg = get_admin_config(db)
    api_key  = cfg.get("nowpayments_api_key", "")
    wallet   = cfg.get("receiving_wallet", "")
    currency = cfg.get("receiving_currency", "usdttrc20")
    ipn_secret = cfg.get("nowpayments_ipn_secret", "")

    if not api_key:
        return jsonify({"error": "Pagamentos não configurados. Contate o administrador."}), 503

    base_url = get_nowpayments_base(db)
    site_url = request.host_url.rstrip("/")

    payload = {
        "price_amount":    pkg["price"],
        "price_currency":  "brl",
        "pay_currency":    currency,
        "order_id":        f"TF-{user.id}-{int(datetime.utcnow().timestamp())}",
        "order_description": f"TechFreela — {pkg['credits']} créditos ({pkg['label']})",
        "ipn_callback_url": f"{site_url}/api/payments/webhook",
        "success_url":      f"{site_url}/?payment=success",
        "cancel_url":       f"{site_url}/?payment=cancel",
        "is_fixed_rate":    False,
        "is_fee_paid_by_user": False,
    }

    if wallet:
        payload["payout_address"] = wallet
        payload["payout_currency"] = currency

    try:
        resp = http_requests.post(
            f"{base_url}/invoice",
            json=payload,
            headers=nowpayments_headers(api_key),
            timeout=15
        )
        resp_data = resp.json()
        if not resp.ok:
            return jsonify({"error": resp_data.get("message", "Erro ao criar pagamento.")}), 502
    except Exception as e:
        return jsonify({"error": f"Falha de comunicação com gateway: {str(e)}"}), 502

    invoice_id  = resp_data.get("id") or resp_data.get("invoice_id")
    invoice_url = resp_data.get("invoice_url") or resp_data.get("payment_url")

    pay = Payment(
        user_id=user.id,
        package_id=pkg["id"],
        credits=pkg["credits"],
        amount_brl=str(pkg["price"]),
        payment_method=d.get("method", "pix"),
        status="pending",
        invoice_id=str(invoice_id) if invoice_id else None,
        invoice_url=invoice_url,
        ipn_callback_secret=ipn_secret,
    )
    db.add(pay)
    db.commit()
    db.refresh(pay)

    return jsonify({
        "payment_id":  pay.id,
        "invoice_url": invoice_url,
        "invoice_id":  invoice_id,
        "package":     pkg,
    }), 201


@app.route("/api/payments/<int:payment_id>/status", methods=["GET"])
@require_auth
def payment_status(payment_id):
    """Poll payment status."""
    db   = get_db()
    user = current_user(db)
    pay  = db.query(Payment).filter_by(id=payment_id, user_id=user.id).first()
    if not pay:
        return jsonify({"error": "Pagamento não encontrado."}), 404

    # If finished, return immediately
    if pay.status == "finished":
        return jsonify({"status": pay.status, "payment": pay.to_dict(), "balance": user.credits})

    # If we have a nowpayments_id, check live status
    if pay.nowpayments_id:
        cfg = get_admin_config(db)
        api_key = cfg.get("nowpayments_api_key", "")
        base_url = get_nowpayments_base(db)
        if api_key:
            try:
                resp = http_requests.get(
                    f"{base_url}/payment/{pay.nowpayments_id}",
                    headers=nowpayments_headers(api_key),
                    timeout=10
                )
                if resp.ok:
                    rd = resp.json()
                    pay.status = rd.get("payment_status", pay.status)
                    if pay.status in ("finished","confirmed") and not pay.paid_at:
                        pay.paid_at = datetime.utcnow()
                        pkg = next((p for p in CREDIT_PACKAGES if p["id"] == pay.package_id), None)
                        if pkg:
                            add_credits(db, user, pay.credits,
                                        reason=f"Compra {pkg['label']} ({pay.credits} cr)",
                                        ref=pay.nowpayments_id)
                    db.commit()
            except Exception:
                pass

    return jsonify({"status": pay.status, "payment": pay.to_dict(), "balance": user.credits})


@app.route("/api/payments/webhook", methods=["POST"])
def payment_webhook():
    """NOWPayments IPN webhook — credits user upon confirmed payment."""
    data = request.get_json(silent=True) or request.form.to_dict()
    if not data:
        return jsonify({"ok": False}), 400

    nowpay_id  = str(data.get("payment_id", ""))
    order_id   = str(data.get("order_id", ""))       # TF-{user_id}-{ts}
    new_status = data.get("payment_status", "")

    db = get_db()

    # Verify IPN signature if secret configured
    cfg = get_admin_config(db)
    ipn_secret = cfg.get("nowpayments_ipn_secret", "")
    if ipn_secret:
        received_sig = request.headers.get("x-nowpayments-sig", "")
        sorted_data  = json.dumps(dict(sorted(data.items())), separators=(",", ":"))
        expected_sig = hmac.new(ipn_secret.encode(), sorted_data.encode(), "sha512").hexdigest()
        if not hmac.compare_digest(received_sig, expected_sig):
            return jsonify({"ok": False, "error": "Invalid signature"}), 403

    # Find payment by order_id or nowpayments_id
    pay = (db.query(Payment).filter_by(nowpayments_id=nowpay_id).first()
           or db.query(Payment).filter(Payment.invoice_id.isnot(None)).filter(
               Payment.user_id == int(order_id.split("-")[1]) if order_id.startswith("TF-") else False
           ).first())

    if not pay:
        # Try to find by user/order pattern
        try:
            parts   = order_id.split("-")
            user_id = int(parts[1]) if len(parts) >= 2 else None
            if user_id:
                pay = (db.query(Payment)
                       .filter_by(user_id=user_id, status="pending")
                       .order_by(Payment.created_at.desc()).first())
        except Exception:
            pass

    if not pay:
        return jsonify({"ok": False, "error": "Payment not found"}), 404

    pay.nowpayments_id = nowpay_id
    pay.status = new_status

    if new_status in ("finished", "confirmed") and not pay.paid_at:
        pay.paid_at = datetime.utcnow()
        user = db.query(User).filter_by(id=pay.user_id, is_active=True).first()
        if user:
            pkg = next((p for p in CREDIT_PACKAGES if p["id"] == pay.package_id), None)
            label = pkg["label"] if pkg else pay.package_id
            add_credits(db, user, pay.credits,
                        reason=f"Compra {label} ({pay.credits} cr) via NOWPayments",
                        etype="purchase", ref=nowpay_id)

    db.commit()
    return jsonify({"ok": True})


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
    # Never expose the raw API key — mask it
    safe = dict(cfg)
    if safe.get("nowpayments_api_key"):
        k = safe["nowpayments_api_key"]
        safe["nowpayments_api_key"] = k[:6] + "****" + k[-4:] if len(k) > 10 else "****"
    return jsonify({"config": safe})


@app.route("/api/admin/config", methods=["POST"])
@require_admin
def admin_set_config():
    db = get_db()
    d  = request.get_json() or {}
    allowed_keys = {
        "nowpayments_api_key", "nowpayments_ipn_secret", "nowpayments_sandbox",
        "receiving_wallet", "receiving_currency",
    }
    for key, val in d.items():
        if key in allowed_keys:
            set_admin_config(db, key, str(val).strip())
    db.commit()
    return jsonify({"message": "Configurações salvas com sucesso!"})


@app.route("/api/admin/config/raw", methods=["GET"])
@require_admin
def admin_get_config_raw():
    """Returns unmasked config — used internally for test connection."""
    db  = get_db()
    cfg = get_admin_config(db)
    return jsonify({"config": cfg})


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


@app.route("/api/admin/test-nowpayments", methods=["POST"])
@require_admin
def admin_test_nowpayments():
    """Test NOWPayments API key connectivity."""
    db  = get_db()
    cfg = get_admin_config(db)
    api_key  = cfg.get("nowpayments_api_key", "")
    if not api_key:
        return jsonify({"ok": False, "error": "API Key não configurada."}), 400
    base_url = get_nowpayments_base(db)
    try:
        resp = http_requests.get(
            f"{base_url}/status",
            headers=nowpayments_headers(api_key),
            timeout=10
        )
        data = resp.json()
        return jsonify({"ok": resp.ok, "message": data.get("message", str(data))})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 502

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
    print(f"  TechFreela API — Flask + MySQL Railway")
    print(f"  http://127.0.0.1:{port}")
    print(f"{'='*50}\n")
    app.run(debug=True, host="0.0.0.0", port=port)