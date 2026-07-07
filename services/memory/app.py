"""RescueOps++ Cognee memory service.

A small FastAPI wrapper around Cognee that owns the project's *semantic memory*
and writes its generated knowledge graph into the SAME Neo4j instance the code
graph lives in (Cognee creates its own node labels — Entity, TextDocument,
DocumentChunk, … — so it never collides with :Function/:Test/:Runbook).

Two jobs:
  1. Knowledge (Integration 1): runbook / postmortem docs -> Cognee -> Neo4j,
     recalled at diagnosis time as GraphRAG hits.
  2. Episodic memory (Integration 3): past incident + fix + outcome episodes,
     so the autonomous agent remembers prior fixes across restarts and across
     the disposable Daytona verify sandboxes.

The responder calls this over HTTP and always falls back to its built-in
runbook substrate when this service is absent — so the service is optional.

Cognee graph backend: https://docs.cognee.ai (GRAPH_DATABASE_PROVIDER=neo4j).
Embeddings: Nebius Token Factory (OpenAI-compatible) via EMBEDDING_* env.
"""

from __future__ import annotations

import logging
import os
from typing import Any

from fastapi import FastAPI
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s memory %(levelname)s %(message)s")
log = logging.getLogger("memory")

# Dataset namespaces inside Cognee (kept separate so knowledge recall never
# returns raw incident episodes and vice-versa).
KNOWLEDGE_DATASET = os.environ.get("COGNEE_KNOWLEDGE_DATASET", "rescueops_runbooks")
EPISODE_DATASET = os.environ.get("COGNEE_EPISODE_DATASET", "rescueops_incidents")


def _configure_cognee() -> None:
    """Point Cognee's graph store at the shared Neo4j and its LLM/embeddings at
    the OpenAI-compatible gateways. Reads env; also sets graph config explicitly
    so a misconfigured provider fails loudly at boot instead of silently using
    the local default store."""
    import cognee

    neo4j_url = os.environ.get("GRAPH_DATABASE_URL") or os.environ.get("NEO4J_URL") or os.environ.get("NEO4J_URI")
    neo4j_user = os.environ.get("GRAPH_DATABASE_USERNAME") or os.environ.get("NEO4J_USERNAME") or os.environ.get("NEO4J_USER") or "neo4j"
    neo4j_pass = os.environ.get("GRAPH_DATABASE_PASSWORD") or os.environ.get("NEO4J_PASSWORD") or ""

    cognee.config.set_graph_db_config(
        {
            "graph_database_provider": "neo4j",
            "graph_database_url": neo4j_url,
            "graph_database_username": neo4j_user,
            "graph_database_password": neo4j_pass,
        }
    )
    log.info("cognee graph backend -> neo4j %s (user=%s)", neo4j_url, neo4j_user)


app = FastAPI(title="RescueOps++ Memory (Cognee)")
_ready = {"cognee": False, "error": None}


@app.on_event("startup")
async def _startup() -> None:
    try:
        _configure_cognee()
        _ready["cognee"] = True
    except Exception as exc:  # noqa: BLE001 — surface any config failure via /health
        _ready["error"] = str(exc)
        log.exception("cognee configuration failed")


class Doc(BaseModel):
    title: str
    text: str


class IngestRequest(BaseModel):
    documents: list[Doc]
    dataset: str | None = None


class RecallRequest(BaseModel):
    query: str
    top_k: int = 3
    dataset: str | None = None


class RememberRequest(BaseModel):
    root_cause: str | None = None
    failing_tests: list[str] = Field(default_factory=list)
    fix_path: str | None = None
    fix_summary: str | None = None
    verified: bool | None = None
    pr_url: str | None = None


@app.get("/health")
async def health() -> dict[str, Any]:
    return {
        "ok": _ready["cognee"],
        "cognee": _ready["cognee"],
        "error": _ready["error"],
        "knowledge_dataset": KNOWLEDGE_DATASET,
        "episode_dataset": EPISODE_DATASET,
    }


@app.post("/ingest")
async def ingest(req: IngestRequest) -> dict[str, Any]:
    """Add docs to Cognee and cognify them into the Neo4j knowledge graph."""
    dataset = req.dataset or KNOWLEDGE_DATASET
    try:
        import cognee

        for doc in req.documents:
            await cognee.add(f"# {doc.title}\n\n{doc.text}", dataset_name=dataset)
        await cognee.cognify(datasets=[dataset])
        log.info("ingested %d docs into %s", len(req.documents), dataset)
        return {"ok": True, "ingested": len(req.documents), "dataset": dataset}
    except Exception as exc:  # noqa: BLE001 — ingestion is optional; responder keeps local runbooks
        log.warning("ingest failed dataset=%s docs=%d: %s", dataset, len(req.documents), exc)
        return {"ok": False, "error": str(exc), "ingested": 0, "dataset": dataset}


@app.post("/recall")
async def recall(req: RecallRequest) -> dict[str, Any]:
    """GraphRAG recall over the Cognee knowledge graph for a diagnosis query."""
    dataset = req.dataset or KNOWLEDGE_DATASET
    try:
        import cognee
        from cognee import SearchType

        results = await cognee.search(
            query_text=req.query,
            query_type=SearchType.GRAPH_COMPLETION,
            datasets=[dataset],
            top_k=req.top_k,
        )
    except Exception as exc:  # noqa: BLE001 — recall is best-effort; responder falls back
        log.warning("recall failed: %s", exc)
        return {"ok": False, "error": str(exc), "hits": []}
    hits = [str(r) for r in (results or [])][: req.top_k]
    return {"ok": True, "hits": hits, "dataset": dataset}


@app.post("/remember")
async def remember(req: RememberRequest) -> dict[str, Any]:
    """Persist one incident+fix episode as long-term memory in Neo4j."""
    lines = [
        f"Incident root cause: {req.root_cause or 'unknown'}.",
        f"Failing tests: {', '.join(req.failing_tests) if req.failing_tests else 'none recorded'}.",
    ]
    if req.fix_path:
        lines.append(f"Applied fix in {req.fix_path}.")
    if req.fix_summary:
        lines.append(f"Fix approach: {req.fix_summary}")
    if req.verified is not None:
        lines.append(f"Verified in sandbox: {req.verified}.")
    if req.pr_url:
        lines.append(f"Shipped as PR {req.pr_url}.")
    episode = " ".join(lines)

    try:
        import cognee

        await cognee.add(episode, dataset_name=EPISODE_DATASET)
        await cognee.cognify(datasets=[EPISODE_DATASET])
        log.info("remembered incident root_cause=%s", req.root_cause)
        return {"ok": True, "dataset": EPISODE_DATASET}
    except Exception as exc:  # noqa: BLE001 — memory is optional; shipping must not fail
        log.warning("remember failed root_cause=%s: %s", req.root_cause, exc)
        return {"ok": False, "error": str(exc), "dataset": EPISODE_DATASET}
