"""
============================================================
TECHFREELA — migrate_services_quotes.py

Cria as tabelas:  services · quote_requests · quote_proposals
Atualiza:         users.avatar_url  VARCHAR(500) → MEDIUMTEXT

Execute no Easypanel (terminal do container):
    cd /app/backend && python migrate_services_quotes.py
============================================================
"""
import sys, os
try:
    from dotenv import load_dotenv; load_dotenv()
except ImportError:
    pass
try:
    import pymysql
except ImportError:
    sys.exit("ERRO: pip install pymysql")

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+pymysql://mysql:d8f0525bbe9dea9e3097"
    "@easypanel.pontocomdesconto.com.br:3307/techfreela?charset=utf8mb4"
)

def parse(url):
    url = url.replace("mysql+pymysql://","").replace("mysql://","")
    auth, rest   = url.split("@",1)
    u, pw        = auth.split(":",1)
    hp, db       = rest.split("/",1)
    db           = db.split("?")[0]
    h, p         = (hp.rsplit(":",1) if ":" in hp else (hp,"3306"))
    return h, int(p), u, pw, db

host, port, user, pw, dbname = parse(DATABASE_URL)

def run():
    print("\n"+"="*58)
    print("  TechFreela — Migração: services + quotes")
    print("="*58)
    try:
        conn = pymysql.connect(host=host,port=port,user=user,password=pw,
                               database=dbname,charset="utf8mb4",autocommit=True)
        print(f"✓ Conectado em {host}:{port}/{dbname}\n")
    except Exception as e:
        sys.exit(f"✗ Conexão falhou: {e}")
    cur = conn.cursor()

    # 1 — avatar_url
    print("[1/4] avatar_url → MEDIUMTEXT ...")
    cur.execute("""SELECT COLUMN_TYPE FROM information_schema.COLUMNS
                   WHERE TABLE_SCHEMA=%s AND TABLE_NAME='users' AND COLUMN_NAME='avatar_url'""",(dbname,))
    row = cur.fetchone()
    if not row:
        cur.execute("ALTER TABLE users ADD COLUMN avatar_url MEDIUMTEXT NULL AFTER github")
        print("      ✓ Criada como MEDIUMTEXT")
    elif "MEDIUMTEXT" not in row[0].upper() and "LONGTEXT" not in row[0].upper():
        cur.execute("ALTER TABLE users MODIFY COLUMN avatar_url MEDIUMTEXT NULL")
        print(f"      ✓ {row[0]} → MEDIUMTEXT")
    else:
        print(f"      ✓ Já é {row[0]}")

    # 2 — services
    print("[2/4] Criando services ...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS services (
            id            INT UNSIGNED NOT NULL AUTO_INCREMENT,
            company_id    INT UNSIGNED NOT NULL,
            title         VARCHAR(120) NOT NULL,
            description   TEXT         NULL,
            category      VARCHAR(80)  NULL,
            price         VARCHAR(50)  NOT NULL,
            delivery_days INT UNSIGNED NULL,
            active        TINYINT(1)   NOT NULL DEFAULT 1,
            created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            CONSTRAINT fk_svc_company FOREIGN KEY (company_id)
                REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_svc_company  (company_id),
            INDEX idx_svc_active   (active),
            INDEX idx_svc_category (category)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    print("      ✓ services OK")

    # 3 — quote_requests
    print("[3/4] Criando quote_requests ...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quote_requests (
            id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
            service_id   INT UNSIGNED NOT NULL,
            requester_id INT UNSIGNED NOT NULL,
            message      TEXT         NULL,
            status       ENUM('pending','responded','accepted','rejected','cancelled')
                         NOT NULL DEFAULT 'pending',
            created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            CONSTRAINT fk_qr_service   FOREIGN KEY (service_id)
                REFERENCES services(id) ON DELETE CASCADE,
            CONSTRAINT fk_qr_requester FOREIGN KEY (requester_id)
                REFERENCES users(id)    ON DELETE CASCADE,
            INDEX idx_qr_service   (service_id),
            INDEX idx_qr_requester (requester_id),
            INDEX idx_qr_status    (status)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    print("      ✓ quote_requests OK")

    # 4 — quote_proposals
    print("[4/4] Criando quote_proposals ...")
    cur.execute("""
        CREATE TABLE IF NOT EXISTS quote_proposals (
            id               INT UNSIGNED NOT NULL AUTO_INCREMENT,
            quote_request_id INT UNSIGNED NOT NULL,
            price            VARCHAR(50)  NOT NULL,
            delivery_days    INT UNSIGNED NULL,
            notes            TEXT         NULL,
            created_at       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            CONSTRAINT fk_qp_request FOREIGN KEY (quote_request_id)
                REFERENCES quote_requests(id) ON DELETE CASCADE,
            UNIQUE KEY uq_one_proposal (quote_request_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    """)
    print("      ✓ quote_proposals OK")

    cur.execute("SHOW TABLES")
    tables = sorted(r[0] for r in cur.fetchall())
    print(f"\n  Tabelas ({len(tables)}): {', '.join(tables)}")
    print("\n"+"="*58)
    print("  MIGRAÇÃO CONCLUÍDA ✅")
    print("  Próximo passo: redeploy no Easypanel.")
    print("="*58+"\n")
    cur.close(); conn.close()

if __name__ == "__main__":
    run()