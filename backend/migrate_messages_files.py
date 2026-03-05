import pymysql, sys

conn = pymysql.connect(
    host="easypanel.pontocomdesconto.com.br", port=3307,
    user="mysql", password="d8f0525bbe9dea9e3097",
    database="techfreela", charset="utf8mb4", autocommit=True
)
cur = conn.cursor()

for col, definition in [
    ("file_url",  "VARCHAR(500) NULL"),
    ("file_name", "VARCHAR(255) NULL"),
    ("file_type", "VARCHAR(100) NULL"),
]:
    cur.execute(f"SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='techfreela' AND TABLE_NAME='messages' AND COLUMN_NAME='{col}'")
    if cur.fetchone()[0] == 0:
        cur.execute(f"ALTER TABLE messages ADD COLUMN {col} {definition}")
        print(f"✓ Coluna {col} adicionada")
    else:
        print(f"  {col} já existe, pulando")

# Permite content ser NULL
cur.execute("ALTER TABLE messages MODIFY COLUMN content TEXT NULL")
print("✓ content agora é nullable")

conn.close()
print("\n✅ Migração concluída!")