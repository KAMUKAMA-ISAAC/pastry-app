"""Minimal Mongo-shaped async document store, backed by Postgres (JSONB).

The rest of the backend was written against Motor's API (find/find_one,
insert_one/insert_many, update_one/update_many, delete_one/delete_many,
count_documents, create_index, find_one_and_update, and one aggregate call).
Rather than rewrite ~190 call sites and their query shapes, this module
implements just enough of that surface — backed by asyncpg and one Postgres
table per "collection" (a `pk text primary key` + `doc jsonb` table) — so the
application code is unchanged and now talks to Postgres instead of MongoDB.

Only the filter/update operators actually used by this codebase are
supported: $ne, $in, $nin, $gte, $gt, $lte, $regex/$options, $or, $expr
(binary $gt on two field refs), and updates via $set/$inc.
"""
import asyncio
import json
import re
import uuid
from types import SimpleNamespace

import asyncpg

_SAFE_NAME = re.compile(r"[^a-z0-9_]")


def _safe_name(name: str) -> str:
    return _SAFE_NAME.sub("_", name.lower())


def _to_text(value):
    if isinstance(value, bool):
        return "true" if value else "false"
    if value is None:
        return None
    return str(value)


def _extract_pk(doc: dict) -> str:
    if doc.get("_id") is not None:
        return str(doc["_id"])
    if doc.get("id") is not None:
        return str(doc["id"])
    return str(uuid.uuid4())


def _apply_update_ops(doc: dict, update: dict):
    for k, v in (update.get("$set") or {}).items():
        doc[k] = v
    for k, v in (update.get("$inc") or {}).items():
        doc[k] = (doc.get(k) or 0) + v


def _apply_projection(doc: dict, projection):
    if not projection:
        return dict(doc)
    include_keys = [k for k, v in projection.items() if k != "_id" and v]
    if include_keys:
        return {k: doc[k] for k in include_keys if k in doc}
    exclude_keys = {k for k, v in projection.items() if not v}
    return {k: v for k, v in doc.items() if k not in exclude_keys}


def _ph(params: list, value) -> str:
    params.append(value)
    return f"${len(params)}"


_OPMAP = {"$gt": ">", "$gte": ">=", "$lt": "<", "$lte": "<="}


def _build_expr(expr: dict, params: list) -> str:
    op, operands = next(iter(expr.items()))

    def resolve(x):
        if isinstance(x, str) and x.startswith("$"):
            return f"(doc->>{_ph(params, x[1:])})::numeric"
        return f"{_ph(params, x)}::numeric"

    left, right = operands
    return f"{resolve(left)} {_OPMAP[op]} {resolve(right)}"


def _build_field_cond(field: str, val, params: list) -> str:
    # Lazy: only spend a bind param on the field name if a condition actually
    # references it (an empty $in/$nin short-circuits to a constant instead).
    _fx_cache = {}

    def fx():
        if "v" not in _fx_cache:
            _fx_cache["v"] = f"doc->>{_ph(params, field)}"
        return _fx_cache["v"]

    if isinstance(val, dict) and any(k.startswith("$") for k in val):
        conds = []
        if "$regex" in val:
            conds.append(f"{fx()} ~* {_ph(params, val['$regex'])}")
        if "$ne" in val:
            conds.append(f"{fx()} IS DISTINCT FROM {_ph(params, _to_text(val['$ne']))}")
        if "$in" in val:
            items = val["$in"]
            conds.append("FALSE" if not items else
                         f"{fx()} = ANY({_ph(params, [_to_text(v) for v in items])}::text[])")
        if "$nin" in val:
            items = val["$nin"]
            if items:
                conds.append(f"NOT ({fx()} = ANY({_ph(params, [_to_text(v) for v in items])}::text[]))")
        if "$gte" in val:
            conds.append(f"{fx()} >= {_ph(params, _to_text(val['$gte']))}")
        if "$gt" in val:
            conds.append(f"{fx()} > {_ph(params, _to_text(val['$gt']))}")
        if "$lte" in val:
            conds.append(f"{fx()} <= {_ph(params, _to_text(val['$lte']))}")
        return " AND ".join(conds) if conds else "TRUE"
    return f"{fx()} = {_ph(params, _to_text(val))}"


def build_where(filt: dict, params: list) -> str:
    if not filt:
        return "TRUE"
    parts = []
    for key, val in filt.items():
        if key == "$or":
            parts.append("(" + " OR ".join(f"({build_where(sub, params)})" for sub in val) + ")")
        elif key == "$expr":
            parts.append(_build_expr(val, params))
        else:
            parts.append(_build_field_cond(key, val, params))
    return " AND ".join(parts) if parts else "TRUE"


