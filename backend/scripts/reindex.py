"""Rebuild the Chroma index from Postgres (the source of truth).

Use after changing EMBEDDING_MODEL/EMBEDDING_DIM, or if the Chroma folder is lost:
    cd backend && python -m scripts.reindex            # every source that is 'ready'
    python -m scripts.reindex --notebook <notebook_id>
No re-extraction or re-chunking happens: passages, concepts, claims and book sections are
re-embedded from what Postgres stores (see app/reindex.py).
"""

import argparse
import logging

from app.config import get_settings
from app.main import setup_logging
from app.reindex import _notebook_ids, rebuild_notebook
from app.services import build_services


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--notebook", help="only this notebook id")
    args = parser.parse_args()

    settings = get_settings()
    setup_logging(settings.log_level)
    services = build_services(settings)
    services.require_ai()
    log = logging.getLogger("reindex")

    notebook_ids = [args.notebook] if args.notebook else _notebook_ids(services)
    for notebook_id in notebook_ids:
        log.info("reindexed notebook %s: %s", notebook_id, rebuild_notebook(services, notebook_id))


if __name__ == "__main__":
    main()
