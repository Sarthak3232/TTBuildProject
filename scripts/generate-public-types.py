"""Refresh public Supabase TypeScript types from a migrated PostgreSQL catalog.

Preserves the separately supplied graphql_public schema and standard Supabase
helper aliases. Uses read-only catalog queries; never executes schema changes.
Run with a connection URL argument and psql on PATH (or PSQL).
"""

import json
import os
from pathlib import Path
import shutil
import subprocess
import sys


if len(sys.argv) != 2:
    raise SystemExit("Usage: python3 scripts/generate-public-types.py DATABASE_URL")
psql = os.environ.get("PSQL") or shutil.which("psql")
if not psql:
    candidate = Path("/opt/homebrew/opt/postgresql@17/bin/psql")
    psql = str(candidate) if candidate.exists() else None
if not psql:
    raise SystemExit("Install psql or set PSQL.")


def query(statement):
    result = subprocess.run(
        [psql, sys.argv[1], "-X", "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement],
        text=True, capture_output=True, check=True,
    )
    return json.loads(result.stdout)


columns = query("""
select coalesce(jsonb_agg(to_jsonb(c) order by table_name,ordinal_position),'[]')
from information_schema.columns c
where table_schema='public' and table_name in (
  select tablename from pg_tables where schemaname='public'
);
""")
relations = query("""
select coalesce(jsonb_agg(jsonb_build_object(
 'table',src.relname,'name',fk.conname,'relation',dst.relname,
 'columns',array(select a.attname from unnest(fk.conkey) with ordinality k(num,ord)
   join pg_attribute a on a.attrelid=fk.conrelid and a.attnum=k.num order by k.ord),
 'references',array(select a.attname from unnest(fk.confkey) with ordinality k(num,ord)
   join pg_attribute a on a.attrelid=fk.confrelid and a.attnum=k.num order by k.ord),
 'one',exists(select 1 from pg_constraint u where u.conrelid=fk.conrelid
   and u.contype in ('p','u') and u.conkey <@ fk.conkey)) order by src.relname,fk.conname),'[]')
from pg_constraint fk join pg_class src on src.oid=fk.conrelid
join pg_namespace ns on ns.oid=src.relnamespace
join pg_class dst on dst.oid=fk.confrelid
join pg_namespace dn on dn.oid=dst.relnamespace
where fk.contype='f' and ns.nspname='public' and dn.nspname='public';
""")
functions = query("""
select coalesce(jsonb_agg(jsonb_build_object('name',p.proname,
 'returns',p.prorettype::regtype::text,'defaults',p.pronargdefaults,
 'args',(select coalesce(jsonb_agg(jsonb_build_object('name',p.proargnames[a.ord],
   'type',a.typ::regtype::text) order by a.ord),'[]')
   from unnest(p.proargtypes::oid[]) with ordinality a(typ,ord))) order by p.proname),'[]')
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public' and p.prokind='f';
""")


def ts_type(name):
    if name.endswith("[]"):
        return ts_type(name[:-2]) + "[]"
    if name in {"json", "jsonb"}:
        return "Json"
    if name in {"boolean", "bool"}:
        return "boolean"
    if name in {"smallint", "integer", "bigint", "int2", "int4", "int8", "real", "double precision", "float4", "float8", "numeric"}:
        return "number"
    if name in {"text", "character varying", "varchar", "character", "char", "uuid", "date", "timestamp with time zone", "timestamp without time zone", "timestamptz", "timestamp", "interval", "bytea", "name"}:
        return "string"
    if name == "void":
        return "undefined"
    raise ValueError("Unsupported PostgreSQL type; extend the generator explicitly: " + name)


lines = ["  public: {", "    Tables: {"]
for table in sorted({c["table_name"] for c in columns}):
    fields = [c for c in columns if c["table_name"] == table]
    lines.append(f"      {json.dumps(table)}: {{")
    for section in ["Row", "Insert", "Update"]:
        lines.append(f"        {section}: {{")
        for c in fields:
            nullable = c["is_nullable"] == "YES"
            optional = section == "Update" or (section == "Insert" and (nullable or c["column_default"] is not None or c["is_identity"] == "YES"))
            base = (c["udt_name"][1:] + "[]") if c["data_type"] == "ARRAY" else c["data_type"]
            value = ts_type(base) + (" | null" if nullable else "")
            lines.append(f"          {json.dumps(c['column_name'])}{'?' if optional else ''}: {value}")
        lines.append("        }")
    lines.append("        Relationships: [")
    for fk in [r for r in relations if r["table"] == table]:
        lines.extend([
            "          {",
            f"            foreignKeyName: {json.dumps(fk['name'])}",
            f"            columns: {json.dumps(fk['columns'])}",
            f"            isOneToOne: {str(fk['one']).lower()}",
            f"            referencedRelation: {json.dumps(fk['relation'])}",
            f"            referencedColumns: {json.dumps(fk['references'])}",
            "          },",
        ])
    lines.extend(["        ]", "      }"])
lines.extend(["    }", "    Views: { [_ in never]: never }", "    Functions: {"])
for function in functions:
    lines.append(f"      {json.dumps(function['name'])}: {{")
    if not function["args"]:
        lines.extend(["        Args: never", f"        Returns: {ts_type(function['returns'])}", "      }"])
        continue
    lines.append("        Args: {")
    for index, arg in enumerate(function["args"]):
        optional = index >= len(function["args"]) - function["defaults"]
        lines.append(f"          {json.dumps(arg['name'])}{'?' if optional else ''}: {ts_type(arg['type'])}")
    lines.extend(["        }", f"        Returns: {ts_type(function['returns'])}", "      }"])
lines.extend(["    }", "    Enums: { [_ in never]: never }", "    CompositeTypes: { [_ in never]: never }", "  }"])
target = Path(__file__).resolve().parents[1] / "web/src/server/supabase/database.types.ts"
source = target.read_text()
start = source.index("  public: {")
end = source.index("\n}\n\n", start) + 2
result = source[:start] + "\n".join(lines) + "\n}" + source[end:]
header = "// Public schema generated from the migrated PostgreSQL catalog by scripts/generate-public-types.py.\n"
if not result.startswith(header):
    result = header + result
target.write_text(result)
print(f"Generated {len({c['table_name'] for c in columns})} tables and {len(functions)} RPC signatures.")
