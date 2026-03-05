"""
============================================================
TECHFREELA — migrate_avatar_base64.py
Converte a coluna avatar_url de VARCHAR(500) para MEDIUMTEXT
para suportar imagens em base64 diretamente no banco.

Execute no terminal do Easypanel (dentro do container):
    cd /app/backend
    python migrate_avatar_base64.py

Ou localmente com a URL de produção:
    DATABASE_URL="mysql+pymysql://..." python migrate_avatar_base64.py
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

DATABASE_URL = os.environ.get(
    "DATABASE_URL",
    "mysql+pymysql://mysql:d8f0525bbe9dea9e3097"
    "@easypanel.pontocomdesconto.com.br:3307/techfreela?charset=utf8mb4"
)

def parse_db_url(url):
    url = url.replace("mysql+pymysql://", "").replace("mysql://", "")
    auth, rest   = url.split("@", 1)
    user, passwd = auth.split(":", 1)
    hostport, dbpart = rest.split("/", 1)
    dbname = dbpart.split("?")[0]
    host, port = (hostport.rsplit(":", 1) if ":" in hostport else (hostport, "3306"))
    return host, int(port), user, passwd, dbname

host, port, user, passwd, dbname = parse_db_url(DATABASE_URL)

def run():
    print("\n" + "="*55)
    print("  TechFreela — Migração: avatar_url → MEDIUMTEXT")
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
        print("✓ Conectado!\n")
    except Exception as e:
        sys.exit(f"✗ Falha na conexão: {e}")

    cursor = conn.cursor()

    # Verifica tipo atual da coluna
    print("[ 1/2 ] Verificando tipo atual da coluna avatar_url...")
    cursor.execute("""
        SELECT COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = %s
          AND TABLE_NAME   = 'users'
          AND COLUMN_NAME  = 'avatar_url'
    """, (dbname,))
    row = cursor.fetchone()

    if not row:
        # Coluna não existe — cria já como MEDIUMTEXT
        print("        → Coluna não existe, criando como MEDIUMTEXT...")
        cursor.execute("""
            ALTER TABLE users
            ADD COLUMN avatar_url MEDIUMTEXT NULL
            COMMENT 'Foto de perfil em base64 (data:image/...;base64,...)'
            AFTER github
        """)
        print("        ✓ Coluna avatar_url criada como MEDIUMTEXT!\n")
    else:
        col_type = row[0].upper()
        print(f"        Tipo atual: {col_type}")
        if "MEDIUMTEXT" in col_type or "LONGTEXT" in col_type:
            print("        ✓ Já é MEDIUMTEXT/LONGTEXT — nada a fazer.\n")
        else:
            print("        → Convertendo para MEDIUMTEXT...")
            cursor.execute("""
                ALTER TABLE users
                MODIFY COLUMN avatar_url MEDIUMTEXT NULL
                COMMENT 'Foto de perfil em base64 (data:image/...;base64,...)'
            """)
            print("        ✓ Convertido com sucesso!\n")

    # Verificação final
    print("[ 2/2 ] Verificação final...")
    cursor.execute("""
        SELECT COLUMN_TYPE FROM information_schema.COLUMNS
        WHERE TABLE_SCHEMA = %s AND TABLE_NAME = 'users' AND COLUMN_NAME = 'avatar_url'
    """, (dbname,))
    final = cursor.fetchone()
    print(f"        Tipo final: {final[0] if final else 'NÃO ENCONTRADO'}")

    cursor.execute("SELECT COUNT(*) FROM users WHERE avatar_url IS NOT NULL AND avatar_url != ''")
    with_avatar = cursor.fetchone()[0]
    print(f"        Usuários com avatar: {with_avatar}")

    print("\n" + "="*55)
    print("  MIGRAÇÃO CONCLUÍDA! ✅")
    print("="*55)
    print("""
  PRÓXIMOS PASSOS:
  1. Faça redeploy da aplicação no Easypanel
  2. Avatars agora são salvos como base64 no banco
     e persistem entre redeploys
""")
    cursor.close()
    conn.close()

if __name__ == "__main__":
    run()