"""
============================================================
TECHFREELA — migrate_avatar.py
Adiciona a coluna avatar_url na tabela users (produção)

Execute localmente apontando para o banco do Easypanel:
    DATABASE_URL="mysql+pymysql://..." python migrate_avatar.py

Ou via terminal do Easypanel (dentro do container):
    python migrate_avatar.py
============================================================
"""

import sys
import os

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

try:
    import pymysql
except ImportError:
    sys.exit("ERRO: pip install pymysql")

# ── Lê a mesma DATABASE_URL que o app.py usa ─────────────────
DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+pymysql://root:UEgcKqkJhSyRgJHqiaoUwuaunXNWLTnH"
    "@shortline.proxy.rlwy.net:41195/railway?charset=utf8mb4"
)

# Extrai parâmetros de conexão da URL
# Formato: mysql+pymysql://user:pass@host:port/dbname?...
def parse_db_url(url):
    url = url.replace("mysql+pymysql://", "").replace("mysql://", "")
    auth, rest   = url.split("@", 1)
    user, passwd = auth.split(":", 1)
    hostport, dbpart = rest.split("/", 1)
    dbname = dbpart.split("?")[0]
    if ":" in hostport:
        host, port = hostport.rsplit(":", 1)
        port = int(port)
    else:
        host, port = hostport, 3306
    return host, port, user, passwd, dbname

host, port, user, passwd, dbname = parse_db_url(DATABASE_URL)

def run():
    print("\n" + "="*55)
    print("  TechFreela — Migração: avatar_url")
    print("="*55)
    print(f"\n  Host:  {host}:{port}")
    print(f"  Banco: {dbname}\n")

    try:
        conn = pymysql.connect(
            host=host, port=port,
            user=user, password=passwd,
            database=dbname, charset="utf8mb4",
            autocommit=True
        )
        print("✓ Conectado ao MySQL!\n")
    except Exception as e:
        sys.exit(f"✗ Falha na conexão: {e}")

    cursor = conn.cursor()

    # ── Verifica se avatar_url já existe ──────────────────────
    print("[ 1/2 ] Verificando coluna avatar_url na tabela users...")
    cursor.execute("""
        SELECT COUNT(*) FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = %s
          AND TABLE_NAME   = 'users'
          AND COLUMN_NAME  = 'avatar_url'
    """, (dbname,))
    exists = cursor.fetchone()[0]

    if exists:
        print("        ✓ Coluna avatar_url já existe — nada a fazer.\n")
    else:
        print("        → Coluna não encontrada, adicionando...")
        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN avatar_url VARCHAR(500) NULL
            COMMENT 'URL da foto de perfil do usuário'
            AFTER github
        """)
        print("        ✓ Coluna avatar_url adicionada com sucesso!\n")

    # ── Verificação final ──────────────────────────────────────
    print("[ 2/2 ] Verificação final...")
    cursor.execute("SHOW COLUMNS FROM users LIKE 'avatar_url'")
    col = cursor.fetchone()
    if col:
        print(f"        ✓ avatar_url confirmada: {col}\n")
    else:
        print("        ✗ ERRO: coluna não encontrada após migração!\n")

    cursor.execute("SELECT COUNT(*) FROM users")
    total = cursor.fetchone()[0]
    print(f"        Total de usuários na tabela: {total}")

    print("\n" + "="*55)
    print("  MIGRAÇÃO CONCLUÍDA! ✅")
    print("="*55)
    print("""
  PRÓXIMOS PASSOS:
  1. Faça redeploy da aplicação no Easypanel
  2. Usuários podem agora fazer upload de foto de perfil
  3. A coluna aceita NULL — usuários sem foto continuam
     funcionando normalmente com as iniciais
""")

    cursor.close()
    conn.close()

if __name__ == "__main__":
    run()