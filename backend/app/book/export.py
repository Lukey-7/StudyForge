"""Export the book (plan phase 4): Markdown with footnote citations, and EPUB 3.

Both are built from the same assembled structure, so they always say the same thing. PDF is the
browser's "Save as PDF" on the print view (a print stylesheet), which needs no server library.
"""

import html
import io
import re
import zipfile
from datetime import UTC, datetime

from app.book.index import book_index
from app.db.repository import Row
from app.services import Services


def assemble(services: Services, notebook: Row) -> dict:
    """Chapters -> sections -> paragraphs with numbered citations, code and steps, plus the
    glossary and the index (numbered like the export: written sections only)."""
    repo, notebook_id = services.repo, notebook["id"]
    sections = sorted(
        repo.select("book_sections", notebook_id=notebook_id), key=lambda s: (s["chapter_index"], s["section_index"])
    )
    chunk_ids = list(dict.fromkeys(c for s in sections for p in s.get("paragraphs") or [] for c in p.get("chunk_ids", [])))
    chunks = {c["id"]: c for c in repo.get_chunks(chunk_ids)}
    sources = {s["id"]: s["file_name"] for s in repo.list_sources(notebook_id)}

    notes: dict[str, int] = {}  # chunk id -> footnote number, in order of first use
    chapters: list[dict] = []
    for s in sections:
        if not s.get("paragraphs"):
            continue
        if not chapters or chapters[-1]["title"] != s["chapter_title"]:
            chapters.append({"title": s["chapter_title"], "sections": []})
        paragraphs = []
        for p in s["paragraphs"]:
            refs = [notes.setdefault(c, len(notes) + 1) for c in p.get("chunk_ids", []) if c in chunks]
            paragraphs.append({"text": p["text"], "refs": refs, "support": p.get("support", "unchecked")})
        extras = s.get("extras") or {}
        chapters[-1]["sections"].append(
            {
                "title": s["title"],
                "paragraphs": paragraphs,
                "steps_title": extras.get("steps_title", ""),
                "steps": extras.get("steps") or [],
                "code": extras.get("code_examples") or [],
            }
        )

    footnotes = []
    for chunk_id, number in notes.items():
        chunk = chunks[chunk_id]
        where = sources.get(chunk["source_id"], "source") + (f", p. {chunk['page']}" if chunk.get("page") else "")
        footnotes.append({"number": number, "where": where})
    concepts = sorted(repo.select("concepts", notebook_id=notebook_id), key=lambda c: (c["kind"] != "term", c["name"].lower()))
    glossary = [{"name": c["name"], "definition": c["definition"], "kind": c["kind"]} for c in concepts]
    written = [s for s in sections if s.get("paragraphs")]
    index = book_index(written, repo.select("concepts", notebook_id=notebook_id))
    return {"title": notebook["title"], "chapters": chapters, "footnotes": footnotes, "glossary": glossary, "index": index}


def _index_line(entry: dict) -> str:
    if entry.get("see"):
        return f"{entry['term']}, see {entry['see']}"
    refs = ", ".join(f"**{r['number']}**" if r["main"] else r["number"] for r in entry["sections"])
    return f"{entry['term']}: {refs}"


def to_markdown(book: dict) -> str:
    lines = [f"# {book['title']}", "", f"*Written by StudyForge from your sources, {datetime.now(UTC):%d %B %Y}.*", ""]
    for ci, chapter in enumerate(book["chapters"], start=1):
        lines += [f"## {ci}. {chapter['title']}", ""]
        for si, section in enumerate(chapter["sections"], start=1):
            lines += [f"### {ci}.{si} {section['title']}", ""]
            for p in section["paragraphs"]:
                marks = "".join(f"[^{n}]" for n in p["refs"])
                warn = " *(not fully backed by its passages)*" if p["support"] in ("partial", "unsupported") else ""
                lines += [f"{p['text']}{marks}{warn}", ""]
            if section.get("steps"):
                lines += [f"**{section['steps_title'] or 'Steps'}**", ""]
                lines += [f"{i}. {step}" for i, step in enumerate(section["steps"], start=1)]
                lines.append("")
            for code in section.get("code") or []:
                label = "From your sources" if code["from_sources"] else "Illustrative example (not from your sources)"
                lines += [f"*{code['caption']}* ({label})", "", f"```{code['language']}", code["code"], "```", ""]
    if book["glossary"]:
        lines += ["## Glossary", ""]
        lines += [f"- **{g['name']}**: {g['definition']}" for g in book["glossary"]]
        lines.append("")
    if book.get("index"):
        lines += ["## Index", "", "*Section numbers; bold = where the term is taught.*", ""]
        lines += [f"- {_index_line(e)}" for e in book["index"]]
        lines.append("")
    lines += [f"[^{f['number']}]: {f['where']}" for f in book["footnotes"]]
    return "\n".join(lines).rstrip() + "\n"