class Cursor:
    def __init__(self, coll: "Collection", filt, projection):
        self.coll = coll
        self.filt = filt or {}
        self.projection = projection
        self._sort = None
        self._skip = 0
        self._limit = None

    def sort(self, field, direction: int = 1):
        self._sort = (field, direction)
        return self

    def skip(self, n: int):
        self._skip = n
        return self

    def limit(self, n: int):
        self._limit = n
        return self

    async def _fetch(self, cap=None):
        pool = await self.coll._pool()
        params = []
        sql = f"SELECT doc FROM {self.coll.table} WHERE {build_where(self.filt, params)}"
        if self._sort:
            field, direction = self._sort
            sql += f" ORDER BY doc->>{_ph(params, field)} {'DESC' if direction == -1 else 'ASC'} NULLS LAST"
        limit = self._limit
        if cap is not None:
            limit = cap if limit is None else min(limit, cap)
        if limit is not None:
            sql += f" LIMIT {int(limit)}"
        if self._skip:
            sql += f" OFFSET {int(self._skip)}"
        rows = await pool.fetch(sql, *params)
        return [_apply_projection(r["doc"], self.projection) for r in rows]

    async def to_list(self, length=None):
        return await self._fetch(cap=length)

    def __aiter__(self):
        return self._agen()

    async def _agen(self):
        for doc in await self._fetch():
            yield doc


class AggregateCursor:
    """Supports exactly the one pipeline shape this app uses:
    [{"$match": {...}}, {"$group": {"_id": "$field", "n": {"$sum": 1}}}]
    """

    def __init__(self, coll: "Collection", pipeline: list):
        self.coll = coll
        self.pipeline = pipeline

    def __aiter__(self):
        return self._agen()

    async def _agen(self):
        pool = await self.coll._pool()
        match_filter, group_field, sum_key = {}, None, "n"
        for stage in self.pipeline:
            if "$match" in stage:
                match_filter = stage["$match"]
            elif "$group" in stage:
                g = stage["$group"]
                gid = g.get("_id")
                if isinstance(gid, str) and gid.startswith("$"):
                    group_field = gid[1:]
                for k, v in g.items():
                    if k != "_id" and isinstance(v, dict) and "$sum" in v:
                        sum_key = k
        params = []
        where = build_where(match_filter, params)
        field_ph = _ph(params, group_field)
        rows = await pool.fetch(
            f"SELECT doc->>{field_ph} AS gid, COUNT(*) AS n FROM {self.coll.table} "
            f"WHERE {where} GROUP BY doc->>{field_ph}", *params)
        for r in rows:
            yield {"_id": r["gid"], sum_key: r["n"]}


