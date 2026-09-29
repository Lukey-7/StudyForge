"""Rebuild the Chroma index from Postgres (the source of truth).

Use after changing EMBEDDING_MODEL/EMBEDDING_DIM, or if the Chroma folder is lost:
    cd backend && python -m scripts.reindex            # every source that is 'ready'
    python -m scripts.reindex --notebook <notebook_id>
No re-extraction or re-chunking happens: chunk text is read from the `chunks` table.
"""

import argparse
import logging

from app.config import get_settings
from app.ingest.embed import embed_and_index
from app.main import setup_logging
from app.services import build_services


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--notebook", help="only this notebook id")
    args = parser.parse_args()

    settings = get_settings()
    setup_logging(settings.log_level)
    services = build_services(settings)
    _, embedder = services.require_ai()
    log = logging.getLogger("reindex")

    notebook_ids = [args.notebook] if args.notebook else sorted({s["notebook_id"] for s in _all_sources(services)})
    for notebook_id in notebook_ids:
        for source in services.repo.list_sources(notebook_id):
            if source["status"] != "ready":
                continue
            rows = services.repo.list_chunks(notebook_id, [source["id"]])
            services.vectors.delete_source(source["id"])
            model = embed_and_index(rows, embedder, services.vectors, source["file_name"])
            services.repo.update_source(source["id"], {"embedding_model": model})
            log.info("reindexed %s (%d chunks) with %s", source["file_name"], len(rows), model)


def _all_sources(services) -> list[dict]:
    repo = services.repo
    if hasattr(repo, "t"):  # local JSON repository
        return list(repo.t["sources"].values())
    return repo.client.table("sources").select("id, notebook_id").execute().data


if __name__ == "__main__":
    main()