CONTAINER_XML = (
    '<?xml version="1.0"?><container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles>'
    '<rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>'
)
OPF_HEAD = (
    '<?xml version="1.0" encoding="utf-8"?><package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">'
)


def _x(text: str) -> str:
    return html.escape(text, quote=True)


def _xhtml(title: str, body: str) -> str:
    return (
        '<?xml version="1.0" encoding="utf-8"?>\n<!DOCTYPE html>\n'
        '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" lang="en">'
        f"<head><title>{_x(title)}</title></head><body>{body}</body></html>"
    )


def to_epub(book: dict, book_id: str) -> bytes:
    """A minimal valid EPUB 3: one XHTML file per chapter, a glossary, a notes page and nav."""
    files: list[tuple[str, str]] = []  # (href, title)
    out = io.BytesIO()
    with zipfile.ZipFile(out, "w") as z:
        z.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", compress_type=zipfile.ZIP_STORED)  # must be first
        z.writestr(
            "META-INF/container.xml",
            CONTAINER_XML,
        )
        for ci, chapter in enumerate(book["chapters"], start=1):
            body = [f"<h1>{ci}. {_x(chapter['title'])}</h1>"]
            for si, section in enumerate(chapter["sections"], start=1):
                body.append(f"<h2>{ci}.{si} {_x(section['title'])}</h2>")
                for p in section["paragraphs"]:
                    refs = "".join(f'<sup><a href="notes.xhtml#n{n}">{n}</a></sup>' for n in p["refs"])
                    body.append(f"<p>{_x(p['text'])}{refs}</p>")
                if section.get("steps"):
                    items = "".join(f"<li>{_x(step)}</li>" for step in section["steps"])
                    body.append(f"<p><b>{_x(section['steps_title'] or 'Steps')}</b></p><ol>{items}</ol>")
                for code in section.get("code") or []:
                    label = "From your sources" if code["from_sources"] else "Illustrative example"
                    body.append(f"<p><i>{_x(code['caption'])}</i> ({label})</p><pre><code>{_x(code['code'])}</code></pre>")
            href = f"chapter{ci}.xhtml"
            z.writestr(f"OEBPS/{href}", _xhtml(chapter["title"], "".join(body)))
            files.append((href, f"{ci}. {chapter['title']}"))
        glossary = "".join(f"<dt>{_x(g['name'])}</dt><dd>{_x(g['definition'])}</dd>" for g in book["glossary"])
        z.writestr("OEBPS/glossary.xhtml", _xhtml("Glossary", f"<h1>Glossary</h1><dl>{glossary}</dl>"))
        files.append(("glossary.xhtml", "Glossary"))
        index = "".join(f"<li>{_x(_index_line(e)).replace('**', '')}</li>" for e in book.get("index") or [])
        z.writestr("OEBPS/index.xhtml", _xhtml("Index", f"<h1>Index</h1><ul>{index}</ul>"))
        files.append(("index.xhtml", "Index"))
        notes = "".join(f'<li id="n{f["number"]}">{_x(f["where"])}</li>' for f in book["footnotes"])
        z.writestr("OEBPS/notes.xhtml", _xhtml("Sources", f"<h1>Sources</h1><ol>{notes}</ol>"))
        files.append(("notes.xhtml", "Sources"))
        nav = "".join(f'<li><a href="{href}">{_x(title)}</a></li>' for href, title in files)
        z.writestr("OEBPS/nav.xhtml", _xhtml("Contents", f'<nav epub:type="toc"><h1>Contents</h1><ol>{nav}</ol></nav>'))
        manifest = '<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>' + "".join(
            f'<item id="f{i}" href="{href}" media-type="application/xhtml+xml"/>' for i, (href, _) in enumerate(files)
        )
        spine = "".join(f'<itemref idref="f{i}"/>' for i in range(len(files)))
        modified = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")
        z.writestr(
            "OEBPS/content.opf",
            OPF_HEAD + '<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">'
            f'<dc:identifier id="id">urn:uuid:{_x(book_id)}</dc:identifier><dc:title>{_x(book["title"])}</dc:title>'
            f'<dc:language>en</dc:language><meta property="dcterms:modified">{modified}</meta></metadata>'
            f"<manifest>{manifest}</manifest><spine>{spine}</spine></package>",
        )
    return out.getvalue()


def filename(title: str, ext: str) -> str:
    return (re.sub(r"[^A-Za-z0-9]+", "-", title).strip("-").lower() or "book") + f".{ext}"