class Collection:
    def __init__(self, database: "Database", name: str):
        self.database = database
        self.name = name
        self.table = f"col_{_safe_name(name)}"

    async def _pool(self):
        await self.database._ensure_table(self.name)
        return await self.database._get_pool()

    def find(self, filt=None, projection=None) -> Cursor:
        return Cursor(self, filt, projection)

    async def find_one(self, filt=None, projection=None):
        results = await Cursor(self, filt, projection).limit(1).to_list(1)
        return results[0] if results else None

    async def insert_one(self, doc: dict):
        pool = await self._pool()
        pk = _extract_pk(doc)
        await pool.execute(f"INSERT INTO {self.table} (pk, doc) VALUES ($1, $2)", pk, doc)
        return SimpleNamespace(inserted_id=pk)

    async def insert_many(self, docs: list):
        pool = await self._pool()
        rows = [(_extract_pk(d), d) for d in docs]
        await pool.executemany(f"INSERT INTO {self.table} (pk, doc) VALUES ($1, $2)", rows)
        return SimpleNamespace(inserted_ids=[r[0] for r in rows])

    async def _upsert(self, filt: dict, update: dict, pool):
        base = {k: v for k, v in filt.items() if not k.startswith("$") and not isinstance(v, dict)}
        newdoc = dict(base)
        _apply_update_ops(newdoc, update)
        pk = _extract_pk(newdoc)
        await pool.execute(
            f"INSERT INTO {self.table} (pk, doc) VALUES ($1, $2) "
            f"ON CONFLICT (pk) DO UPDATE SET doc = EXCLUDED.doc", pk, newdoc)
        return pk, newdoc

    async def update_one(self, filt: dict, update: dict, upsert: bool = False):
        return await self._update(filt, update, upsert, many=False)

    async def update_many(self, filt: dict, update: dict, upsert: bool = False):
        return await self._update(filt, update, upsert, many=True)

    async def _update(self, filt: dict, update: dict, upsert: bool, many: bool):
        pool = await self._pool()
        params = []
        where = build_where(filt, params)
        limit_sql = "" if many else " LIMIT 1"
        rows = await pool.fetch(f"SELECT pk, doc FROM {self.table} WHERE {where}{limit_sql}", *params)
        if not rows:
            if upsert:
                pk, _ = await self._upsert(filt, update, pool)
                return SimpleNamespace(matched_count=0, modified_count=0, upserted_id=pk)
            return SimpleNamespace(matched_count=0, modified_count=0)
        for r in rows:
            newdoc = dict(r["doc"])
            _apply_update_ops(newdoc, update)
            await pool.execute(f"UPDATE {self.table} SET doc = $1 WHERE pk = $2", newdoc, r["pk"])
        return SimpleNamespace(matched_count=len(rows), modified_count=len(rows))

    async def find_one_and_update(self, filt: dict, update: dict, upsert: bool = False,
                                   return_document: bool = False):
        pool = await self._pool()
        params = []
        where = build_where(filt, params)
        rows = await pool.fetch(f"SELECT pk, doc FROM {self.table} WHERE {where} LIMIT 1", *params)
        if not rows:
            if upsert:
                _, newdoc = await self._upsert(filt, update, pool)
                return newdoc if return_document else None
            return None
        before = dict(rows[0]["doc"])
        after = dict(before)
        _apply_update_ops(after, update)
        await pool.execute(f"UPDATE {self.table} SET doc = $1 WHERE pk = $2", after, rows[0]["pk"])
        return after if return_document else before

    async def delete_one(self, filt: dict):
        pool = await self._pool()
        params = []
        where = build_where(filt, params)
        rows = await pool.fetch(f"SELECT pk FROM {self.table} WHERE {where} LIMIT 1", *params)
        if not rows:
            return SimpleNamespace(deleted_count=0)
        await pool.execute(f"DELETE FROM {self.table} WHERE pk = $1", rows[0]["pk"])
        return SimpleNamespace(deleted_count=1)

    async def delete_many(self, filt: dict):
        pool = await self._pool()
        params = []
        where = build_where(filt, params)
        result = await pool.execute(f"DELETE FROM {self.table} WHERE {where}", *params)
        n = int(result.split()[-1]) if result else 0
        return SimpleNamespace(deleted_count=n)

    async def count_documents(self, filt=None):
        pool = await self._pool()
        params = []
        where = build_where(filt or {}, params)
        row = await pool.fetchrow(f"SELECT COUNT(*) AS n FROM {self.table} WHERE {where}", *params)
        return row["n"]

    async def create_index(self, keys, unique: bool = False):
        pool = await self._pool()
        if isinstance(keys, str):
            keys = [(keys, 1)]
        expr = ", ".join(f"(doc->>'{_safe_name(k)}')" for k, _ in keys)
        idx_name = f"idx_{self.table}_" + "_".join(_safe_name(k) for k, _ in keys)
        await pool.execute(
            f"CREATE {'UNIQUE ' if unique else ''}INDEX IF NOT EXISTS {idx_name} ON {self.table} ({expr})")

    def aggregate(self, pipeline: list) -> AggregateCursor:
        return AggregateCursor(self, pipeline)


class Database:
    def __init__(self, dsn: str):
        self.dsn = dsn
        self._pool = None
        self._pool_lock = asyncio.Lock()
        self._tables = set()
        self._tables_lock = asyncio.Lock()

    async def _get_pool(self):
        if self._pool is None:
            async with self._pool_lock:
                if self._pool is None:
                    async def _init(conn):
                        await conn.set_type_codec(
                            "jsonb", encoder=json.dumps, decoder=json.loads,
                            schema="pg_catalog", format="text")
                    self._pool = await asyncpg.create_pool(self.dsn, init=_init, min_size=1, max_size=10)
        return self._pool

    async def _ensure_table(self, name: str):
        if name in self._tables:
            return
        pool = await self._get_pool()
        async with self._tables_lock:
            if name in self._tables:
                return
            table = f"col_{_safe_name(name)}"
            await pool.execute(f"CREATE TABLE IF NOT EXISTS {table} (pk TEXT PRIMARY KEY, doc JSONB NOT NULL)")
            self._tables.add(name)

    def __getattr__(self, name: str) -> Collection:
        if name.startswith("_"):
            raise AttributeError(name)
        return Collection(self, name)

    def __getitem__(self, name: str) -> Collection:
        return Collection(self, name)

    async def close(self):
        if self._pool is not None:
            await self._pool.close()
            self._pool = None
