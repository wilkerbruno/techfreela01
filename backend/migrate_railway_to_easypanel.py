"""
============================================================
TECHFREELA — migrate_railway_to_easypanel.py
Faz backup do banco Railway e restaura no Easypanel MySQL
============================================================
Uso:
    pip install pymysql
    python migrate_railway_to_easypanel.py
============================================================
"""

import sys
import json
from datetime import datetime

try:
    import pymysql
    import pymysql.cursors
except ImportError:
    sys.exit("ERRO: Execute 'pip install pymysql' antes de rodar este script.")

# ── ORIGEM (Railway) ──────────────────────────────────────────
SRC_HOST = "shortline.proxy.rlwy.net"
SRC_PORT = 41195
SRC_USER = "root"
SRC_PASS = "UEgcKqkJhSyRgJHqiaoUwuaunXNWLTnH"
SRC_DB   = "railway"

# ── DESTINO (Easypanel) ───────────────────────────────────────
DST_HOST = "easypanel.pontocomdesconto.com.br"
DST_PORT = 3307
DST_USER = "mysql"
DST_PASS = "d8f0525bbe9dea9e3097"
DST_DB   = "techfreela"

# ─────────────────────────────────────────────────────────────

def connect(host, port, user, password, db):
    return pymysql.connect(
        host=host, port=port,
        user=user, password=password,
        database=db, charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=False,
        connect_timeout=15
    )

def get_tables(cursor, db_name):
    cursor.execute(
        "SELECT TABLE_NAME FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = %s AND TABLE_TYPE = 'BASE TABLE' "
        "ORDER BY TABLE_NAME",
        (db_name,)
    )
    return [row["TABLE_NAME"] for row in cursor.fetchall()]

def get_create_statement(cursor, table):
    cursor.execute(f"SHOW CREATE TABLE `{table}`")
    row = cursor.fetchone()
    return row["Create Table"]

def fetch_all_rows(cursor, table):
    cursor.execute(f"SELECT * FROM `{table}`")
    return cursor.fetchall()

def serialize_value(v):
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(v, (bytes, bytearray)):
        return v.decode("utf-8", errors="replace")
    return v

def build_insert(table, rows):
    if not rows:
        return []
    cols = ", ".join(f"`{c}`" for c in rows[0].keys())
    stmts = []
    for row in rows:
        vals = tuple(serialize_value(v) for v in row.values())
        stmts.append((
            f"INSERT INTO `{table}` ({cols}) VALUES ({', '.join(['%s']*len(vals))})",
            vals
        ))
    return stmts

def main():
    print("\n" + "="*60)
    print("  TechFreela — Migração Railway → Easypanel")
    print("="*60)

    print(f"\n[1/5] Conectando à origem  ({SRC_HOST}:{SRC_PORT}/{SRC_DB})...")
    try:
        src_conn   = connect(SRC_HOST, SRC_PORT, SRC_USER, SRC_PASS, SRC_DB)
        src_cursor = src_conn.cursor()
        print("      ✓ Conectado ao Railway!")
    except Exception as e:
        sys.exit(f"      ✗ Falha na origem: {e}")

    print(f"\n[2/5] Conectando ao destino ({DST_HOST}:{DST_PORT}/{DST_DB})...")
    try:
        dst_conn   = connect(DST_HOST, DST_PORT, DST_USER, DST_PASS, DST_DB)
        dst_cursor = dst_conn.cursor()
        print("      ✓ Conectado ao Easypanel!")
    except Exception as e:
        src_conn.close()
        sys.exit(f"      ✗ Falha no destino: {e}")

    print(f"\n[3/5] Lendo estrutura do banco origem...")
    tables = get_tables(src_cursor, SRC_DB)
    if not tables:
        sys.exit("      ✗ Nenhuma tabela encontrada na origem!")
    print(f"      ✓ {len(tables)} tabela(s): {', '.join(tables)}")

    print(f"\n[4/5] Recriando estrutura no destino...")
    dst_cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    for table in tables:
        print(f"      › Tabela `{table}`...", end=" ", flush=True)
        try:
            create_sql = get_create_statement(src_cursor, table)
            dst_cursor.execute(f"DROP TABLE IF EXISTS `{table}`")
            dst_cursor.execute(create_sql)
            dst_conn.commit()
            print("✓")
        except Exception as e:
            print(f"✗ ERRO: {e}")
            dst_conn.rollback()
    dst_cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
    dst_conn.commit()

    print(f"\n[5/5] Copiando dados...")
    total_rows = 0
    dst_cursor.execute("SET FOREIGN_KEY_CHECKS = 0")
    for table in tables:
        try:
            rows = fetch_all_rows(src_cursor, table)
            if not rows:
                print(f"      › `{table}`: vazia, pulando.")
                continue
            inserts = build_insert(table, rows)
            for sql, vals in inserts:
                dst_cursor.execute(sql, vals)
            dst_conn.commit()
            total_rows += len(rows)
            print(f"      › `{table}`: {len(rows)} registro(s) ✓")
        except Exception as e:
            dst_conn.rollback()
            print(f"      › `{table}`: ✗ ERRO — {e}")
    dst_cursor.execute("SET FOREIGN_KEY_CHECKS = 1")
    dst_conn.commit()

    src_cursor.close(); src_conn.close()
    dst_cursor.close(); dst_conn.close()

    print("\n" + "="*60)
    print(f"  ✅ Migração concluída! {total_rows} registro(s) transferido(s).")
    print("="*60 + "\n")

if __name__ == "__main__":
    main()