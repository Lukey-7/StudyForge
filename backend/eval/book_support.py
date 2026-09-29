"""Citation support rate of a notebook's book (living textbook, phase 3).

Every paragraph of the book was checked, when it was written, against the passages it cites
(supported / partial / unsupported; see app/book/sync.py::check_support). This script reads those
verdicts from the database (no new LLM calls) and reports them.

    python eval/book_support.py <notebook_id>            # print the numbers
    python eval/book_support.py <notebook_id> --write    # also write eval/book_support.md
    python eval/book_support.py <notebook_id> --check    # first check paragraphs written before the
                                                         # check existed (1 LLM call per section, no rewrite)

Caveat, stated in the report: the checker is the same model family as the writer, so this is a
self-check, not an independent human judgement. It catches paragraphs that drift from their passages;
it cannot catch a passage that is itself wrong.
"""

import argparse
import sys
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent


def measure(repo, notebook_id: str) -> dict:
    sections = sorted(
        repo.select("book_sections", notebook_id=notebook_id), key=lambda s: (s["chapter_index"], s["section_index"])
    )
    rows, total = [], Counter()
    for s in sections:
        counts = Counter(p.get("support", "unchecked") for p in s.get("paragraphs") or [])
        total.update(counts)
        rows.append({"chapter": s["chapter_title"], "title": s["title"], "paragraphs": sum(counts.values()), **counts})
    checked = sum(total.values()) - total["unchecked"]
    return {
        "sections": rows,
        "paragraphs": sum(total.values()),
        "checked": checked,
        "supported": total["supported"],
        "partial": total["partial"],
        "unsupported": total["unsupported"],
        "rate": round(total["supported"] / checked, 3) if checked else None,
    }


def check_unchecked(services, notebook_id: str) -> int:
    """Runs the support check on sections that have unchecked paragraphs. Measures; never rewrites."""
    from app.book.sync import check_support, support_rate

    done = 0
    for s in services.repo.select("book_sections", notebook_id=notebook_id):
        paragraphs = s.get("paragraphs") or []
        if not any(p.get("support", "unchecked") == "unchecked" for p in paragraphs):
            continue
        chunk_ids = list(dict.fromkeys(c for p in paragraphs for c in p.get("chunk_ids", [])))
        passages = services.repo.get_chunks(chunk_ids)
        checked = check_support(
            services.llm, [{"text": p["text"], "chunk_ids": p.get("chunk_ids", [])} for p in paragraphs], passages
        )
        services.repo.update("book_sections", s["id"], {"paragraphs": checked, "support_rate": support_rate(checked)})
        done += 1
    return done


def report(result: dict, title: str) -> str:
    lines = [
        "# Book support rate",
        "",
        f"Notebook: {title} | measured {datetime.now(UTC):%Y-%m-%d %H:%M} UTC | checker: the same Gemini model as the writer",
        "",
        f"**{result['supported']} of {result['checked']} checked paragraphs supported by their own passages "
        f"({(result['rate'] or 0):.0%})**; {result['partial']} partial, {result['unsupported']} unsupported "
        f"(kept in the book with a warning mark).",
        "",
        "| Chapter | Section | Paragraphs | Supported | Partial | Unsupported |",
        "|---|---|---|---|---|---|",
    ]
    for r in result["sections"]:
        counts = " | ".join(str(r.get(k, 0)) for k in ("supported", "partial", "unsupported"))
        lines.append(f"| {r['chapter']} | {r['title']} | {r['paragraphs']} | {counts} |")
    lines += [
        "",
        "Caveat: a self-check by the same model family, not a human judgement. It measures whether paragraphs stay",
        "within their cited passages; it says nothing about whether the passages themselves are right.",
    ]
    return "\n".join(lines) + "\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("notebook_id")
    parser.add_argument("--write", action="store_true", help="write eval/book_support.md")
    parser.add_argument("--check", action="store_true", help="check unchecked paragraphs first (LLM calls)")
    args = parser.parse_args()
    sys.path.insert(0, str(EVAL_DIR.parent))
    from app.config import get_settings
    from app.services import build_services

    services = build_services(get_settings())
    notebook = next((n for n in services.repo.select("notebooks") if n["id"] == args.notebook_id), None)
    if notebook is None:
        sys.exit("notebook not found")
    if args.check:
        print(f"checked {check_unchecked(services, args.notebook_id)} sections")
    result = measure(services.repo, args.notebook_id)
    text = report(result, notebook["title"])
    print(text)
    if args.write:
        (EVAL_DIR / "book_support.md").write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()
