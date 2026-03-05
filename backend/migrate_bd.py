"""
============================================================
TECHFREELA — migrate_db.py
Executa a migração do banco para suporte a NOWPayments + Admin
Coloque este arquivo em: backend/migrate_db.py
Execute com: python migrate_db.py
============================================================
"""

import sys

try:
    import pymysql
except ImportError:
    sys.exit("ERRO: pip install pymysql")

# ── Configuração ─────────────────────────────────────────────
DB_HOST = "easypanel.pontocomdesconto.com.br"
DB_PORT = 3307
DB_USER = "mysql"
DB_PASS = "d8f0525bbe9dea9e3097"
DB_NAME = "techfreela"
# ─────────────────────────────────────────────────────────────

def run():
    print("\n" + "="*55)
    print("  TechFreela — Migração do Banco de Dados")
    print("="*55)

    try:
        conn = pymysql.connect(
            host=DB_HOST, port=DB_PORT,
            user=DB_USER, password=DB_PASS,
            database=DB_NAME, charset="utf8mb4",
            autocommit=True
        )
        print(f"✓ Conectado ao MySQL Railway!\n")
    except Exception as e:
        sys.exit(f"✗ Falha na conexão: {e}")

    cursor = conn.cursor()

    # ── PASSO 1: Coluna is_admin em users ─────────────────────
    print("[ 1/4 ] Verificando coluna is_admin na tabela users...")
    cursor.execute("""
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'users' AND COLUMN_NAME = 'is_admin'
    """, (DB_NAME,))
    exists = cursor.fetchone()[0]

    if exists:
        print("        ✓ Coluna is_admin já existe, pulando.\n")
    else:
        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN is_admin TINYINT(1) NOT NULL DEFAULT 0
            COMMENT 'Flag de administrador da plataforma'
            AFTER is_active
        """)
        print("        ✓ Coluna is_admin adicionada com sucesso!\n")

    # ── PASSO 2: Tabela payments ───────────────────────────────
    print("[ 2/4 ] Criando tabela payments (se não existir)...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS payments (
            id                  INT UNSIGNED    NOT NULL AUTO_INCREMENT,
            user_id             INT UNSIGNED    NOT NULL,
            package_id          VARCHAR(50)     NOT NULL,
            credits             INT UNSIGNED    NOT NULL,
            amount_brl          VARCHAR(20)     NOT NULL,
            payment_method      ENUM('pix','credit_card','debit_card','crypto') NOT NULL DEFAULT 'pix',
            status              ENUM('pending','waiting','confirming','confirmed',
                                     'finished','failed','expired','refunded')  NOT NULL DEFAULT 'pending',
            nowpayments_id      VARCHAR(100)    NULL,
            invoice_id          VARCHAR(100)    NULL,
            invoice_url         VARCHAR(500)    NULL,
            ipn_callback_secret VARCHAR(100)    NULL,
            created_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
            updated_at          DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            paid_at             DATETIME        NULL,
            PRIMARY KEY (id),
            CONSTRAINT fk_payment_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE ON UPDATE CASCADE,
            INDEX  idx_payment_user   (user_id),
            INDEX  idx_payment_status (status),
            INDEX  idx_payment_date   (created_at),
            UNIQUE KEY uq_nowpayments_id (nowpayments_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          COMMENT='Pagamentos via NOWPayments'
    """)
    print("        ✓ Tabela payments OK!\n")

    # ── PASSO 3: Tabela admin_config ───────────────────────────
    print("[ 3/4 ] Criando tabela admin_config (se não existir)...")
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS admin_config (
            id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
            `key`       VARCHAR(100) NOT NULL,
            value       TEXT         NULL,
            updated_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_config_key (`key`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          COMMENT='Configurações administrativas da plataforma'
    """)
    print("        ✓ Tabela admin_config OK!\n")

    # ── PASSO 4: Dados padrão em admin_config ─────────────────
    print("[ 4/4 ] Inserindo configurações padrão...")
    defaults = [
        ("nowpayments_api_key",    ""),
        ("nowpayments_ipn_secret", ""),
        ("nowpayments_sandbox",    "true"),
        ("receiving_wallet",       ""),
        ("receiving_currency",     "usdttrc20"),
    ]
    inserted = 0
    for key, val in defaults:
        cursor.execute("INSERT IGNORE INTO admin_config (`key`, value) VALUES (%s, %s)", (key, val))
        inserted += cursor.rowcount
    print(f"        ✓ {inserted} configurações inseridas ({len(defaults)-inserted} já existiam).\n")

    # ── Verificação final ──────────────────────────────────────
    cursor.execute("SHOW TABLES")
    tables = [r[0] for r in cursor.fetchall()]
    print("="*55)
    print("  MIGRAÇÃO CONCLUÍDA COM SUCESSO! ✅")
    print("="*55)
    print(f"\nTabelas no banco ({len(tables)}):")
    for t in sorted(tables):
        print(f"  • {t}")

    # Verificar coluna is_admin
    cursor.execute("SHOW COLUMNS FROM users LIKE 'is_admin'")
    col = cursor.fetchone()
    print(f"\nColuna is_admin em users: {'✓ presente' if col else '✗ ausente'}")

    # Verificar admin_config
    cursor.execute("SELECT `key`, value FROM admin_config ORDER BY `key`")
    rows = cursor.fetchall()
    print(f"\nConfigs em admin_config ({len(rows)}):")
    for k, v in rows:
        display = "(vazio)" if not v else ("****" if "key" in k or "secret" in k else v)
        print(f"  • {k}: {display}")

    print("\n")
    print("  PRÓXIMOS PASSOS:")
    print("  1. Para virar admin, execute no MySQL:")
    print("     UPDATE users SET is_admin=1 WHERE email='SEU@EMAIL.COM';")
    print("  2. Faça login → clique em ⚙️ Admin → configure a NOWPayments")
    print("="*55 + "\n")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    run()